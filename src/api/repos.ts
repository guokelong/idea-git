import { invoke } from "@tauri-apps/api/core";
import type { RepoEntry, RepoListItem } from "../types";

export function listRepos(): Promise<RepoListItem[]> {
  console.info("listRepos enter");
  return invoke<RepoListItem[]>("list_repos").then((items) => {
    console.info("listRepos exit count=", items.length);
    return items;
  });
}

export function addRepo(path: string, name?: string | null): Promise<RepoEntry> {
  console.info("addRepo enter path=", path, "name=", name ?? null);
  return invoke<RepoEntry>("add_repo", { path, name: name ?? null }).then(
    (entry) => {
      console.info("addRepo exit id=", entry.id);
      return entry;
    },
  );
}

export function removeRepo(id: string): Promise<void> {
  console.info("removeRepo enter id=", id);
  return invoke<void>("remove_repo", { id }).then(() => {
    console.info("removeRepo exit");
  });
}

export function relocateRepo(id: string, path: string): Promise<RepoEntry> {
  console.info("relocateRepo enter id=", id, "path=", path);
  return invoke<RepoEntry>("relocate_repo", { id, path }).then((entry) => {
    console.info("relocateRepo exit path=", entry.path);
    return entry;
  });
}
