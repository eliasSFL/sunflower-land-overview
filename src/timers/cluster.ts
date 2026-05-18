// Group a sorted list of {readyAt, amount} pairs into clusters using a
// sliding window: each cluster grows while the next readyAt is within
// `windowMs` of the *previous* readyAt (not the cluster's head). So a
// player who plants 5 pots ~5s apart over 20s lands in one cluster,
// but two plantings an hour apart split cleanly into two.
//
// Each cluster's `amount` is the sum of its members' amounts — used
// by the notification scheduler to render the per-wave yield in the
// push body instead of suppressing it.
//
// Used by the notification scheduler to coalesce per-instance ripening
// alarms into one push per ripening "wave". See the AggregatedTimer
// `instances` field in src/timers/types.ts and the scheduler in
// worker/farmPushDO.ts.

export type ReadyCluster = { readyAt: number; count: number; amount: number };

export function clusterReadyAts(
  sorted: Array<{ readyAt: number; amount: number }>,
  windowMs: number,
): ReadyCluster[] {
  if (sorted.length === 0) return [];
  const out: ReadyCluster[] = [];
  let head = sorted[0].readyAt;
  let prev = head;
  let count = 1;
  let amount = sorted[0].amount;
  for (let i = 1; i < sorted.length; i++) {
    const v = sorted[i];
    if (v.readyAt - prev <= windowMs) {
      count += 1;
      amount += v.amount;
      prev = v.readyAt;
    } else {
      out.push({ readyAt: head, count, amount });
      head = v.readyAt;
      prev = v.readyAt;
      count = 1;
      amount = v.amount;
    }
  }
  out.push({ readyAt: head, count, amount });
  return out;
}
