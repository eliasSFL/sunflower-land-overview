// Bare-specifier modules from the sunflower-land submodule now resolve
// via tsconfig `paths` (declared in tsconfig.app.json) into the
// referenced `tsconfig.sunflower-land.json` project, which emits `.d.ts`
// declarations with real types. Only the still-stubbed transitive deps
// need ambient any declarations here.

// src/* is too generic to put in tsconfig paths (would collide with
// "src/" being our own root prefix in various tools), so keep it as
// ambient. It's only used by a handful of submodule type files.
declare module "src/*";
