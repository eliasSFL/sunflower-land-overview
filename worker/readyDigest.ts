// Ready-now "digest" planner for state-based collectables (salt nodes,
// beehives). These differ from event-based timers (crops, cooking) in two
// ways the per-instance alarm path handles badly:
//
//   1. Their "ready" is a *sustained state*, not a discrete moment. A
//      full beehive or a maxed salt node sits ready until the player
//      collects it. The extractor stamps `readyAt = now` for that state
//      (there's no deterministic future timestamp), so the worker's
//      `${aggKey}@${readyAt}` fire key churns every sweep — re-firing the
//      same "Honey ready" push every ~10 min as the cron picks up a new
//      snapshot. (This is the every-10-min honey bug.)
//
//   2. Each node/hive carries its own `aggregationKey` (so the dashboard
//      shows one card each), which means six maxed salt nodes fan out to
//      six separate pushes instead of one "6 salt nodes ready".
//
// This planner replaces the per-instance alarm path for any timer that
// declares `notifyDigest`. It groups the currently-ready members by their
// `group`, fires ONE push per group for the members that became ready
// since the last snapshot, and dedups by the member's stable key (no
// `readyAt`) so a sitting-ready item notifies once and stays quiet until
// it leaves the ready set (collected → refilling) and comes back.

// Round yield amounts to 2 dp, stripping trailing zeros so bodies don't
// show float garbage like "4.8000000002". Mirrors the same helper in
// farmPushDO.ts (kept local to avoid an import cycle — farmPushDO imports
// this module, not the other way around).
function formatAmount(n: number): string {
  return parseFloat(n.toFixed(2)).toString();
}

// One ready-state collectable observed in a snapshot. `key` is the
// timer's stable `aggregationKey` and the dedup identity; `ready` is the
// extractor's "there's something to collect right now" signal.
export type DigestMember = {
  key: string;
  group: string;
  noun: string;
  ready: boolean;
  icon?: string;
  category: string;
  amount: number;
  item?: string;
};

// A single grouped push to schedule. Shape mirrors the fields the worker
// hands to `schedule(1, "fireTimer", …)`.
export type DigestFire = {
  fireKey: string;
  group: string;
  title: string;
  body: string;
  icon?: string;
  category: string;
  count: number;
  // The stable keys of the members this fire announces (the ones newly
  // marked in `nextSeen` this run). The worker un-marks exactly these if
  // scheduling the fire fails, so a transient error doesn't leave them
  // deduped-but-never-notified. Carried-over members (already notified in
  // a prior run) are not included — they must stay seen.
  memberKeys: string[];
};

export type PlanResult = {
  fires: DigestFire[];
  nextSeen: Record<string, number>;
};

function pluralNoun(noun: string, count: number): string {
  return count === 1 ? noun : `${noun}s`;
}

function buildFire(
  group: string,
  members: DigestMember[],
  now: number,
): DigestFire {
  const count = members.length;
  const noun = members[0].noun;
  const category = members[0].category;
  const icon = members[0].icon;

  // Sum the wave's yield when every member reports the same item, so the
  // body reads "30 Salt · Salt" / "3.6 Honey · Beehives". Mixed or
  // missing items fall back to the bare group label.
  const items = new Set(members.map((m) => m.item).filter(Boolean));
  const total = members.reduce((sum, m) => sum + m.amount, 0);
  const item = items.size === 1 ? [...items][0] : undefined;
  const body =
    item && total > 0 ? `${formatAmount(total)} ${item} · ${group}` : group;

  return {
    // The members' stable keys already gate dedup (via `nextSeen`); the
    // fire key only needs to be unique per emitted push so `fireTimer`'s
    // own `notified` guard doesn't swallow it. `now` + group does that.
    fireKey: `digest:${group}@${now}`,
    group,
    title: `${count} ${pluralNoun(noun, count)} ready`,
    body,
    icon,
    category,
    count,
    memberKeys: members.map((m) => m.key),
  };
}

// Pure planner. Given the digest members observed this snapshot and the
// `seen` map from the prior snapshot, returns the pushes to fire and the
// next `seen` map.
//
// `seedOnly` (subscribe path): record currently-ready members without
// firing, so enabling notifications on a farm with a backlog of full
// hives / maxed nodes doesn't blast a wall of pushes.
export function planReadyDigest(
  members: DigestMember[],
  seen: Record<string, number>,
  now: number,
  opts?: { seedOnly?: boolean },
): PlanResult {
  const readyKeys = new Set(members.filter((m) => m.ready).map((m) => m.key));

  // Carry over seen entries that are STILL ready — that's what keeps a
  // sitting-ready item deduped. Anything no longer ready (collected,
  // refilling, or vanished from the snapshot) drops out, so it can fire
  // again next time it becomes ready.
  const nextSeen: Record<string, number> = {};
  for (const [k, ts] of Object.entries(seen)) {
    if (readyKeys.has(k)) nextSeen[k] = ts;
  }

  // Bucket the newly-ready members (ready, not already seen) by group.
  const byGroup = new Map<string, DigestMember[]>();
  for (const m of members) {
    if (!m.ready) continue;
    if (m.key in nextSeen) continue;
    const list = byGroup.get(m.group);
    if (list) list.push(m);
    else byGroup.set(m.group, [m]);
  }

  const fires: DigestFire[] = [];
  for (const [group, news] of byGroup) {
    for (const m of news) nextSeen[m.key] = now;
    if (opts?.seedOnly) continue;
    fires.push(buildFire(group, news, now));
  }

  return { fires, nextSeen };
}
