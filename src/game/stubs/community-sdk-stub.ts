// Stub that replaces the submodule's
// `features/community/lib/CommunitySDK.ts` at module-resolution time.
//
// The original upstream returns an anonymous class with private fields
// from `prepareAPI`. That trips TS4094 during the composite project's
// declaration emit ("Property 'apiKey' of exported anonymous class type
// may not be private or protected"). Our composite has `noCheck: true`,
// but declaration emit happens regardless and TS4094 is an emit error,
// not a type-check error.
//
// Why this lives here, not via a build-time patch of the submodule:
// touching the submodule's working tree is against the boundary rule —
// the submodule must be read-only. Instead, vite.config.ts + tsconfig
// `paths` redirect the `features/community/lib/CommunitySDK` import to
// this stub. The on-disk submodule file is never read, and the
// composite project no longer emits a .d.ts for the broken anonymous
// class.
//
// Functional behavior: nothing in our `src/` actually invokes
// `prepareAPI`. The only consumer in the submodule is
// `features/world/Phaser.tsx`, which is also unused by the overview.
// So the stub just needs to satisfy the import's type shape — every
// method returns a benign default.

export function prepareAPI(_args: {
  jwt: string;
  farmId: number;
  gameService: unknown;
}) {
  return class CommunityAPI {
    constructor(_init: { id: string; apiKey: string }) {}
    get game(): unknown {
      return undefined;
    }
    get user() {
      return { farmId: 0 };
    }
    async loadIsland(): Promise<null> {
      return null;
    }
    async saveProgress(_args: { metadata: string }): Promise<{
      updatedAt?: number;
    }> {
      return {};
    }
    async mint(_args: {
      metadata?: string;
      items: Record<string, number>;
      wearables: unknown;
    }): Promise<{ updatedAt?: number }> {
      return {};
    }
    async burn(_args: {
      metadata?: string;
      items: Record<string, number>;
      sfl: number;
    }): Promise<{ updatedAt?: number }> {
      return {};
    }
    async reset(): Promise<void> {}
  };
}
