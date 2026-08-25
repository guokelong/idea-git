import { useEffect, useState } from "react";
import { getCommitDiff, listCommits } from "../../api/git";
import type { CommitRow } from "../../types";
import { ErrorBanner } from "../ErrorBanner";

type LogTabProps = {
  path: string;
  currentBranch: string | null;
};

const ALL_BRANCHES = "";
const DEFAULT_LIMIT = 100;

function errorMessage(err: unknown): string {
  if (typeof err === "string") return err;
  if (err instanceof Error) return err.message;
  return String(err);
}

export function LogTab({ path, currentBranch }: LogTabProps) {
  const [branch, setBranch] = useState(currentBranch ?? ALL_BRANCHES);
  const [rows, setRows] = useState<CommitRow[]>([]);
  const [selectedHash, setSelectedHash] = useState<string | null>(null);
  const [diff, setDiff] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setBranch(currentBranch ?? ALL_BRANCHES);
    setSelectedHash(null);
    setDiff("");
    setRows([]);
    setError(null);
  }, [path, currentBranch]);

  useEffect(() => {
    let cancelled = false;
    setBusy(true);
    console.info("LogTab load enter path=", path, "branch=", branch);
    listCommits(path, branch || null, DEFAULT_LIMIT)
      .then((next) => {
        if (cancelled) return;
        setRows(next);
        setError(null);
        console.info("LogTab load exit count=", next.length);
      })
      .catch((err) => {
        if (cancelled) return;
        console.warn("listCommits failed", err);
        setRows([]);
        setError(errorMessage(err));
      })
      .finally(() => {
        if (!cancelled) setBusy(false);
      });
    return () => {
      cancelled = true;
    };
  }, [path, branch]);

  async function loadDiff(row: CommitRow) {
    setSelectedHash(row.hash);
    try {
      const text = await getCommitDiff(path, row.hash);
      setDiff(text);
      setError(null);
    } catch (err) {
      console.warn("getCommitDiff failed", err);
      setError(errorMessage(err));
    }
  }

  return (
    <section className="log-tab">
      {error ? <ErrorBanner message={error} /> : null}
      <header className="log-toolbar">
        <label className="log-branch-filter">
          分支
          <select
            value={branch}
            onChange={(event) => {
              setSelectedHash(null);
              setDiff("");
              setBranch(event.target.value);
            }}
            disabled={busy}
          >
            {currentBranch ? (
              <option value={currentBranch}>{currentBranch}</option>
            ) : null}
            <option value={ALL_BRANCHES}>全部</option>
          </select>
        </label>
      </header>
      <div className="log-body">
        <ul className="log-commits">
          {rows.length === 0 ? (
            <li className="log-empty">{busy ? "加载中…" : "没有提交"}</li>
          ) : (
            rows.map((row) => (
              <li
                key={row.hash}
                className={
                  selectedHash === row.hash ? "log-commit selected" : "log-commit"
                }
              >
                <button
                  type="button"
                  className="log-commit-row"
                  onClick={() => {
                    void loadDiff(row);
                  }}
                >
                  <span className="log-short-hash">{row.shortHash}</span>
                  <span className="log-subject">{row.subject}</span>
                  <span className="log-meta">
                    {row.author} · {row.date}
                    {row.refs ? ` · ${row.refs}` : ""}
                  </span>
                </button>
              </li>
            ))
          )}
        </ul>
        <pre className="log-diff">{diff || "选择提交查看 Diff"}</pre>
      </div>
    </section>
  );
}
