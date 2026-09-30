import type { FileChange } from "../types";

/** Untracked in porcelain v1: `??`. */
export function isUntracked(change: FileChange): boolean {
  return change.indexStatus === "?" || change.worktreeStatus === "?";
}

export function splitTrackedAndUntracked(changes: FileChange[]): {
  tracked: FileChange[];
  untracked: FileChange[];
} {
  const tracked: FileChange[] = [];
  const untracked: FileChange[] = [];
  for (const change of changes) {
    if (isUntracked(change)) {
      untracked.push(change);
    } else {
      tracked.push(change);
    }
  }
  return { tracked, untracked };
}

/**
 * Dominant status for coloring (IDEA-like):
 * ? untracked, U conflict, D deleted, A added, R renamed, M modified.
 */
export function primaryStatus(change: FileChange): string {
  const i = change.indexStatus;
  const w = change.worktreeStatus;
  if (i === "?" || w === "?") return "?";
  if (i === "U" || w === "U" || (i === "A" && w === "A") || (i === "D" && w === "D")) {
    return "U";
  }
  if (i === "D" || w === "D") return "D";
  if (i === "A" || w === "A") return "A";
  if (i === "R" || w === "R") return "R";
  if (i === "M" || w === "M") return "M";
  if (i === "C" || w === "C") return "A";
  if (w !== " ") return w;
  if (i !== " ") return i;
  return "M";
}

export function statusColorClass(change: FileChange): string {
  switch (primaryStatus(change)) {
    case "?":
    case "A":
      return "status-added";
    case "D":
      return "status-deleted";
    case "U":
      return "status-conflict";
    case "R":
      return "status-renamed";
    case "M":
    default:
      return "status-modified";
  }
}

/** Parent directory path for muted display next to file name. */
export function parentPathLabel(filePath: string): string {
  const idx = filePath.lastIndexOf("/");
  if (idx <= 0) return "";
  return filePath.slice(0, idx);
}
