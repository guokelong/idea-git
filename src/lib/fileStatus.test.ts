import { describe, expect, it } from "vitest";
import {
  isUntracked,
  parentPathLabel,
  primaryStatus,
  splitTrackedAndUntracked,
  statusColorClass,
} from "./fileStatus";
import type { FileChange } from "../types";

function ch(
  path: string,
  indexStatus: string,
  worktreeStatus: string,
): FileChange {
  return { path, indexStatus, worktreeStatus };
}

describe("splitTrackedAndUntracked", () => {
  it("separates ?? from tracked changes", () => {
    const { tracked, untracked } = splitTrackedAndUntracked([
      ch("a.ts", "M", " "),
      ch("b.ts", "?", "?"),
      ch("c.ts", " ", "M"),
    ]);
    expect(tracked.map((c) => c.path)).toEqual(["a.ts", "c.ts"]);
    expect(untracked.map((c) => c.path)).toEqual(["b.ts"]);
  });
});

describe("primaryStatus / statusColorClass", () => {
  it("maps common statuses", () => {
    expect(primaryStatus(ch("a", " ", "M"))).toBe("M");
    expect(primaryStatus(ch("a", "A", " "))).toBe("A");
    expect(primaryStatus(ch("a", "?", "?"))).toBe("?");
    expect(primaryStatus(ch("a", "D", " "))).toBe("D");
    expect(primaryStatus(ch("a", "U", "U"))).toBe("U");
    expect(statusColorClass(ch("a", "?", "?"))).toBe("status-added");
    expect(statusColorClass(ch("a", " ", "M"))).toBe("status-modified");
    expect(statusColorClass(ch("a", "D", " "))).toBe("status-deleted");
  });
});

describe("isUntracked / parentPathLabel", () => {
  it("detects untracked and parent path", () => {
    expect(isUntracked(ch("x", "?", "?"))).toBe(true);
    expect(isUntracked(ch("x", "M", " "))).toBe(false);
    expect(parentPathLabel("src/a.ts")).toBe("src");
    expect(parentPathLabel("a.ts")).toBe("");
  });
});
