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
