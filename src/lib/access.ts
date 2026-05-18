import { type GameState, TEAM_USERNAMES } from "../game/index.ts";

export type FeatureFlagContext = {
  farmId: number;
  isBlacklisted?: boolean;
};
export type FeatureFlag = (
  game: GameState,
  ctx?: FeatureFlagContext,
) => boolean;

const usernameFeatureFlag: FeatureFlag = (game) =>
  TEAM_USERNAMES.map((name) => name.toLowerCase()).includes(
    game.username?.toLowerCase() ?? "",
  );

const betaFeatureFlag: FeatureFlag = ({ inventory }) =>
  !!inventory["Beta Pass"]?.gt(0);

// FNV-1a 32-bit. Cohort assignment only — not security-sensitive.
const fnv1a = (input: string): number => {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
};

// Total farm documents in the database (banned included). The cohort
// fraction is `target / population`; banned farms are filtered out
// inside `sampledByFarm` itself, so the realised non-banned cohort is
// slightly smaller than `target` by the banned share. Refresh this
// value as the active count drifts. 744,180 as of 2026-05-17.
const POPULATION_ESTIMATE = 744_180;

/**
 * Deterministic ~`target` farms per feature. Salted with `featureName`
 * so each limited-access feature samples a *different* cohort — a player
 * who lands in one won't automatically land in the next. Same farm always
 * gets the same answer for the same feature (no flicker).
 *
 * Client-side only — anyone can monkey-patch the bundle. Use to hide UI
 * from most players, not as a security boundary.
 */
export const sampledByFarm =
  (featureName: string, target: number): FeatureFlag =>
  (_game, ctx) => {
    // Banned farms are filtered out of the cohort. POPULATION_ESTIMATE
    // includes banned farms, so the realised non-banned cohort is
    // slightly smaller than `target` (by the banned share).
    if (ctx?.isBlacklisted) return false;
    // Hashed on farmId, not bumpkin.id: bumpkins minted after the NFT
    // sunset all share `bumpkin.id === 1`, so keying on it would collapse
    // the majority of newer signups into one bucket (all in or all out
    // as a block). farmId is unique per farm regardless of origin.
    const id = ctx?.farmId;
    if (id === undefined) return false;
    return (
      fnv1a(`${featureName}:${id}`) / 0x100000000 < target / POPULATION_ESTIMATE
    );
  };

/**
 * Add an entry when working on a new overview feature; delete it on
 * public release. Mirrors upstream `FEATURE_FLAGS` but scoped to the
 * overview (panels, debug UI, experimental extractors).
 */
export const OVERVIEW_FEATURE_FLAGS = {
  TEAM_ONLY_EXAMPLE: usernameFeatureFlag,
  BETA_ONLY_EXAMPLE: betaFeatureFlag,
  LIMITED_ONLY_ACCESS: () => true,
} satisfies Record<string, FeatureFlag>;

export type OverviewFeatureName = keyof typeof OVERVIEW_FEATURE_FLAGS;

export const hasOverviewAccess = (
  game: GameState,
  name: OverviewFeatureName,
  opts: FeatureFlagContext,
) => {
  // Banned/blacklisted farms are denied every overview feature,
  // overriding the per-flag predicate — Beta Pass holders and the
  // sampled cohort are no exception. Short-circuits before
  // `sampledByFarm` runs, so banned farms don't burn cohort slots.
  if (opts.isBlacklisted) return false;
  return OVERVIEW_FEATURE_FLAGS[name](game, opts);
};
