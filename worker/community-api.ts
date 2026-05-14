// Wraps `POST https://api.sunflower-land.com/community/getFarms` with
// the shared community API key. The upstream supports an `ids` body
// param (deprecated but still honored) that takes up to 100 farmIds
// and returns a `{ farms: Record<id, GameState> }` map — perfect for
// the scheduler's batched fetch.

const UPSTREAM = "https://api.sunflower-land.com";

export const MAX_BATCH = 100;

export type FarmsResponse = {
  farms: Record<string, unknown>;
  skipped?: number[];
};

export async function getFarmsBatch(
  apiKey: string,
  ids: number[],
): Promise<FarmsResponse | null> {
  if (ids.length === 0) return { farms: {} };
  if (ids.length > MAX_BATCH) {
    throw new Error(`getFarmsBatch: max ${MAX_BATCH} ids per call`);
  }
  const res = await fetch(`${UPSTREAM}/community/getFarms`, {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "content-type": "application/json",
    },
    body: JSON.stringify({ ids }),
  });
  if (res.status === 429) return null;
  if (!res.ok) {
    throw new Error(`getFarmsBatch ${res.status}: ${await res.text()}`);
  }
  return (await res.json()) as FarmsResponse;
}
