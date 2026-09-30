export type RepoEntry = { id: string; name: string; path: string; addedAt: string };

export type RepoListItem = { entry: RepoEntry; valid: boolean };

export type FileChange = { path: string; indexStatus: string; worktreeStatus: string };

export type RepoStatus = {
  branch: string;
  upstream: string | null;
  ahead: number;
  behind: number;
  changes: FileChange[];
  hasConflicts: boolean;
  dirty: boolean;
};

export type CommitRow = {
  hash: string;
  shortHash: string;
  subject: string;
  author: string;
  date: string;
  refs: string;
};

export type BranchRow = {
  name: string;
  isRemote: boolean;
  isCurrent: boolean;
  upstream: string | null;
  ahead: number;
  behind: number;
};

export type PushPreview = {
  branch: string;
  remote: string;
  upstream: string | null;
  newBranch: boolean;
  commits: CommitRow[];
};

export type CommitFileChange = {
  status: string;
  path: string;
  oldPath: string | null;
};
