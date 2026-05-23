import type { GameState } from "../game/index.ts";
import { aggregateTimers } from "./aggregate.ts";
import { extractBeehiveTimers } from "./beehives.ts";
import { extractCropTimers } from "./crops.ts";
import { extractCropMachineTimers } from "./cropMachine.ts";
import { extractFlowerTimers } from "./flowers.ts";
import { extractFruitTimers } from "./fruits.ts";
import { extractGreenhouseTimers } from "./greenhouse.ts";
import { extractAgingShedTimers } from "./agingShed.ts";
import { extractAnimalTimers } from "./animals.ts";
import { extractAnimalLoveTimers } from "./animalLove.ts";
import { extractComposterTimers } from "./composters.ts";
import { extractCookingTimers } from "./cooking.ts";
import { extractCrabTrapTimers } from "./crabTraps.ts";
import { extractCraftingBoxTimers } from "./craftingBox.ts";
import { extractLavaPitTimers } from "./lavaPits.ts";
import { extractPowerSkillTimers } from "./powerSkills.ts";
import { extractResourceTimers } from "./resources.ts";
import { extractSaltTimers } from "./salt.ts";
import type { AggregatedTimer, Timer, TimerContext } from "./types.ts";

export type {
  Timer,
  AggregatedTimer,
  Category,
  Status,
  TimerContext,
} from "./types.ts";
export {
  CATEGORY_ORDER,
  COOKING_BUILDING_CATEGORIES,
  AGING_RACK_CATEGORIES,
  PLACEMENT_GATED_CATEGORIES,
  statusOf,
} from "./types.ts";
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
    ...extractCropMachineTimers(state, ctx),
    ...extractFlowerTimers(state, ctx),
    ...extractBeehiveTimers(state, ctx),
    ...extractAnimalTimers(state, ctx),
    ...extractAnimalLoveTimers(state, ctx),
    ...extractCookingTimers(state, ctx),
    ...extractComposterTimers(state, ctx),
    ...extractAgingShedTimers(state, ctx),
    ...extractCraftingBoxTimers(state, ctx),
    ...extractResourceTimers(state, ctx),
    ...extractSaltTimers(state, ctx),
    ...extractLavaPitTimers(state, ctx),
    ...extractCrabTrapTimers(state, ctx),
    ...extractPowerSkillTimers(state, ctx),
  ];
}

export function extractAndAggregate(
  state: GameState,
  farmId: number,
  now: number,
): AggregatedTimer[] {
  return aggregateTimers(extractAllTimers(state, farmId, now));
}
