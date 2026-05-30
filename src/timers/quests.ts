import type { GameState } from "../game/index.ts";
import { CHROME_ICONS } from "../lib/assets.ts";
import type { Timer, TimerContext } from "./types.ts";

// Daily Telegram quest cooldown.
//
// The quest itself is a backend + Telegram-bot feature: the player is
// served a question in the bot and answers there. The only thing the
// game state carries — and the only thing we can surface read-only — is
// `telegram.quest = { name, startAt }`:
//   - `startAt <= now` → today's quest is available to play (in Telegram)
//   - `startAt >  now`  → just completed / on cooldown; counts down to the
//                         next quest becoming available
// That maps onto a single timer with `readyAt = startAt`: TimerCard shows
// it as "Ready" once `startAt` passes and as a countdown before then.
//
// IMPORTANT: the quest's human-readable title/description and its reward
// live ONLY in the backend `TELEGRAM_QUESTS` map — they are NOT in the
// payload, and replicating that table here is forbidden (it would rot).
// So the card shows a prettified slug as a hint, not the real quest text.
//
// `telegram.quest` is also NOT modelled on the submodule's GameState type
// (the field is backend-written and absent upstream), but it DOES survive
// into the visit payload — `makeGameForVisit` strips airdrops/auctioneer/
// twitter/… but never `telegram`. We read it through a local shape and
// stay defensive: an upstream rename won't fail our build.

type TelegramQuest = { name: string; startAt: number; choices?: number[] };

// Slug → display hint, e.g. "whispers-in-the-wind" → "Whispers In The
// Wind". Best-effort only; the canonical title is backend-only.
function prettifyQuestName(name: string): string {
  return name
    .split(/[-_]/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export function extractQuestTimers(
  state: GameState,
  _ctx: TimerContext,
): Timer[] {
  const quest = (state.telegram as { quest?: TelegramQuest } | undefined)
    ?.quest;
  if (!quest || typeof quest.startAt !== "number") return [];

  return [
    {
      id: "telegram-daily-quest",
      category: "Quests",
      label: "Telegram daily quest",
      icon: CHROME_ICONS.telegram,
      // Before startAt → countdown to "next quest"; after → "Ready".
      readyAt: quest.startAt,
      // Slug hint only — the real title/description are backend-only.
      subtext: quest.name ? prettifyQuestName(quest.name) : undefined,
      pushTitle: "Telegram daily quest ready",
      pushBody: "Today's quest is ready — play it in Telegram.",
    },
  ];
}
