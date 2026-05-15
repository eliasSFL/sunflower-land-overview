import { listOptedInIds, markSynced } from "./registry.ts";
import { mintFarmKey } from "./communityApi.ts";
import type { Env } from "./types.ts";

const UPSTREAM = "https://api.sunflower-land.com";
// Upstream's legacy `POST /community/farms { ids }` form accepts max
// 100 ids per request. We use the same cap.
const BATCH_SIZE = 100;
// Small pause between batches to stay under the 5 s baseline-IP
// throttle window on the backend.
const PER_BATCH_DELAY_MS = 250;
const MAX_BACKOFF_MS = 60_000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type BatchBody = {
  farms: Record<string, { id: number } & Record<string, unknown>>;
  // Farm IDs the backend declined to return (account deletion,
  // blacklist, etc). We log but don't retry within a single sweep —
  // the next sweep tries again.
  skipped?: number[];
};

type BatchResult =
  | { ok: true; body: BatchBody }
  | { ok: false; retryable: true; status: number }
  | { ok: false; retryable: false; status: number };

async function fetchBatch(
  ids: number[],
  apiKey: string,
): Promise<BatchResult> {
  let res: Response;
  try {
    // Legacy id-form endpoint is `POST /community/getFarms`, NOT
    // `/community/farms` (which is the un-deprecated paginated GET).
    res = await fetch(`${UPSTREAM}/community/getFarms`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
      },
      body: JSON.stringify({ ids }),
    });
  } catch {
    return { ok: false, retryable: true, status: 0 };
  }
  if (!res.ok) {
    // 429 + 5xx = backend overload, retry. Other 4xx = bug/auth, abort.
    const retryable = res.status === 429 || res.status >= 500;
    const text = await res.text().catch(() => "");
    console.warn(
      `coordinator: upstream ${res.status} for POST /community/getFarms (${ids.length} ids) :: ${text.slice(0, 300)}`,
    );
    return { ok: false, retryable, status: res.status };
  }
  try {
    const body = (await res.json()) as BatchBody;
    return { ok: true, body };
  } catch {
    return { ok: false, retryable: false, status: 0 };
  }
}

// Runs from the Worker's `scheduled()` handler every 10 min and on
// demand via POST /push/sweep.
//
//   1. Read every opted-in farmId from D1.
//   2. Chunk into batches of 100.
//   3. POST each batch to /community/farms { ids } (the deprecated
//      legacy path; un-deprecated paginated version doesn't accept
//      id filters and would require a full-DB scan).
//   4. Fan-out each returned farm to its FarmPushDO via /onSnapshot.
//
// 40k subscribers → 400 batches × ~1 s each = ~7 min worst case, well
// inside the 25-min wall-clock budget per sweep tick.
export async function sweep(env: Env): Promise<void> {
  const startedAt = Date.now();

  if (!env.SFL_COMMUNITY_API_KEY) {
    console.warn("coordinator: SFL_COMMUNITY_API_KEY missing; skipping sweep");
    return;
  }

  const optedInList = await listOptedInIds(env);
  if (optedInList.length === 0) return;

  const apiKey = await mintFarmKey(0, env.SFL_COMMUNITY_API_KEY);

  // Chunk into batches.
  const batches: number[][] = [];
  for (let i = 0; i < optedInList.length; i += BATCH_SIZE) {
    batches.push(optedInList.slice(i, i + BATCH_SIZE));
  }

  let totalFetched = 0;
  let totalSkipped = 0;
  const synced: number[] = [];
  let backoffMs = 0;
  let batchIdx = 0;

  // 25-min cap; cron fires every 10 min so this leaves 5-min headroom.
  const deadline = startedAt + 25 * 60 * 1000;

  while (batchIdx < batches.length && Date.now() < deadline) {
    if (backoffMs > 0) await sleep(backoffMs);
    else if (batchIdx > 0) await sleep(PER_BATCH_DELAY_MS);

    const ids = batches[batchIdx];
    const res = await fetchBatch(ids, apiKey);

    if (!res.ok) {
      if (res.retryable) {
        backoffMs = Math.min(Math.max(backoffMs * 2, 2_000), MAX_BACKOFF_MS);
        continue; // retry the same batch
      }
      console.warn(
        `coordinator: batch failed permanently with status ${res.status}; aborting sweep`,
      );
      break;
    }
    backoffMs = 0;

    const { farms, skipped } = res.body;
    const entries = Object.entries(farms);
    totalFetched += entries.length;
    totalSkipped += (skipped ?? []).length;

    // Fan-out concurrently within a batch. Errors on individual DOs
    // don't abort siblings — Promise.allSettled swallows rejections.
    await Promise.allSettled(
      entries.map(async ([id, raw]) => {
        const stub = env.FARM_PUSH_DO.get(
          env.FARM_PUSH_DO.idFromName(String(id)),
        );
        await stub.fetch("https://do/onSnapshot", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(raw),
        });
      }),
    );

    synced.push(...entries.map(([id]) => Number(id)));
    batchIdx++;
  }

  if (synced.length > 0) {
    await markSynced(env, synced, startedAt).catch(() => {});
  }

  console.log(
    `coordinator: fetched=${totalFetched} skipped=${totalSkipped} ` +
      `batches=${batchIdx}/${batches.length} ms=${Date.now() - startedAt}`,
  );
}
