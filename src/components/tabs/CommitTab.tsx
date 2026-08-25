import { useEffect, useRef, useState } from "react";
import {
  commit,
  getDiff,
  push,
  stagePaths,
  unstagePaths,
} from "../../api/git";
import type { FileChange, RepoStatus } from "../../types";
import { ErrorBanner } from "../ErrorBanner";

type CommitTabProps = {
  path: string;
  status: RepoStatus | null;
  onChanged: () => Promise<void>;
};

function errorMessage(err: unknown): string {
  if (typeof err === "string") return err;
  if (err instanceof Error) return err.message;
  return String(err);
}

function isStaged(change: FileChange): boolean {
  return change.indexStatus !== " " && change.indexStatus !== "?";
}

function useStagedDiff(change: FileChange): boolean {
  const worktreeDirty =
    change.worktreeStatus !== " " && change.worktreeStatus !== "?";
  return isStaged(change) && !worktreeDirty;
}

function formatChangeLabel(change: FileChange): string {
  return `${change.indexStatus}${change.worktreeStatus} ${change.path}`;
}

export function CommitTab({ path, status, onChanged }: CommitTabProps) {
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [diff, setDiff] = useState("");
  const [message, setMessage] = useState("");
  const [amend, setAmend] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const knownRef = useRef<{ path: string; files: Set<string> }>({
    path: "",
    files: new Set(),
  });

  const changes = status?.changes ?? [];

  useEffect(() => {
    const files = (status?.changes ?? []).map((change) => change.path);
    const pathChanged = knownRef.current.path !== path;
    setChecked((prev) => {
      const next = new Set<string>();
      for (const file of files) {
        if (pathChanged || !knownRef.current.files.has(file) || prev.has(file)) {
          next.add(file);
        }
      }
      return next;
    });
    if (pathChanged) {
      setSelectedFile(null);
      setDiff("");
      setMessage("");
      setAmend(false);
      setError(null);
    }
    knownRef.current = { path, files: new Set(files) };
  }, [path, status]);

  async function loadDiff(change: FileChange) {
    setSelectedFile(change.path);
    try {
      const text = await getDiff(path, change.path, useStagedDiff(change));
      setDiff(text);
      setError(null);
    } catch (err) {
      console.warn("getDiff failed", err);
      setError(errorMessage(err));
    }
  }

  async function toggleChecked(change: FileChange, nextChecked: boolean) {
    try {
      if (nextChecked) {
        await stagePaths(path, [change.path]);
      } else if (isStaged(change)) {
        await unstagePaths(path, [change.path]);
      }
      setChecked((prev) => {
        const next = new Set(prev);
        if (nextChecked) {
          next.add(change.path);
        } else {
          next.delete(change.path);
        }
        return next;
      });
      setError(null);
      await onChanged();
    } catch (err) {
      console.warn("toggle stage failed", err);
      setError(errorMessage(err));
    }
  }

  async function handleCommit(alsoPush: boolean) {
    setBusy(true);
    setError(null);
    try {
      const toStage = changes
        .filter((change) => checked.has(change.path))
        .map((change) => change.path);
      const toUnstage = changes
        .filter((change) => !checked.has(change.path) && isStaged(change))
        .map((change) => change.path);
      if (toStage.length > 0) {
        await stagePaths(path, toStage);
      }
      if (toUnstage.length > 0) {
        await unstagePaths(path, toUnstage);
      }
      await commit(path, message, amend);
      if (alsoPush) {
        await push(path);
      }
      setMessage("");
      setAmend(false);
      setSelectedFile(null);
      setDiff("");
      await onChanged();
    } catch (err) {
      console.warn(alsoPush ? "commit and push failed" : "commit failed", err);
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const canCommit = amend || message.trim().length > 0;

  return (
    <section className="commit-tab">
      {error ? <ErrorBanner message={error} /> : null}
      <div className="commit-body">
        <ul className="commit-changes">
          {changes.length === 0 ? (
            <li className="commit-empty">没有变更</li>
          ) : (
            changes.map((change) => (
              <li
                key={change.path}
                className={
                  selectedFile === change.path
                    ? "commit-change selected"
                    : "commit-change"
                }
              >
                <input
                  type="checkbox"
                  checked={checked.has(change.path)}
                  onChange={(event) => {
                    void toggleChecked(change, event.target.checked);
                  }}
                />
                <button
                  type="button"
                  className="commit-change-name"
                  onClick={() => {
                    void loadDiff(change);
                  }}
                >
                  {formatChangeLabel(change)}
                </button>
              </li>
            ))
          )}
        </ul>
        <pre className="commit-diff">{diff || "选择文件查看 Diff"}</pre>
      </div>
      <footer className="commit-footer">
        <textarea
          className="commit-message"
          placeholder="提交说明"
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          disabled={busy}
        />
        <div className="commit-actions">
          <label className="commit-amend">
            <input
              type="checkbox"
              checked={amend}
              onChange={(event) => setAmend(event.target.checked)}
              disabled={busy}
            />
            Amend
          </label>
          <button
            type="button"
            disabled={busy || !canCommit}
            onClick={() => {
              void handleCommit(false);
            }}
          >
            Commit
          </button>
          <button
            type="button"
            disabled={busy || !canCommit}
            onClick={() => {
              void handleCommit(true);
            }}
          >
            Commit & Push
          </button>
        </div>
      </footer>
    </section>
  );
}
