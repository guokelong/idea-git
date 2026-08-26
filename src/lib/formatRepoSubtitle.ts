import type { RepoStatus } from "../types";

export function formatRepoSubtitle(status: RepoStatus): string {
  const dirty = status.dirty ? `${status.changes.length} 变更` : "干净";
  return `${status.branch} · ${dirty} · ↑${status.ahead} ↓${status.behind}`;
}

export const formatRepoStatusLine = formatRepoSubtitle;
