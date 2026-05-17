// Group a sorted list of timestamps into clusters using a sliding
// window: each cluster grows while the next value is within `windowMs`
// of the *previous* value (not the cluster's head). So a player who
// plants 5 pots ~5s apart over 20s lands in one cluster, but two
// plantings an hour apart split cleanly into two.
//
// Used by the notification scheduler to coalesce per-instance ripening
// alarms into one push per ripening "wave". See the AggregatedTimer
// `instances` field in src/timers/types.ts and the scheduler in
// worker/farmPushDO.ts.

export type ReadyCluster = { readyAt: number; count: number };

export function clusterReadyAts(
  sorted: number[],
  windowMs: number,
): ReadyCluster[] {
  if (sorted.length === 0) return [];
  const out: ReadyCluster[] = [];
  let head = sorted[0];
  let prev = head;
  let count = 1;
  for (let i = 1; i < sorted.length; i++) {
    const v = sorted[i];
    if (v - prev <= windowMs) {
      count += 1;
      prev = v;
    } else {
      out.push({ readyAt: head, count });
      head = v;
      prev = v;
      count = 1;
    }
  }
  out.push({ readyAt: head, count });
  return out;
}
