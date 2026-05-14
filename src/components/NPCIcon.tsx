import {
  NPC_WEARABLES,
  getAnimatedWebpUrl,
  type NPCName,
} from "../game/index.ts";

// Mirrors the visual core of
// `sunflower-land/src/features/island/bumpkin/components/NPC.tsx`'s
// `NPCIcon` — render the bumpkin's "idle-small" animated webp at a
// fixed size. The upstream component also overlays a front/back aura
// sprite-sheet when the NPC wears an aura wearable; that needs the
// protected-image CDN and a sprite animator, and isn't worth the
// weight for a dashboard avatar — skip it. Falls back silently if the
// CDN 404s.
type Props = {
  npc: NPCName;
  // Pixel dimension of the square icon. Defaults to 32 (h-8 / w-8) so
  // it slots into delivery rows next to text-sm headlines.
  size?: number;
};

export function NPCIcon({ npc, size = 32 }: Props) {
  const parts = NPC_WEARABLES[npc];
  if (!parts) return null;
  const src = getAnimatedWebpUrl(parts, ["idle-small"]);
  return (
    <img
      src={src}
      alt=""
      aria-hidden
      className="shrink-0 object-contain"
      style={{
        width: `${size}px`,
        height: `${size}px`,
        imageRendering: "pixelated",
      }}
    />
  );
}
