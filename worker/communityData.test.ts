import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { fetchCommunityData, isCommunityDataType } from "./communityData.ts";
import type { Env } from "./types.ts";

const KEY = "sfl.MTIz.c2lnbmF0dXJl";
const env = { SFL_COMMUNITY_API_KEY: KEY } as unknown as Env;

// Minimal stand-in for the colo cache. Keyed by request URL, which is
// what the real Cache API does for GETs without a Vary.
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

let cache: ReturnType<typeof fakeCache>;

beforeEach(() => {
  cache = fakeCache();
  vi.stubGlobal("caches", { default: cache });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

const ok = (body: unknown) =>
  new Response(JSON.stringify(body), { status: 200 });

const params = (q: Record<string, string> = {}) => new URLSearchParams(q);

describe("isCommunityDataType", () => {
  it("accepts the types we proxy and rejects the rest", () => {
    expect(isCommunityDataType("auctions")).toBe(true);
    expect(isCommunityDataType("marketplaceActivity")).toBe(true);
    // Real upstream types we deliberately don't expose yet.
    expect(isCommunityDataType("nightlyDump")).toBe(false);
    expect(isCommunityDataType("ticketLeaderboard")).toBe(false);
    expect(isCommunityDataType("__proto__")).toBe(false);
  });
});

describe("fetchCommunityData", () => {
  it("is a 503 when no key is configured", async () => {
    const result = await fetchCommunityData({} as Env, "auctions", params());

    expect(result).toEqual({
      ok: false,
      status: 503,
      error: "Server not configured",
    });
  });

  it("fetches upstream and returns the body verbatim", async () => {
    const fetchMock = vi.fn(async () => ok({ data: { auctions: [] } }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchCommunityData(env, "auctions", params());

    expect(result).toMatchObject({
      ok: true,
      body: JSON.stringify({ data: { auctions: [] } }),
      stale: false,
    });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      { headers: Record<string, string> },
    ];
    expect(url).toContain("/community/data?type=auctions");
    expect(init.headers["x-api-key"]).toBe(KEY);
  });

  // The whole reason this module exists: upstream throttles
  // /community/data on our single egress IP, so a second caller inside
  // the soft TTL must be served from cache, not forwarded.
  it("serves a second call from cache without hitting upstream", async () => {
    const fetchMock = vi.fn(async () => ok({ data: { auctions: [] } }));
    vi.stubGlobal("fetch", fetchMock);

    await fetchCommunityData(env, "auctions", params());
    const second = await fetchCommunityData(env, "auctions", params());

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(second).toMatchObject({ ok: true, stale: false });
  });

  it("revalidates once the soft TTL has passed", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn(async () => ok({ data: { auctions: [] } }));
    vi.stubGlobal("fetch", fetchMock);

    await fetchCommunityData(env, "auctions", params());
    // auctions has a 10 minute soft TTL.
    vi.setSystemTime(Date.now() + 11 * 60_000);
    await fetchCommunityData(env, "auctions", params());

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("serves the stale copy when upstream is throttling", async () => {
    vi.useFakeTimers();
    const fetchMock = vi
      .fn<() => Promise<Response>>()
      .mockResolvedValueOnce(ok({ data: { auctions: ["first"] } }))
      .mockResolvedValue(new Response("", { status: 429 }));
    vi.stubGlobal("fetch", fetchMock);

    await fetchCommunityData(env, "auctions", params());
    vi.setSystemTime(Date.now() + 11 * 60_000);
    const result = await fetchCommunityData(env, "auctions", params());

    expect(result).toMatchObject({
      ok: true,
      body: JSON.stringify({ data: { auctions: ["first"] } }),
      stale: true,
    });
  });

  it("reports a rejected key as 503, not as the farm's problem", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("", { status: 401 })),
    );

    const result = await fetchCommunityData(env, "auctions", params());

    expect(result).toEqual({
      ok: false,
      status: 503,
      error: "Overview API key is not currently valid",
    });
  });

  it("rejects a malformed param before spending the upstream slot", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchCommunityData(
      env,
      "marketplaceActivity",
      params({ date: "yesterday" }),
    );

    expect(result).toEqual({
      ok: false,
      status: 400,
      error: "date must be YYYY-MM-DD",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("requires the params a type declares required", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchCommunityData(env, "tradeable", params());

    expect(result).toEqual({
      ok: false,
      status: 400,
      error: "Missing collection",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("drops params the type doesn't declare", async () => {
    const fetchMock = vi.fn(async () => ok({ data: {} }));
    vi.stubGlobal("fetch", fetchMock);

    // `farmId` belongs to ticketLeaderboard, not auctions — it must not
    // be spliced into the upstream query just because a caller sent it.
    await fetchCommunityData(env, "auctions", params({ farmId: "1" }));

    const [url] = fetchMock.mock.calls[0] as unknown as [string];
    expect(url).not.toContain("farmId");
  });

  it("caches each param combination separately", async () => {
    const fetchMock = vi.fn(async () => ok({ data: {} }));
    vi.stubGlobal("fetch", fetchMock);

    await fetchCommunityData(
      env,
      "marketplaceActivity",
      params({ date: "2026-08-27" }),
    );
    await fetchCommunityData(
      env,
      "marketplaceActivity",
      params({ date: "2026-08-28" }),
    );

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("never puts the API key in the cache key", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ok({ data: {} })),
    );

    await fetchCommunityData(env, "auctions", params());

    const keys = [...cache.store.keys()];
    expect(keys).toHaveLength(1);
    expect(keys[0]).not.toContain(KEY);
  });
});
