import { describe, expect, it } from "vitest";
import { parseCommitRefs } from "./commitRefs";

describe("parseCommitRefs", () => {
  it("returns empty for blank refs", () => {
    expect(parseCommitRefs("")).toEqual([]);
    expect(parseCommitRefs("   ")).toEqual([]);
  });

  it("classifies HEAD arrow local and origin remote", () => {
    expect(
      parseCommitRefs("HEAD -> test202608, origin/test202608", ["origin"]),
    ).toEqual([
      { text: "HEAD", kind: "head" },
      { text: "test202608", kind: "local" },
      { text: "origin/test202608", kind: "remote" },
    ]);
  });

  it("classifies remote-only and local-only decorations", () => {
    expect(parseCommitRefs("origin/test202608", ["origin"])).toEqual([
      { text: "origin/test202608", kind: "remote" },
    ]);
    expect(parseCommitRefs("test202608", ["origin"])).toEqual([
      { text: "test202608", kind: "local" },
    ]);
  });

  it("parses tags and bare HEAD", () => {
    expect(parseCommitRefs("HEAD, tag: v1.0.0", ["origin"])).toEqual([
      { text: "HEAD", kind: "head" },
      { text: "v1.0.0", kind: "tag" },
    ]);
  });

  it("keeps local branches with slashes as local", () => {
    expect(parseCommitRefs("feature/foo", ["origin"])).toEqual([
      { text: "feature/foo", kind: "local" },
    ]);
  });
});
