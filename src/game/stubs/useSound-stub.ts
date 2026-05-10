// Replaces the submodule's `lib/utils/hooks/useSound` so we don't bundle
// howler. The Button component (and a few others) call `.play()` on the
// returned object — a no-op satisfies the contract.

const noopSound = {
  play: () => undefined,
  stop: () => undefined,
  pause: () => undefined,
  unload: () => undefined,
};

export function useSound(_name?: string) {
  return noopSound;
}
