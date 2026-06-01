// Local-only ("offline") dev mode: the flag + farm id. This module is
// deliberately free of the snapshot import so it costs a few bytes to
// bundle anywhere. The heavy snapshot + timer-rebase logic lives in
// `offlineFarmData.ts`, which `fetchFarm` only `await import()`s when the
// flag is on — so production builds (flag unset) tree-shake the ~240 KB
// fixture out entirely.
//
// Mirrors the spirit of the game's own `landData.ts` OFFLINE_FARM, but far
// simpler: the overview has no xstate machine to feed an offline state
// into — `fetchFarm` just returns the snapshot instead of hitting the
// Worker. See `offlineFarmData.ts` for the snapshot itself.

// Flip in `.env` (see `.env.example`): `VITE_OFFLINE_FARM=true`. Drives
// the runtime behaviour in `useFarmData` (auto-load on mount, skip the
// real-farm cache). `fetchFarm`'s offline branch checks the raw literal
// instead of this flag so the bundler can dead-code-eliminate it.
export const IS_OFFLINE_FARM = import.meta.env.VITE_OFFLINE_FARM === "true";

// The captured farm's id. Used to pre-fill / auto-load the dashboard so
// the offline experience needs zero interaction. Matches the snapshot's
// own `id`, so anything keyed on farm id (deliveries, bounties) lines up.
export const OFFLINE_FARM_ID = "128727";
