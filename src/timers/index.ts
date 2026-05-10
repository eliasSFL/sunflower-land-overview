import type { GameState } from "../game/index.ts";
import { aggregateTimers } from "./aggregate.ts";
import { extractCropTimers } from "./crops.ts";
import { extractFruitTimers } from "./fruits.ts";
import { extractGreenhouseTimers } from "./greenhouse.ts";
import type { AggregatedTimer, Timer, TimerContext } from "./types.ts";

export type {
  Timer,
  AggregatedTimer,
  Category,
  Status,
  TimerContext,
} from "./types.ts";
export { CATEGORY_ORDER, statusOf } from "./types.ts";
export { aggregateTimers } from "./aggregate.ts";

export function extractAllTimers(
  state: GameState,
  farmId: number,
  now: number,
): Timer[] {
  let n = 0;
  const ctx: TimerContext = {
    farmId,
    now,
    counter: { next: () => n++ },
  };

  return [
    ...extractCropTimers(state, ctx),
    ...extractFruitTimers(state, ctx),
    ...extractGreenhouseTimers(state, ctx),
  ];
}

export function extractAndAggregate(
  state: GameState,
  farmId: number,
  now: number,
): AggregatedTimer[] {
  return aggregateTimers(extractAllTimers(state, farmId, now));
}
