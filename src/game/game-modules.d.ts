// Bare-specifier modules from the sunflower-land submodule are not part of
// the overview's TS project graph. We resolve them via Vite aliases at
// build time and treat them as ambient `any` to TypeScript. src/game/ is
// the only directory allowed to import these — every other module imports
// from src/game/* with proper types.

declare module "features/*";
declare module "lib/*";
declare module "components/*";
declare module "metadata/*";
declare module "assets/*";
declare module "src/*";
