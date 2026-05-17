import { type GameState, TEAM_USERNAMES } from "../game/index.ts";

export type FeatureFlag = (game: GameState) => boolean;

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

// Tune as the active-farm count drifts — fraction is `target / population`.
const POPULATION_ESTIMATE = 200_000;

/**
 * Deterministic ~`target` farms per feature. Salted with `featureName`
 * so each limited-access feature samples a *different* cohort — a player
 * who lands in one won't automatically land in the next. Same farm always
 * gets the same answer for the same feature (no flicker).
 *
 * Client-side only — anyone can monkey-patch the bundle. Use to hide UI
 * from most players, not as a security boundary.
 */
const sampledByFarm =
  (featureName: string, target: number): FeatureFlag =>
  (game) => {
    const id = game.bumpkin?.id;
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
  LIMITED_ONLY_ACCESS: (game) =>
    betaFeatureFlag(game) || sampledByFarm("LIMITED_ONLY_ACCESS", 100)(game),
} satisfies Record<string, FeatureFlag>;

export type OverviewFeatureName = keyof typeof OVERVIEW_FEATURE_FLAGS;

export const hasOverviewAccess = (game: GameState, name: OverviewFeatureName) =>
  OVERVIEW_FEATURE_FLAGS[name](game);
