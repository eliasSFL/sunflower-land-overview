import type { FarmResponse } from "../api/fetchFarm.ts";
import {
  getBumpkinLevel,
  getExperienceToNextLevel,
  hasLifetimeFarmerBanner,
  hasVipAccess,
  isMaxLevel,
  MAX_BUMPKIN_LEVEL,
  type FactionName,
  type InventoryItemName,
  type IslandType,
} from "../game/index.ts";
import { useNow } from "../hooks/useNow.ts";
import { CHROME_ICONS } from "../lib/assets.ts";
import { formatYield } from "../lib/format.ts";
import { BUMPKIN_SECTION_ID } from "./sectionId.ts";
import { InnerPanel, Label, ProgressBar } from "./ui/index.ts";

const ISLAND_ICONS: Record<IslandType, string> = {
  basic: CHROME_ICONS.island_basic,
  spring: CHROME_ICONS.island_spring,
  desert: CHROME_ICONS.island_desert,
  volcano: CHROME_ICONS.island_volcano,
};

const ISLAND_LABELS: Record<IslandType, string> = {
  basic: "Basic",
  spring: "Spring",
  desert: "Desert",
  volcano: "Volcano",
};

const FACTION_EMBLEMS: Record<FactionName, string> = {
  sunflorians: CHROME_ICONS.sunflorian_emblem,
  bumpkins: CHROME_ICONS.bumpkin_emblem,
  goblins: CHROME_ICONS.goblin_emblem,
  nightshades: CHROME_ICONS.nightshade_emblem,
};

const FACTION_LABELS: Record<FactionName, string> = {
  sunflorians: "Sunflorians",
  bumpkins: "Bumpkins",
  goblins: "Goblins",
  nightshades: "Nightshades",
};

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

function formatVipExpiry(ms: number): string {
  return new Date(ms).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function getInventoryAmount(
  inventory: FarmResponse["farm"]["inventory"],
  name: InventoryItemName,
): number {
  const decimal = inventory[name];
  if (!decimal) return 0;
  return decimal.toNumber();
}

export function BumpkinSummaryPanel({ data }: Props) {
  const farm = data.farm;
  const bumpkin = farm.bumpkin;

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
  const socialPoints = farm.socialFarming?.points ?? 0;
  const weeklySocialPoints = farm.socialFarming?.weeklyPoints?.points ?? 0;

  const farmId = data.id;
  const nftId = data.nft_id ?? data.nftId;
  const username = farm.username;
  const islandType = farm.island?.type;
  const factionName = farm.faction?.name;

  // VIP visibility uses `hasVipAccess` (the upstream gate) so a trial,
  // active subscription, or Lifetime Farmer Banner all qualify — and
  // expired subscriptions don't. The label text then distinguishes
  // "Lifetime" from a dated subscription so the player can tell which
  // they have.
  const now = useNow(60_000);
  const isVip = hasVipAccess({ game: farm, now, type: "full" });
  const isLifetimeVip = hasLifetimeFarmerBanner(farm);
  const vipExpiresAt = farm.vip?.expiresAt;
  const vipLabel = isLifetimeVip
    ? "Lifetime"
    : vipExpiresAt && vipExpiresAt > now
      ? `Expires ${formatVipExpiry(vipExpiresAt)}`
      : "VIP";

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

      {/* Identity row — username (if set) and Farm ID always shown;
          NFT ID gets its own info chip when the farm is minted. */}
      <div className="flex flex-col gap-1 text-xs">
        <div className="flex items-center justify-between gap-2 min-w-0">
          <Label type="default" className="truncate">
            {username ? `@${username}` : "No username"}
          </Label>
          <Label type="default" className="shrink-0 tabular-nums">
            Farm #{farmId}
          </Label>
        </div>
        {nftId ? (
          <div className="flex">
            <Label type="info">NFT #{nftId}</Label>
          </div>
        ) : null}
      </div>

      {/* Chips row — island / faction / VIP. Each is optional; the row
          collapses to nothing on a brand-new farm with no faction and
          no VIP. */}
      {islandType || factionName || isVip ? (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 ml-2">
          {islandType ? (
            <Label type="default" icon={ISLAND_ICONS[islandType]}>
              {ISLAND_LABELS[islandType]}
            </Label>
          ) : null}
          {factionName ? (
            <Label type="default" icon={FACTION_EMBLEMS[factionName]}>
              {FACTION_LABELS[factionName]}
            </Label>
          ) : null}
          {isVip ? (
            <Label type="warning" icon={CHROME_ICONS.vip}>
              {vipLabel}
            </Label>
          ) : null}
        </div>
      ) : null}

      {/* XP progress bar — mirrors the in-game HUD style: level_up icon
          beside the shared `ProgressBar` chrome. */}
      <div className="flex items-center gap-1">
        <img
          src={CHROME_ICONS.level_up}
          alt=""
          aria-hidden
          className="h-5 w-5 shrink-0 object-contain"
          style={{ imageRendering: "pixelated" }}
        />
        <ProgressBar pct={pct} className="flex-1" />
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
        <CurrencyRow
          icon={CHROME_ICONS.social_score}
          label="Social Score"
          amount={socialPoints}
        />
        <CurrencyRow
          icon={CHROME_ICONS.cheer}
          label="This Week"
          amount={weeklySocialPoints}
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
