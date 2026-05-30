import { describe, expect, it, vi } from "vitest";

// Stub the asset module so the icon resolves to a deterministic string
// (the real one runs import.meta.glob over the submodule asset tree).
vi.mock("../lib/assets.ts", () => ({
  CHROME_ICONS: { telegram: "icon:telegram" },
}));

import { extractQuestTimers } from "./quests.ts";
import type { GameState } from "../game/index.ts";
import type { TimerContext } from "./types.ts";

const NOW = Date.UTC(2026, 5, 15, 12, 0, 0);
const HOUR_MS = 60 * 60 * 1000;

const ctx: TimerContext = {
  farmId: 1,
  now: NOW,
  counter: { next: () => 0 },
};

// `telegram.quest` isn't on the FE GameState type (backend-written), so
// fixtures cast through unknown — mirrors how the extractor reads it.
function stateWithQuest(quest: unknown): GameState {
  return {
    telegram: { linkedAt: NOW - HOUR_MS, quest },
  } as unknown as GameState;
}

describe("extractQuestTimers", () => {
  it("emits nothing when there is no telegram quest", () => {
    // Farm that never started the bot — the section stays hidden via
    // event-gating.
    expect(extractQuestTimers({} as GameState, ctx)).toEqual([]);
    expect(
      extractQuestTimers({ telegram: { linkedAt: NOW } } as GameState, ctx),
    ).toEqual([]);
  });

  it("emits nothing when startAt is missing/non-numeric", () => {
    // Defensive: the field is untyped, so guard against a malformed shape.
    expect(extractQuestTimers(stateWithQuest({ name: "x" }), ctx)).toEqual([]);
  });

  it("maps quest.startAt onto readyAt (cooldown → countdown)", () => {
    const startAt = NOW + 7 * HOUR_MS;
    const result = extractQuestTimers(
      stateWithQuest({ name: "cornwell-quiz", startAt }),
      ctx,
    );
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      id: "telegram-daily-quest",
      category: "Quests",
      label: "Telegram daily quest",
      icon: "icon:telegram",
      readyAt: startAt,
      // Slug prettified to a display hint (real title is backend-only).
      subtext: "Cornwell Quiz",
      pushTitle: "Telegram daily quest ready",
    });
  });

  it("uses the same shape when the quest is available now (startAt past)", () => {
    const startAt = NOW - HOUR_MS;
    const result = extractQuestTimers(
      stateWithQuest({ name: "whispers-in-the-wind", startAt }),
      ctx,
    );
    // readyAt <= now → TimerCard renders it as "Ready"; no separate state
    // needed in the extractor.
    expect(result[0].readyAt).toBe(startAt);
    expect(result[0].subtext).toBe("Whispers In The Wind");
  });

  it("tolerates a non-string quest name without throwing", () => {
    // `name` is an untyped backend field — a malformed (non-string) value
    // must not make prettifyQuestName throw and take down the whole pass.
    const result = extractQuestTimers(
      stateWithQuest({ name: 123, startAt: NOW + HOUR_MS }),
      ctx,
    );
    expect(result).toHaveLength(1);
    expect(result[0].subtext).toBeUndefined();
  });
});
