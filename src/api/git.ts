import { invoke } from "@tauri-apps/api/core";
import type {
  BranchRow,
  CommitFileChange,
  CommitRow,
  PushPreview,
  RepoStatus,
} from "../types";

export function checkGit(): Promise<boolean> {
  console.info("checkGit enter");
  return invoke<boolean>("check_git").then((available) => {
    console.info("checkGit exit available=", available);
    return available;
  });
}

export function getRepoStatus(path: string): Promise<RepoStatus> {
  console.info("getRepoStatus enter path=", path);
  return invoke<RepoStatus>("get_repo_status", { path }).then((status) => {
    console.info(
      "getRepoStatus exit branch=",
      status.branch,
      "dirty=",
      status.dirty,
    );
    return status;
  });
}

export type DiffSides = {
  before: string;
  after: string;
  binary: boolean;
};

export function getDiff(
  path: string,
  file: string,
  staged: boolean,
): Promise<string> {
  console.info("getDiff enter path=", path, "file=", file, "staged=", staged);
  return invoke<string>("get_diff", { path, file, staged }).then((diff) => {
    console.info("getDiff exit len=", diff.length);
    return diff;
  });
}

export function getDiffSides(
  path: string,
  file: string,
  staged: boolean,
): Promise<DiffSides> {
  console.info("getDiffSides enter path=", path, "file=", file, "staged=", staged);
  return invoke<DiffSides>("get_diff_sides", { path, file, staged }).then(
    (sides) => {
      console.info(
        "getDiffSides exit before=",
        sides.before.length,
        "after=",
        sides.after.length,
        "binary=",
        sides.binary,
      );
      return sides;
    },
  );
}

export function stagePaths(path: string, paths: string[]): Promise<void> {
  console.info("stagePaths enter path=", path, "count=", paths.length);
  return invoke<void>("stage_paths", { path, paths }).then(() => {
    console.info("stagePaths exit");
  });
}

export function unstagePaths(path: string, paths: string[]): Promise<void> {
  console.info("unstagePaths enter path=", path, "count=", paths.length);
  return invoke<void>("unstage_paths", { path, paths }).then(() => {
    console.info("unstagePaths exit");
  });
}

export function commit(
  path: string,
  message: string,
  amend: boolean,
): Promise<void> {
  console.info(
    "commit enter path=",
    path,
    "amend=",
    amend,
    "message_len=",
    message.length,
  );
  return invoke<void>("commit", { path, message, amend }).then(() => {
    console.info("commit exit");
  });
}

export function push(path: string): Promise<void> {
  console.info("push enter path=", path);
  return invoke<void>("push", { path }).then(() => {
    console.info("push exit");
  });
}

export function listCommitsToPush(path: string): Promise<PushPreview> {
  console.info("listCommitsToPush enter path=", path);
  return invoke<PushPreview>("list_commits_to_push", { path }).then(
    (preview) => {
      console.info(
        "listCommitsToPush exit branch=",
        preview.branch,
        "newBranch=",
        preview.newBranch,
        "count=",
        preview.commits.length,
      );
      return preview;
    },
  );
}

export function listCommits(
  path: string,
  branch: string | null,
  limit: number,
): Promise<CommitRow[]> {
  console.info(
    "listCommits enter path=",
    path,
    "branch=",
    branch,
    "limit=",
    limit,
  );
  return invoke<CommitRow[]>("list_commits", { path, branch, limit }).then(
    (rows) => {
      console.info("listCommits exit count=", rows.length);
      return rows;
    },
  );
}

export function getCommitDiff(path: string, hash: string): Promise<string> {
  console.info("getCommitDiff enter path=", path, "hash=", hash);
  return invoke<string>("get_commit_diff", { path, hash }).then((diff) => {
    console.info("getCommitDiff exit len=", diff.length);
    return diff;
  });
}

export function listCommitFiles(
  path: string,
  hash: string,
): Promise<CommitFileChange[]> {
  console.info("listCommitFiles enter path=", path, "hash=", hash);
  return invoke<CommitFileChange[]>("list_commit_files", { path, hash }).then(
    (rows) => {
      console.info("listCommitFiles exit count=", rows.length);
      return rows;
    },
  );
}

export function getCommitFileSides(
  path: string,
  hash: string,
  file: string,
  oldPath: string | null,
): Promise<DiffSides> {
  console.info(
    "getCommitFileSides enter path=",
    path,
    "hash=",
    hash,
    "file=",
    file,
    "oldPath=",
    oldPath,
  );
  return invoke<DiffSides>("get_commit_file_sides", {
    path,
    hash,
    file,
    oldPath,
  }).then((sides) => {
    console.info(
      "getCommitFileSides exit before=",
      sides.before.length,
      "after=",
      sides.after.length,
      "binary=",
      sides.binary,
    );
    return sides;
  });
}

export function listBranches(path: string): Promise<BranchRow[]> {
  console.info("listBranches enter path=", path);
  return invoke<BranchRow[]>("list_branches", { path }).then((rows) => {
    console.info("listBranches exit count=", rows.length);
    return rows;
  });
}

export function checkoutBranch(path: string, name: string): Promise<void> {
  console.info("checkoutBranch enter path=", path, "name=", name);
  return invoke<void>("checkout_branch", { path, name }).then(() => {
    console.info("checkoutBranch exit");
  });
}

export function checkoutRemoteBranch(
  path: string,
  remoteRef: string,
): Promise<void> {
  console.info(
    "checkoutRemoteBranch enter path=",
    path,
    "remoteRef=",
    remoteRef,
  );
  return invoke<void>("checkout_remote_branch", {
    path,
    remoteRef,
  }).then(() => {
    console.info("checkoutRemoteBranch exit");
  });
}

export function createBranch(
  path: string,
  name: string,
  checkout: boolean,
): Promise<void> {
  console.info(
    "createBranch enter path=",
    path,
    "name=",
    name,
    "checkout=",
    checkout,
  );
  return invoke<void>("create_branch", { path, name, checkout }).then(() => {
    console.info("createBranch exit");
  });
}

export function createBranchFrom(
  path: string,
  name: string,
  startPoint: string,
  checkout: boolean,
): Promise<void> {
  console.info(
    "createBranchFrom enter path=",
    path,
    "name=",
    name,
    "startPoint=",
    startPoint,
    "checkout=",
    checkout,
  );
  return invoke<void>("create_branch_from", {
    path,
    name,
    startPoint,
    checkout,
  }).then(() => {
    console.info("createBranchFrom exit");
  });
}

export function deleteBranch(
  path: string,
  name: string,
  force: boolean,
): Promise<void> {
  console.info("deleteBranch enter path=", path, "name=", name, "force=", force);
  return invoke<void>("delete_branch", { path, name, force }).then(() => {
    console.info("deleteBranch exit");
  });
}

export function addToGitignore(path: string, pattern: string): Promise<void> {
  console.info("addToGitignore enter path=", path, "pattern=", pattern);
  return invoke<void>("add_to_gitignore", { path, pattern }).then(() => {
    console.info("addToGitignore exit");
  });
}
