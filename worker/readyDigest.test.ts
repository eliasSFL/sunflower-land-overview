import { describe, expect, it } from "vitest";
import { planReadyDigest, type DigestMember } from "./readyDigest.ts";

const NOW = 1_000_000;

function salt(id: string, ready: boolean, amount = 10): DigestMember {
  return {
    key: `Salt|${id}`,
    group: "Salt",
    noun: "salt node",
    ready,
    icon: "salt.png",
    category: "Salt",
    amount,
    item: "Salt",
  };
}

function hive(id: string, ready: boolean, amount = 1.2): DigestMember {
  return {
    key: `Beehives|${id}`,
    group: "Beehives",
    noun: "hive",
    ready,
    icon: "honey.png",
    category: "Beehives",
    amount,
    item: "Honey",
  };
}

describe("planReadyDigest", () => {
  it("fires one grouped push for several newly-ready members", () => {
    const members = [salt("a", true), salt("b", true), salt("c", true)];
    const { fires, nextSeen } = planReadyDigest(members, {}, NOW);

    expect(fires).toHaveLength(1);
    expect(fires[0].title).toBe("3 salt nodes ready");
    expect(fires[0].count).toBe(3);
    expect(fires[0].category).toBe("Salt");
    // Wave yield is summed.
    expect(fires[0].body).toBe("30 Salt · Salt");
    expect(Object.keys(nextSeen).sort()).toEqual([
      "Salt|a",
      "Salt|b",
      "Salt|c",
    ]);
  });

  it("does not re-fire a sitting-ready member (the every-10-min bug)", () => {
    const members = [hive("h1", true)];
    const first = planReadyDigest(members, {}, NOW);
    expect(first.fires).toHaveLength(1);

    // Next sweep: same hive still full. `seen` carries it forward → no
    // new push, even though `now` advanced.
    const second = planReadyDigest(members, first.nextSeen, NOW + 600_000);
    expect(second.fires).toHaveLength(0);
    expect(second.nextSeen).toEqual(first.nextSeen);
  });

  it("clears a member once it leaves the ready set, then re-fires", () => {
    const seen = planReadyDigest([hive("h1", true)], {}, NOW).nextSeen;

    // Collected → refilling: ready=false drops it from `seen`.
    const collected = planReadyDigest([hive("h1", false)], seen, NOW + 1);
    expect(collected.fires).toHaveLength(0);
    expect(collected.nextSeen).toEqual({});

    // Refilled later → ready again → fires once more.
    const refilled = planReadyDigest(
      [hive("h1", true)],
      collected.nextSeen,
      NOW + 2,
    );
    expect(refilled.fires).toHaveLength(1);
    expect(refilled.fires[0].title).toBe("1 hive ready");
  });

  it("only announces members that became ready this snapshot", () => {
    const seen = planReadyDigest([salt("a", true)], {}, NOW).nextSeen;

    // `a` still ready (seen), `b` newly ready → push covers just `b`.
    const next = planReadyDigest(
      [salt("a", true), salt("b", true)],
      seen,
      NOW + 1,
    );
    expect(next.fires).toHaveLength(1);
    expect(next.fires[0].count).toBe(1);
    expect(next.fires[0].title).toBe("1 salt node ready");
    expect(Object.keys(next.nextSeen).sort()).toEqual(["Salt|a", "Salt|b"]);
  });

  it("exposes the newly-ready member keys on each fire (not carried-over)", () => {
    const seen = planReadyDigest([salt("a", true)], {}, NOW).nextSeen;

    // `a` already seen, `b`/`c` newly ready → the fire announces only b & c,
    // so only those keys are un-seeable on a schedule failure.
    const next = planReadyDigest(
      [salt("a", true), salt("b", true), salt("c", true)],
      seen,
      NOW + 1,
    );
    expect(next.fires).toHaveLength(1);
    expect(next.fires[0].memberKeys.sort()).toEqual(["Salt|b", "Salt|c"]);
  });

  it("groups distinct collectable types into separate pushes", () => {
    const members = [salt("a", true), hive("h1", true), salt("b", true)];
    const { fires } = planReadyDigest(members, {}, NOW);

    expect(fires).toHaveLength(2);
    const byGroup = Object.fromEntries(fires.map((f) => [f.group, f]));
    expect(byGroup.Salt.title).toBe("2 salt nodes ready");
    expect(byGroup.Beehives.title).toBe("1 hive ready");
  });

  it("seeds without firing on the subscribe path", () => {
    const members = [hive("h1", true), hive("h2", true)];
    const { fires, nextSeen } = planReadyDigest(members, {}, NOW, {
      seedOnly: true,
    });

    expect(fires).toHaveLength(0);
    // Seeded so a later sweep observing the same full hives stays quiet.
    expect(Object.keys(nextSeen).sort()).toEqual([
      "Beehives|h1",
      "Beehives|h2",
    ]);
    const later = planReadyDigest(members, nextSeen, NOW + 1);
    expect(later.fires).toHaveLength(0);
  });

  it("falls back to the group label when yields are absent", () => {
    const { fires } = planReadyDigest(
      [hive("h1", true, 0), hive("h2", true, 0)],
      {},
      NOW,
    );
    expect(fires[0].body).toBe("Beehives");
  });

  it("ignores not-ready members entirely", () => {
    const { fires, nextSeen } = planReadyDigest(
      [salt("a", false), salt("b", false)],
      {},
      NOW,
    );
    expect(fires).toHaveLength(0);
    expect(nextSeen).toEqual({});
  });
});
