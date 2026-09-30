import { describe, expect, it } from "vitest";
import {
  buildChangeTree,
  collectFilePaths,
  ignorePatternForNode,
} from "./changeTree";
import type { FileChange } from "../types";

function change(path: string): FileChange {
  return { path, indexStatus: " ", worktreeStatus: "M" };
}

describe("buildChangeTree", () => {
  it("builds nested folders and sorts dirs before files", () => {
    const tree = buildChangeTree([
      change("z.txt"),
      change("a/b/c.txt"),
      change("a/d.txt"),
      change("a/b/e.txt"),
    ]);
    expect(tree.map((n) => n.name)).toEqual(["a", "z.txt"]);
    expect(tree[0].kind).toBe("dir");
    expect(tree[0].children?.map((n) => n.name)).toEqual(["b", "d.txt"]);
    expect(tree[0].children?.[0].children?.map((n) => n.name)).toEqual([
      "c.txt",
      "e.txt",
    ]);
    expect(tree[0].children?.[0].children?.[0].change?.path).toBe("a/b/c.txt");
  });

  it("handles multiple files in the same directory", () => {
    const tree = buildChangeTree([change("src/a.ts"), change("src/b.ts")]);
    expect(tree).toHaveLength(1);
    expect(tree[0].fullPath).toBe("src");
    expect(tree[0].children?.map((n) => n.name)).toEqual(["a.ts", "b.ts"]);
  });
});

describe("collectFilePaths", () => {
  it("collects all leaf paths under a directory", () => {
    const tree = buildChangeTree([
      change("a/b/c.txt"),
      change("a/d.txt"),
    ]);
    expect(collectFilePaths(tree[0]).sort()).toEqual(["a/b/c.txt", "a/d.txt"]);
  });
});

describe("ignorePatternForNode", () => {
  it("uses trailing slash for dirs and path for files", () => {
    const tree = buildChangeTree([change("src/tmp.log")]);
    expect(ignorePatternForNode(tree[0])).toBe("src/");
    expect(ignorePatternForNode(tree[0].children![0])).toBe("src/tmp.log");
  });
});
