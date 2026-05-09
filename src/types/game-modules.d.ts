// Ambient stubs for the merged sunflower-land game source.
// Vite resolves these specifiers to ./sunflower-land/src/... at build time
// (see vite.config.ts), but we deliberately do NOT type-check the game tree
// from the overview repo — the game uses different tsconfig settings and
// pulls in many runtime deps (classnames, @xstate/react, @react-spring/web,
// asset modules) that the overview doesn't carry.
//
// Game modules are treated as `any` here; we wrap them with narrow types in
// src/lib/yields.ts at the consumption boundary.
declare module "features/*";
declare module "lib/*";
declare module "components/*";
declare module "metadata/*";
declare module "src/*";
