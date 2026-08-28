import { afterEach, describe, expect, it, vi } from "vitest";

import { getFarm, isCommunityKey, serviceKey } from "./communityApi.ts";

const KEY = "sfl.MTIz.c2lnbmF0dXJl";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function respond(status: number, body = "{}"): Response {
  return new Response(body, { status });
}

describe("isCommunityKey", () => {
  it("accepts the `sfl.{payload}.{sig}` shape", () => {
    expect(isCommunityKey(KEY)).toBe(true);
  });

  it("rejects anything else", () => {
    // The failure this guards against is someone pasting the master
    // HMAC secret (the pre-migration config) into the key slot.
    expect(isCommunityKey("some-master-hmac-secret")).toBe(false);
    expect(isCommunityKey("sfl.onlytwo")).toBe(false);
    expect(isCommunityKey("")).toBe(false);
  });
});

describe("serviceKey", () => {
  it("returns the configured key", () => {
    expect(serviceKey({ SFL_COMMUNITY_API_KEY: KEY })).toBe(KEY);
  });

  it("trims surrounding whitespace", () => {
    expect(serviceKey({ SFL_COMMUNITY_API_KEY: `  ${KEY}\n` })).toBe(KEY);
  });

  it("returns null when unset", () => {
    expect(serviceKey({})).toBeNull();
    expect(serviceKey({ SFL_COMMUNITY_API_KEY: "   " })).toBeNull();
  });

  it("returns null (and complains) for a non-key value", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(serviceKey({ SFL_COMMUNITY_API_KEY: "master-secret" })).toBeNull();
    expect(error).toHaveBeenCalled();
  });
});

describe("getFarm", () => {
  it("returns the parsed body on 200", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => respond(200, JSON.stringify({ farm: {}, id: 7 }))),
    );

    const result = await getFarm(7, KEY);

    expect(result).toEqual({ ok: true, raw: { farm: {}, id: 7 } });
  });

  it("maps 404 to not_found", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => respond(404)),
    );

    const result = await getFarm(7, KEY);

    expect(result).toEqual({ ok: false, reason: "not_found", status: 404 });
  });

  // The regression this locks down: 401 used to be folded into
  // `not_found`, on the assumption that we minted a key per farm and so
  // a rejection could only mean the farm id was wrong. With one shared
  // service key a 401 means OUR key stopped qualifying — reporting that
  // as "farm not found" would tell every player their farm vanished.
  it("maps 401 to unauthorized, not not_found", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => respond(401)),
    );

    const result = await getFarm(7, KEY);

    expect(result).toEqual({ ok: false, reason: "unauthorized", status: 401 });
  });

  it("does not retry a 401", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const fetchMock = vi.fn(async () => respond(401));
    vi.stubGlobal("fetch", fetchMock);

    await getFarm(7, KEY);

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("retries a 429 and succeeds on a later attempt", async () => {
    const fetchMock = vi
      .fn<() => Promise<Response>>()
      .mockResolvedValueOnce(respond(429))
      .mockResolvedValueOnce(respond(200, JSON.stringify({ farm: {}, id: 7 })));
    vi.stubGlobal("fetch", fetchMock);

    const result = await getFarm(7, KEY);

    expect(result.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("sends the key, and the forwarded IP only when given one", async () => {
    const fetchMock = vi.fn(async () =>
      respond(200, JSON.stringify({ farm: {}, id: 7 })),
    );
    vi.stubGlobal("fetch", fetchMock);

    await getFarm(7, KEY, "1.2.3.4", "support-secret", "https://api.test");

    const [url, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      { headers: Record<string, string> },
    ];
    expect(url).toBe("https://api.test/community/farms/7");
    expect(init.headers["x-api-key"]).toBe(KEY);
    expect(init.headers["x-forwarded-client-ip"]).toBe("1.2.3.4");
    expect(init.headers["x-support-key"]).toBe("support-secret");
  });
});
