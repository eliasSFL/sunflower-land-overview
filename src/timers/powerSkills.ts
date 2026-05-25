import {
  getBoostIcon,
  getPowerSkills,
  getSkillCooldown,
  type BumpkinRevampSkillName,
  type BumpkinSkillRevamp,
  type GameState,
} from "../game/index.ts";
import type { Timer, TimerContext } from "./types.ts";

// Short human label for a fixed cooldown duration ("3d", "60h", "24h").
// Presentation only — NOT the game's `millisecondsToString`, which pulls
// in the i18n `translate` helper (stubbed to raw keys in the worker
// build). Cooldowns are whole hours today; the minute/second fallbacks
// keep it honest if upstream ever ships a finer-grained one.
function formatCooldown(ms: number): string {
  const totalMinutes = Math.round(ms / 60000);
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;
  if (days > 0 && hours === 0 && minutes === 0) return `${days}d`;
  if (totalMinutes % 60 === 0) return `${Math.floor(totalMinutes / 60)}h`;
  if (totalMinutes < 60) return `${totalMinutes}m`;
  return `${Math.floor(totalMinutes / 60)}h ${minutes}m`;
}

// One Timer per unlocked power skill that has a cooldown. We mirror the
// in-game PowerSkills panel exactly: the next-available timestamp is
//   (bumpkin.previousPowerUseAt[name] ?? 0) + getSkillCooldown({ ... })
// where getSkillCooldown applies the cooldown boost (Luna's Crescent
// halves it). `readyAt` in the past ≡ ready (a skill never used has no
// `previousPowerUseAt` entry, so it falls back to 0 and reads as ready).
//
// The three fertiliser power skills (Sprout Surge, Root Rocket,
// Blend-tastic) have no cooldown — they're gated on fertiliser stock,
// not time — so they never produce a countdown and are skipped here.
//
// We deliberately do NOT call `powerSkillDisabledConditions` to grey out
// a ready-but-not-actionable skill (e.g. "no crops growing"): its reason
// strings come back as raw i18n keys in the worker build, and the
// dashboard is a countdown view, not a "should I use it now" prompt.

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

    // Only skills the player has unlocked, matching the in-game panel's
    // `powerSkillsUnlocked` filter.
    if (!skills[name]) continue;

    const cooldown = skill.requirements.cooldown ?? 0;
    if (cooldown <= 0) continue;

    const boostedCooldown = getSkillCooldown({ cooldown, state });
    const readyAt = (previousPowerUseAt?.[name] ?? 0) + boostedCooldown;

    out.push({
      id: `power-skill:${name}`,
      category: "Power Skills",
      label: name,
      icon: getBoostIcon(name, state),
      readyAt,
      subtext: `${formatCooldown(boostedCooldown)} cooldown`,
      aggregationKey: `Power Skills|${name}`,
    });
  }

  return out;
}
