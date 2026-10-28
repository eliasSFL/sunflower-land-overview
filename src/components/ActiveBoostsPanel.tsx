import { useMemo, useState } from "react";

import {
  getActiveCollectibleBoosts,
  getActiveWearableBoosts,
  getItemIcon,
  type ActiveBoost,
  type BuffLabel,
  type BumpkinItem,
  type GameState,
  type InventoryItemName,
} from "../game/index.ts";
import { CHROME_ICONS } from "../lib/assets.ts";
import { formatRemaining } from "../lib/format.ts";
import { ACTIVE_BOOSTS_SECTION_ID } from "./sectionId.ts";
import { InnerPanel, Label } from "./ui/index.ts";
import type { LabelType } from "./ui/index.ts";

type Props = {
  state: GameState;
  now: number;
};

// Upstream's Label has a few extra palettes our port doesn't carry
// ("vibrant", "formula", "chill", "transparent"). Presentation-only
// fold onto the nearest of ours.
const LABEL_TYPE: Record<BuffLabel["labelType"], LabelType> = {
  default: "default",
  transparent: "default",
  formula: "default",
  success: "success",
  info: "info",
  chill: "info",
  vibrant: "info",
  warning: "warning",
  danger: "danger",
};

// Every boost collectible and wearable currently in effect, with
// upstream's own buff text. Temporary boosters (totems, hourglasses,
// shrines) sit at the top, always expanded, with a countdown to expiry.
// Permanent collectibles and wearables can run to 100+ rows on a
// developed farm, so each folds into an icon roll-up chip (the
// TimerSection pattern) until tapped. Which items count as active, and
// what each says, comes entirely from upstream — see
// src/game/activeBoosts.ts.
export function ActiveBoostsPanel({ state, now }: Props) {
  // Active status only flips when a temporary booster expires, so
  // re-walk the buff tables once a minute rather than on every 1 Hz
  // tick; an expiry inside the minute is filtered at render instead.
  const minute = Math.floor(now / 60_000);
  const { collectibles, wearables } = useMemo(
    () => ({
      collectibles: getActiveCollectibleBoosts(state, minute * 60_000),
      wearables: getActiveWearableBoosts(state),
    }),
    [state, minute],
  );
  const expiring = collectibles.filter(
    (boost) => boost.expiresAt !== undefined && boost.expiresAt > now,
  );
  const permanent = collectibles.filter(
    (boost) => boost.expiresAt === undefined,
  );

  const total = expiring.length + permanent.length + wearables.length;
  if (total === 0) return null;

  return (
    <InnerPanel
      id={ACTIVE_BOOSTS_SECTION_ID}
      className="mb-2 w-full scroll-mt-4 break-inside-auto! box-decoration-clone flex flex-col gap-2"
    >
      <Label type="default" icon={CHROME_ICONS.lightning}>
        Active Boosts · {total}
      </Label>
      <BoostGroup title="Expiring" boosts={expiring} now={now} />
      <BoostGroup
        title="Collectibles"
        boosts={permanent}
        now={now}
        collapsible
      />
      <BoostGroup title="Wearables" boosts={wearables} now={now} collapsible />
    </InnerPanel>
  );
}

function BoostGroup({
  title,
  boosts,
  now,
  collapsible = false,
}: {
  title: string;
  boosts: ActiveBoost<InventoryItemName | BumpkinItem>[];
  now: number;
  collapsible?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  if (boosts.length === 0) return null;
  const rolledUp = collapsible && !expanded;

  return (
    <section className="flex flex-col gap-1">
      <h3 className="text-xs opacity-60">
        {title} · {boosts.length}
      </h3>
      {rolledUp ? (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          title={`Show ${title.toLowerCase()}`}
          className="flex cursor-pointer items-center gap-2 rounded-sm p-1 hover:bg-[#3e8948]/10"
        >
          <span className="flex min-w-0 flex-wrap items-center gap-1">
            {boosts.slice(0, 8).map((boost) => (
              <img
                key={boost.name}
                src={getItemIcon(boost.name)}
                alt=""
                aria-hidden
                className="h-6 w-6 shrink-0 object-contain"
                style={{ imageRendering: "pixelated" }}
              />
            ))}
            {boosts.length > 8 ? (
              <span className="text-xs opacity-70">+{boosts.length - 8}</span>
            ) : null}
          </span>
          <img
            src={CHROME_ICONS.chevron_down}
            alt=""
            aria-hidden
            className="ml-auto h-auto w-5 shrink-0"
            style={{ imageRendering: "pixelated" }}
          />
        </button>
      ) : (
        <ul className="flex flex-col gap-2">
          {boosts.map((boost) => (
            <BoostRow key={boost.name} boost={boost} now={now} />
          ))}
        </ul>
      )}
      {collapsible && expanded ? (
        <button
          type="button"
          onClick={() => setExpanded(false)}
          className="flex cursor-pointer items-center justify-center gap-1 self-center text-xs opacity-70 hover:opacity-100"
        >
          <span>Collapse {title.toLowerCase()}</span>
          <img
            src={CHROME_ICONS.chevron_down}
            alt=""
            aria-hidden
            className="h-auto w-5 shrink-0 rotate-180"
            style={{ imageRendering: "pixelated" }}
          />
        </button>
      ) : null}
    </section>
  );
}

function BoostRow({
  boost,
  now,
}: {
  boost: ActiveBoost<InventoryItemName | BumpkinItem>;
  now: number;
}) {
  const { name, labels, expiresAt } = boost;
  return (
    <li className="flex flex-col gap-1 border-t border-black/10 pt-2 first:border-0 first:pt-0 break-inside-avoid">
      <div className="flex items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-2">
          <img
            src={getItemIcon(name)}
            alt=""
            aria-hidden
            className="h-8 w-8 shrink-0 object-contain"
            style={{ imageRendering: "pixelated" }}
          />
          <span className="text-sm leading-tight">{name}</span>
        </span>
        {expiresAt !== undefined ? (
          <Label type="warning" className="shrink-0 tabular-nums">
            {formatRemaining(expiresAt - now)} left
          </Label>
        ) : null}
      </div>
      <ul className="flex flex-col gap-1 pl-10">
        {labels.map((label, i) => (
          <li key={i}>
            <BuffLine label={label} />
          </li>
        ))}
      </ul>
    </li>
  );
}

function BuffLine({ label }: { label: BuffLabel }) {
  return (
    <Label
      type={LABEL_TYPE[label.labelType]}
      icon={label.boostTypeIcon}
      className={label.boostTypeIcon ? "ml-3" : undefined}
    >
      <span className="flex items-center gap-1">
        {label.shortDescription}
        {label.boostedItemIcon ? (
          <img
            src={label.boostedItemIcon}
            alt=""
            aria-hidden
            className="h-4 w-4 object-contain"
            style={{ imageRendering: "pixelated" }}
          />
        ) : null}
      </span>
    </Label>
  );
}
