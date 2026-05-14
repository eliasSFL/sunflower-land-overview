import type { FarmResponse } from "../api/fetchFarm.ts";
import {
  getBumpkinLevel,
  getExperienceToNextLevel,
  isMaxLevel,
  MAX_BUMPKIN_LEVEL,
} from "../game/index.ts";
import { CHROME_ICONS } from "../lib/assets.ts";
import { formatYield } from "../lib/format.ts";
import { BUMPKIN_SECTION_ID } from "./sectionId.ts";
import { InnerPanel, Label } from "./ui/index.ts";

// Compact "who am I" summary shown above the Next Up panel. Reads
// straight off the farm response — no derived state, no polling. The
// XP progress bar uses `getExperienceToNextLevel` so it lines up with
// the in-game bumpkin XP bar (max-level bumpkins display a full bar).

type Props = {
  data: FarmResponse;
};

function formatInt(value: number | bigint): string {
  return Number(value).toLocaleString();
}

function getInventoryAmount(
  inventory: FarmResponse["farm"]["inventory"],
  name: string,
): number {
  const decimal = (inventory as Record<string, { toNumber?: () => number }>)[
    name
  ];
  if (!decimal || typeof decimal.toNumber !== "function") return 0;
  return decimal.toNumber();
}

export function BumpkinSummaryPanel({ data }: Props) {
  const farm = data.farm;
  const bumpkin = farm.bumpkin;
  if (!bumpkin) return null;

  const experience = bumpkin.experience ?? 0;
  const level = getBumpkinLevel(experience);
  const { currentExperienceProgress, experienceToNextLevel } =
    getExperienceToNextLevel(experience);
  const atMax = isMaxLevel(experience);
  const pct =
    experienceToNextLevel > 0
      ? Math.min(
          100,
          Math.max(
            0,
            (currentExperienceProgress / experienceToNextLevel) * 100,
          ),
        )
      : 100;

  const coins = farm.coins ?? 0;
  // `balance` is the on-chain token amount; SFL was renamed to FLOWER
  // in-game but the field name on the save shape stayed the same.
  const flower = farm.balance?.toNumber?.() ?? 0;
  const gems = getInventoryAmount(farm.inventory, "Gem");
  const loveCharms = getInventoryAmount(farm.inventory, "Love Charm");

  return (
    <InnerPanel
      id={BUMPKIN_SECTION_ID}
      className="flex scroll-mt-4 flex-col gap-2"
    >
      <header className="flex items-center justify-between gap-2">
        <Label type="default">Bumpkin</Label>
        <span className="text-xs">
          Level {level}
          {atMax ? " · max" : ""}
        </span>
      </header>

      {/* XP progress bar — mirrors the in-game HUD style.
          - level_up icon + pixel-art bordered bar (progress_bar_border)
          - Fill colour and dark-green track match upstream's
            PROGRESS_COLORS.progress (#63c74d on #193c3e).
          - Border widths from upstream's progressBarBorderStyle:
            2/2/2/3 game px × PIXEL_SCALE 2.625 = 5.25 / 5.25 / 5.25 / 7.875
            CSS px. borderImageSlice keeps the chrome from stretching. */}
      <div className="flex items-center gap-1">
        <img
          src={CHROME_ICONS.level_up}
          alt=""
          aria-hidden
          className="h-5 w-5 shrink-0 object-contain"
          style={{ imageRendering: "pixelated" }}
        />
        <div
          className="relative h-4.5 flex-1"
          style={{
            borderStyle: "solid",
            borderImage: `url(${CHROME_ICONS.progress_bar_border}) 20% 20% 30%`,
            borderLeftWidth: "5.25px",
            borderRightWidth: "5.25px",
            borderTopWidth: "5.25px",
            borderBottomWidth: "7.875px",
            backgroundColor: "#193c3e",
            imageRendering: "pixelated",
          }}
        >
          <div
            className="h-full"
            style={{ width: `${pct}%`, backgroundColor: "#63c74d" }}
            aria-hidden
          />
        </div>
      </div>
      <p className="text-xs opacity-70">
        {atMax
          ? `${formatInt(currentExperienceProgress)} XP this cycle`
          : `${formatInt(currentExperienceProgress)} / ${formatInt(
              experienceToNextLevel,
            )} XP${level < MAX_BUMPKIN_LEVEL ? ` to level ${level + 1}` : ""}`}
      </p>

      {/* Currency rows — coins / FLOWER / Gem / Love Charm. Order
          mirrors the in-game top bar. Each row is icon + amount, kept
          tight so the panel doesn't dominate the sidebar. */}
      <ul className="flex flex-col gap-1">
        <CurrencyRow icon={CHROME_ICONS.coins} label="Coins" amount={coins} />
        <CurrencyRow
          icon={CHROME_ICONS.flower_token}
          label="FLOWER"
          amount={flower}
          fractional
        />
        <CurrencyRow icon={CHROME_ICONS.gem} label="Gem" amount={gems} />
        <CurrencyRow
          icon={CHROME_ICONS.love_charm}
          label="Love Charm"
          amount={loveCharms}
        />
      </ul>
    </InnerPanel>
  );
}

function CurrencyRow({
  icon,
  label,
  amount,
  fractional = false,
}: {
  icon: string;
  label: string;
  amount: number;
  fractional?: boolean;
}) {
  return (
    <li className="flex items-center justify-between gap-2">
      <span className="flex items-center gap-1 min-w-0">
        <img
          src={icon}
          alt=""
          aria-hidden
          className="h-5 w-5 shrink-0 object-contain"
          style={{ imageRendering: "pixelated" }}
        />
        <span className="text-xs truncate">{label}</span>
      </span>
      <span className="text-xs tabular-nums">
        {fractional ? formatYield(amount) : formatInt(amount)}
      </span>
    </li>
  );
}
