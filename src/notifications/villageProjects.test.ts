import { describe, expect, it } from "vitest";

import { detectCompletedProjects } from "./villageProjects.ts";
import type { GameState } from "../game/index.ts";

// `completedProjects` lives under socialFarming; fixtures cast through
// unknown so we only have to supply the slice the detector reads.
function stateWith(completedProjects: string[] | undefined): GameState {
  return {
    socialFarming: { completedProjects },
  } as unknown as GameState;
}

describe("detectCompletedProjects", () => {
  it("returns nothing when there are no completed projects", () => {
    expect(detectCompletedProjects(stateWith([]), [])).toEqual([]);
    expect(detectCompletedProjects(stateWith(undefined), [])).toEqual([]);
    // socialFarming entirely absent must not throw.
    expect(detectCompletedProjects({} as GameState, [])).toEqual([]);
  });

  it("flags a project newly present in completedProjects", () => {
    const result = detectCompletedProjects(stateWith(["Big Orange"]), []);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      name: "Big Orange",
      title: "Village project complete!",
    });
    expect(result[0].body).toContain("Big Orange");
  });

  it("ignores projects already seen (dedup across sweeps)", () => {
    const result = detectCompletedProjects(stateWith(["Big Orange"]), [
      "Big Orange",
    ]);
    expect(result).toEqual([]);
  });

  it("only flags the delta when some are already seen", () => {
    const result = detectCompletedProjects(
      stateWith(["Big Orange", "Big Apple"]),
      ["Big Orange"],
    );
    expect(result.map((r) => r.name)).toEqual(["Big Apple"]);
  });

  it("re-fires after a restart drops then re-adds a project", () => {
    // The caller stores the *current* completedProjects as `seen` each
    // pass. After a restart the project leaves the set, so `seen` no
    // longer contains it; a later re-completion is treated as new.
    const seenAfterRestart: string[] = [];
    const result = detectCompletedProjects(
      stateWith(["Big Orange"]),
      seenAfterRestart,
    );
    expect(result.map((r) => r.name)).toEqual(["Big Orange"]);
  });
});
