import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock the upstream boundary (same pattern as the timer tests): vitest's
// node env doesn't resolve the submodule aliases. The fixtures carry
// their timers on the farm payload itself, so "extraction" is a lookup
// and these tests exercise only the feed shaping and source selection.
vi.mock("../src/game/index.ts", () => ({
  makeGame: vi.fn((farm: unknown) => farm),
}));
vi.mock("../src/timers/index.ts", () => ({
  extractAndAggregate: vi.fn((state: { __timers?: unknown[] | "throw" }) => {
    if (state.__timers === "throw") throw new Error("bad farm");
    return state.__timers ?? [];
  }),
}));

import type { AggregatedTimer } from "../src/timers/types.ts";
import type { Env } from "./types.ts";
import {
  MAX_WIDGET_ITEMS,
  fetchWidgetFeed,
  toWidgetFeed,
  type WidgetFeed,
} from "./widgetFeed.ts";

const NOW = Date.UTC(2026, 10, 18, 12, 0, 0);
const MIN = 60_000;
const ORIGIN = "https://overview.example";
const KEY = "sfl.MTIz.c2lnbmF0dXJl";

function timer(partial: Partial<AggregatedTimer>): AggregatedTimer {
  return {
    id: "t",
    category: "Crops",
    label: "Sunflower",
    readyAt: NOW,
    count: 1,
    ...partial,
  } as unknown as AggregatedTimer;
}

const meta = { farmId: 7, fetchedAt: NOW - MIN, now: NOW, origin: ORIGIN };

describe("toWidgetFeed", () => {
  it("lists ready items first, then upcoming soonest-first", () => {
    const feed = toWidgetFeed(
      [
        timer({ id: "late", readyAt: NOW + 90 * MIN }),
        timer({ id: "ready", category: "Animals", readyAt: NOW - MIN }),
        timer({ id: "soon", readyAt: NOW + 5 * MIN }),
      ],
      meta,
    );
    expect(feed.items.map((i) => i.key)).toEqual(["ready", "soon", "late"]);
    expect(feed.total).toBe(3);
    expect(feed).toMatchObject({ v: 1, farmId: 7, fetchedAt: NOW - MIN });
  });

  it("drops idle placeholders and push-only timers", () => {
    const feed = toWidgetFeed(
      [
        timer({ id: "idle", idle: true }),
        timer({ id: "push", pushOnly: true }),
        timer({ id: "kept" }),
      ],
      meta,
    );
    expect(feed.items.map((i) => i.key)).toEqual(["kept"]);
  });

  it("emits one item per slot of a multi-slot timer", () => {
    const feed = toWidgetFeed(
      [
        timer({
          id: "pit",
          category: "Fire Pit",
          slots: [
            { item: "Boiled Eggs", amount: 1, readyAt: NOW + 10 * MIN },
            { item: "Mashed Potato", amount: 2, readyAt: NOW - MIN },
          ] as AggregatedTimer["slots"],
        }),
      ],
      meta,
    );
    expect(feed.items.map((i) => [i.label, i.amount])).toEqual([
      ["Mashed Potato", 2],
      ["Boiled Eggs", 1],
    ]);
  });

  it("caps the list and reports the uncapped total", () => {
    const timers = Array.from({ length: MAX_WIDGET_ITEMS + 5 }, (_, i) =>
      timer({ id: `t${i}`, readyAt: NOW + (i + 1) * MIN }),
    );
    const feed = toWidgetFeed(timers, meta);
    expect(feed.items).toHaveLength(MAX_WIDGET_ITEMS);
    expect(feed.total).toBe(MAX_WIDGET_ITEMS + 5);
    // The cap keeps the soonest items, not an arbitrary slice.
    expect(feed.items[0].key).toBe("t0");
  });

  it("makes icons absolute and drops ones a widget can't load", () => {
    const feed = toWidgetFeed(
      [
        timer({ id: "cdn", icon: "https://cdn.example/crops/sunflower.png" }),
        timer({ id: "local", icon: "/icons/honey.png" }),
        timer({ id: "data", icon: "data:image/png;base64,AAAA" }),
        timer({ id: "none" }),
      ],
      meta,
    );
    const icons = Object.fromEntries(feed.items.map((i) => [i.key, i.icon]));
    expect(icons).toEqual({
      cdn: "https://cdn.example/crops/sunflower.png",
      local: `${ORIGIN}/icons/honey.png`,
      data: undefined,
      none: undefined,
    });
  });

  it("uses the predicted yield for the label and trims float noise", () => {
    const feed = toWidgetFeed(
      [
        timer({
          label: "Plot",
          predictedYield: {
            amount: 4.800000000002,
            item: "Sunflower",
          } as AggregatedTimer["predictedYield"],
        }),
      ],
      meta,
    );
    expect(feed.items[0]).toMatchObject({ label: "Sunflower", amount: 4.8 });
  });
});

// Minimal stand-in for the colo cache, keyed by request URL.
function fakeCache() {
  const store = new Map<string, Response>();
  return {
    store,
    async match(req: Request): Promise<Response | undefined> {
      return store.get(req.url)?.clone();
    },
    async put(req: Request, res: Response): Promise<void> {
      store.set(req.url, res.clone());
    },
  };
}

// An Env whose Durable Object answers with `doFetch`.
function envWith(doFetch: (url: string) => Promise<Response>): Env {
  return {
    SFL_COMMUNITY_API_KEY: KEY,
    FARM_PUSH_DO: {
      idFromName: (name: string) => name,
      get: () => ({ fetch: doFetch }),
    },
  } as unknown as Env;
}

const doMiss = vi.fn(
  async () => new Response(JSON.stringify({ miss: true }), { status: 404 }),
);

const upstreamFarm = (timers: unknown) =>
  new Response(JSON.stringify({ id: 7, farm: { __timers: timers } }), {
    status: 200,
  });

describe("fetchWidgetFeed", () => {
  let cache: ReturnType<typeof fakeCache>;

  beforeEach(() => {
    cache = fakeCache();
    vi.stubGlobal("caches", { default: cache });
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    doMiss.mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("serves the Durable Object's feed without touching upstream", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const doFetch = vi.fn(
      async () => new Response(JSON.stringify({ v: 1, items: [] })),
    );

    const result = await fetchWidgetFeed(envWith(doFetch), 7, {
      origin: ORIGIN,
    });

    expect(result).toMatchObject({ ok: true, source: "snapshot" });
    expect(fetchMock).not.toHaveBeenCalled();
    // The DO needs the origin to resolve root-relative icons.
    const doUrl = new URL((doFetch.mock.calls[0] as unknown as [string])[0]);
    expect(doUrl.pathname).toBe("/widget");
    expect(doUrl.searchParams.get("origin")).toBe(ORIGIN);
  });

  it("falls back to a gated upstream read when the DO has nothing", async () => {
    const fetchMock = vi.fn(async () =>
      upstreamFarm([timer({ id: "a", readyAt: NOW + MIN })]),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchWidgetFeed(envWith(doMiss), 7, {
      origin: ORIGIN,
      clientIp: "203.0.113.9",
    });

    expect(result).toMatchObject({ ok: true, source: "upstream" });
    if (!result.ok) throw new Error("unreachable");
    const feed = JSON.parse(result.body) as WidgetFeed;
    expect(feed).toMatchObject({ farmId: 7, fetchedAt: NOW, total: 1 });
    expect(feed.items[0].key).toBe("a");

    // It is the same gate as /api/farms/{id}: the single-farm endpoint,
    // our key, and the player's IP for upstream's throttle.
    const [url, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      { headers: Record<string, string> },
    ];
    expect(url).toMatch(/\/community\/farms\/7$/);
    expect(init.headers["x-api-key"]).toBe(KEY);
    expect(init.headers["x-forwarded-client-ip"]).toBe("203.0.113.9");
  });

  it("also falls back when the DO is unreachable", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => upstreamFarm([])),
    );
    const doFetch = vi.fn(async () => {
      throw new Error("DO overloaded");
    });

    const result = await fetchWidgetFeed(envWith(doFetch), 7, {
      origin: ORIGIN,
    });

    expect(result).toMatchObject({ ok: true, source: "upstream" });
  });

  it("reuses a computed feed instead of recomputing it", async () => {
    const fetchMock = vi.fn(async () => upstreamFarm([]));
    vi.stubGlobal("fetch", fetchMock);
    const env = envWith(doMiss);

    const first = await fetchWidgetFeed(env, 7, { origin: ORIGIN });
    const second = await fetchWidgetFeed(env, 7, { origin: ORIGIN });

    expect(second).toMatchObject({ ok: true, source: "cache" });
    if (!first.ok || !second.ok) throw new Error("unreachable");
    expect(second.body).toBe(first.body);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(doMiss).toHaveBeenCalledTimes(1);
  });

  it("never serves one farm's cached feed for another", async () => {
    const fetchMock = vi.fn(async () => upstreamFarm([]));
    vi.stubGlobal("fetch", fetchMock);
    const env = envWith(doMiss);

    await fetchWidgetFeed(env, 7, { origin: ORIGIN });
    const other = await fetchWidgetFeed(env, 8, { origin: ORIGIN });

    expect(other).toMatchObject({ ok: true, source: "upstream" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("passes a gate refusal through and does not cache it", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("Not found", { status: 404 })),
    );

    const result = await fetchWidgetFeed(envWith(doMiss), 7, {
      origin: ORIGIN,
    });

    expect(result).toEqual({ ok: false, status: 404, error: "Not found" });
    expect(cache.store.size).toBe(0);
  });

  it("is a 502 when the farm can't be extracted", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => upstreamFarm("throw")),
    );

    const result = await fetchWidgetFeed(envWith(doMiss), 7, {
      origin: ORIGIN,
    });

    expect(result).toEqual({
      ok: false,
      status: 502,
      error: "Could not compute feed",
    });
    expect(cache.store.size).toBe(0);
  });
});
