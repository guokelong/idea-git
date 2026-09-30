import { describe, expect, it } from "vitest";
import {
  buildBranchTree,
  localNameFromRemote,
  splitLocalAndRemote,
} from "./branchTree";
import type { BranchRow } from "../types";

function br(
  name: string,
  isRemote: boolean,
  isCurrent = false,
): BranchRow {
  return {
    name,
    isRemote,
    isCurrent,
    upstream: null,
    ahead: 0,
    behind: 0,
  };
}

describe("splitLocalAndRemote", () => {
  it("splits by isRemote", () => {
    const { local, remote } = splitLocalAndRemote([
      br("main", false, true),
      br("origin/main", true),
      br("feature/x", false),
    ]);
    expect(local.map((b) => b.name)).toEqual(["main", "feature/x"]);
    expect(remote.map((b) => b.name)).toEqual(["origin/main"]);
  });
});

describe("buildBranchTree", () => {
  it("nests remote and feature paths", () => {
    const tree = buildBranchTree([
      br("origin/main", true),
      br("origin/feature/login", true),
    ]);
    expect(tree).toHaveLength(1);
    expect(tree[0].name).toBe("origin");
    expect(tree[0].kind).toBe("dir");
    const kids = tree[0].children ?? [];
    expect(kids.map((k) => k.name)).toEqual(["feature", "main"]);
    expect(kids[0].children?.[0].branch?.name).toBe("origin/feature/login");
  });
});

describe("localNameFromRemote", () => {
  it("strips first remote segment", () => {
    expect(localNameFromRemote("origin/main")).toBe("main");
    expect(localNameFromRemote("origin/cursor/design")).toBe("cursor/design");
  });
});
