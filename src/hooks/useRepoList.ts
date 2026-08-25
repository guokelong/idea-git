import { useCallback, useEffect, useRef, useState } from "react";
import { getRepoStatus } from "../api/git";
import { listRepos } from "../api/repos";
import type { RepoListItem, RepoStatus } from "../types";

export type RepoOverviewItem = RepoListItem & {
  status: RepoStatus | null;
};

export function formatRepoStatusLine(status: RepoStatus): string {
  const dirty = status.dirty ? `${status.changes.length} 变更` : "干净";
  return `${status.branch} · ${dirty} · ↑${status.ahead} ↓${status.behind}`;
}

function errorMessage(err: unknown): string {
  if (typeof err === "string") return err;
  if (err instanceof Error) return err.message;
  return String(err);
}

export function useRepoList() {
  const [items, setItems] = useState<RepoOverviewItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const generationRef = useRef(0);

  const refresh = useCallback(async () => {
    const generation = ++generationRef.current;
    console.info("useRepoList refresh enter");
    try {
      const listed = await listRepos();
      const results = await Promise.allSettled(
        listed.map((item) =>
          item.valid ? getRepoStatus(item.entry.path) : Promise.resolve(null),
        ),
      );
      if (generation !== generationRef.current) {
        return;
      }
      const next: RepoOverviewItem[] = listed.map((item, index) => {
        const result = results[index];
        if (result.status === "rejected") {
          console.warn(
            "getRepoStatus failed path=",
            item.entry.path,
            result.reason,
          );
          return { ...item, status: null };
        }
        return { ...item, status: result.value };
      });
      setItems(next);
      setError(null);
      console.info("useRepoList refresh exit count=", next.length);
    } catch (err) {
      if (generation !== generationRef.current) {
        return;
      }
      console.warn("useRepoList refresh failed", err);
      setError(errorMessage(err));
    }
  }, []);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => {
      void refresh();
    }, 8000);
    const onFocus = () => {
      void refresh();
    };
    window.addEventListener("focus", onFocus);
    return () => {
      generationRef.current += 1;
      window.clearInterval(timer);
      window.removeEventListener("focus", onFocus);
    };
  }, [refresh]);

  return { items, error, setError, refresh };
}
