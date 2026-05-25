import {
  getActiveFloatingIsland,
  getItemIcon,
  getObjectEntries,
  type GameState,
} from "../game/index.ts";
import { CHROME_ICONS } from "../lib/assets.ts";
import { formatYield } from "../lib/format.ts";
import { LOVE_ISLAND_SHOP_SECTION_ID } from "./sectionId.ts";
import { InnerPanel, Label } from "./ui/index.ts";

type Props = {
  state: GameState;
};

// Love Island ("Floating Island") shop overview. Only renders while an
// event window is live — off-season there's nothing to buy. Shows the
// player's Love Charm balance and the items in THEIR shop
// (`state.floatingIsland.shop`, the curated set the buy reducer reads
// from — not the global catalog), flagged by whether they can afford
// each one right now.
//
// Deliberately omits any "already bought" / sold-out state: the in-game
// purchase gate is a per-UTC-day limit checked inline in
// buyFloatingShopItem with no exported helper, so surfacing it here
// would mean re-implementing that gate — which the boundary rule
// forbids (it would silently rot if upstream changed the limit). We
// show affordability only, since that's a plain balance-vs-cost
// comparison over data the shop already carries.
export function LoveIslandShopPanel({ state }: Props) {
  const active = getActiveFloatingIsland({ state });
  if (!active) return null;

  const balance = state.inventory["Love Charm"]?.toNumber() ?? 0;

  const items = getObjectEntries(state.floatingIsland.shop)
    .flatMap(([, item]) => (item ? [item] : []))
    .map((item) => ({
      name: item.name,
      cost: item.cost.items["Love Charm"] ?? 0,
    }))
    .sort((a, b) => a.cost - b.cost);

  return (
    <InnerPanel
      id={LOVE_ISLAND_SHOP_SECTION_ID}
      className="mb-2 flex w-full scroll-mt-4 break-inside-avoid flex-col gap-2"
    >
      <header className="flex items-center justify-between gap-2">
        <Label type="default" icon={CHROME_ICONS.love_charm}>
          Love Island Shop
        </Label>
        <span className="flex items-center gap-1 text-sm whitespace-nowrap">
          <img
            src={CHROME_ICONS.love_charm}
            alt=""
            aria-hidden
            className="h-4 w-4 shrink-0 object-contain"
            style={{ imageRendering: "pixelated" }}
          />
          {formatYield(balance)}
        </span>
      </header>

      {items.length === 0 ? (
        <p className="text-xs opacity-60">Nothing stocked right now.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map(({ name, cost }) => {
            const affordable = balance >= cost;
            return (
              <li
                key={name}
                className="flex items-center justify-between gap-3"
                style={{ opacity: affordable ? 1 : 0.55 }}
              >
                <span className="flex min-w-0 items-center gap-2 text-sm">
                  <img
                    src={getItemIcon(name)}
                    alt=""
                    aria-hidden
                    className="h-5 w-5 shrink-0 object-contain"
                    style={{ imageRendering: "pixelated" }}
                  />
                  <span className="truncate">{name}</span>
                </span>
                <span
                  className="flex shrink-0 items-center gap-1 text-xs whitespace-nowrap tabular-nums"
                  style={{ color: affordable ? undefined : "#e43b44" }}
                >
                  <img
                    src={CHROME_ICONS.love_charm}
                    alt=""
                    aria-hidden
                    className="h-4 w-4 shrink-0 object-contain"
                    style={{ imageRendering: "pixelated" }}
                  />
                  {formatYield(cost)}
                  {affordable ? (
                    <img
                      src={CHROME_ICONS.confirm}
                      alt="Affordable"
                      title="You can afford this"
                      className="ml-0.5 h-4 w-4 shrink-0 object-contain"
                      style={{ imageRendering: "pixelated" }}
                    />
                  ) : null}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </InnerPanel>
  );
}
