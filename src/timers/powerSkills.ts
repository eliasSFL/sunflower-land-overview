import {
  getPowerSkills,
  getSkillCooldown,
  type BumpkinRevampSkillName,
  type BumpkinSkillRevamp,
  type GameState,
} from "../game/index.ts";
import { CHROME_ICONS } from "../lib/assets.ts";
import type { Timer, TimerContext } from "./types.ts";

// One Timer per unlocked power skill that has a cooldown defined.
// `getPowerSkills` returns every entry in BUMPKIN_REVAMP_SKILL_TREE with
// `power: true`; we filter to the ones the player has actually unlocked
// (`bumpkin.skills[name]` is truthy) and to ones with a non-zero
// cooldown — skills without a cooldown are always usable, so a "ready
// at" countdown adds no signal.
//
// readyAt is `previousPowerUseAt[name] + boostedCooldown` (the same
// formula PowerSkills.tsx uses for its in-game "next use" label).
// `getSkillCooldown` applies the Luna's Crescent boost (×0.5). Skills
// the player has never used have no `previousPowerUseAt` entry, so they
// resolve to `0 + cooldown` — i.e. already ready, which is correct.
//
// Each skill is its own card — `Power Skills|<name>` — so unique names
// pass straight through the aggregator. Push notifications wire up
// automatically: the worker reads `t.category` into the per-subscription
// mute list, and the scheduler fires when readyAt elapses.

export function extractPowerSkillTimers(
  state: GameState,
  _ctx: TimerContext,
): Timer[] {
  const bumpkin = state.bumpkin;
  if (!bumpkin) return [];

  const { skills, previousPowerUseAt } = bumpkin;
  const out: Timer[] = [];

  for (const skill of getPowerSkills() as BumpkinSkillRevamp[]) {
    const name = skill.name as BumpkinRevampSkillName;

    if (!skills[name]) continue;

    const cooldown = skill.requirements.cooldown ?? 0;
    if (cooldown <= 0) continue;

    const boostedCooldown = getSkillCooldown({ cooldown, state });
    const readyAt = (previousPowerUseAt?.[name] ?? 0) + boostedCooldown;

    out.push({
      id: `power-skill:${name}`,
      category: "Power Skills",
      label: name,
      icon: skill.image ?? CHROME_ICONS.lightning,
      readyAt,
      aggregationKey: `Power Skills|${name}`,
    });
  }

  return out;
}
