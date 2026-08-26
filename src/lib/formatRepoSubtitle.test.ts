import { describe, it, expect } from "vitest";
import { formatRepoSubtitle } from "./formatRepoSubtitle";
import type { RepoStatus } from "../types";

function status(partial: Partial<RepoStatus>): RepoStatus {
  return {
    branch: "main",
    upstream: "origin/main",
    ahead: 0,
    behind: 0,
    changes: [],
    hasConflicts: false,
    dirty: false,
    ...partial,
  };
}

describe("formatRepoSubtitle", () => {
  it("formats dirty ahead behind", () => {
    expect(
      formatRepoSubtitle({
        branch: "main",
        upstream: "origin/main",
        ahead: 2,
        behind: 0,
        changes: [{ path: "a", indexStatus: "M", worktreeStatus: " " }],
        hasConflicts: false,
        dirty: true,
      }),
    ).toContain("↑2");
  });

  it("uses change count when dirty", () => {
    expect(
      formatRepoSubtitle(
        status({
          dirty: true,
          ahead: 2,
          behind: 1,
          changes: [
            { path: "a", indexStatus: "M", worktreeStatus: " " },
            { path: "b", indexStatus: "A", worktreeStatus: " " },
            { path: "c", indexStatus: " ", worktreeStatus: "M" },
          ],
        }),
      ),
    ).toBe("main · 3 变更 · ↑2 ↓1");
  });

  it("marks a clean worktree", () => {
    expect(formatRepoSubtitle(status({ branch: "feat/x" }))).toBe(
      "feat/x · 干净 · ↑0 ↓0",
    );
  });
});
