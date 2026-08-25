import { invoke } from "@tauri-apps/api/core";
import type { RepoStatus } from "../types";

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
