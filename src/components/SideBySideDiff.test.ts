import { describe, expect, it } from "vitest";
import { computeDiffAnchors } from "../components/SideBySideDiff";

describe("computeDiffAnchors", () => {
  it("anchors each contiguous added/removed hunk", () => {
    const before = "a\nb\nc\n";
    const after = "a\nX\nc\nY\n";
    const anchors = computeDiffAnchors(before, after);
    expect(anchors.map((a) => a.lineId)).toEqual(["L-2", "R-2", "R-4"]);
  });

  it("returns empty when identical", () => {
    expect(computeDiffAnchors("a\n", "a\n")).toEqual([]);
  });
});
