import { useEffect, useMemo, useState } from "react";
import {
  getCommitFileSides,
  listBranches,
  listCommitFiles,
  listCommits,
  type DiffSides,
} from "../../api/git";
import type { CommitFileChange, CommitRow } from "../../types";
import {
  parseCommitRefs,
  remotePrefixesFromNames,
  type CommitRefLabel,
} from "../../lib/commitRefs";
import { ErrorBanner } from "../ErrorBanner";
import { SideBySideDiff } from "../SideBySideDiff";

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

function RefChips({ labels }: { labels: CommitRefLabel[] }) {
  if (labels.length === 0) return null;
  return (
    <span className="log-ref-chips">
      {labels.map((label) => (
        <span
          key={`${label.kind}:${label.text}`}
          className={`log-ref-chip log-ref-${label.kind}`}
          title={
            label.kind === "remote"
              ? "已在远程"
              : label.kind === "local"
                ? "本地分支"
                : undefined
          }
        >
          {label.text}
        </span>
      ))}
    </span>
  );
}

export function LogTab({ path, currentBranch }: LogTabProps) {
  const [branch, setBranch] = useState(currentBranch ?? ALL_BRANCHES);
  const [branchNames, setBranchNames] = useState<string[]>(
    currentBranch ? [currentBranch] : [],
  );
  const [remoteBranchNames, setRemoteBranchNames] = useState<string[]>([]);
  const [rows, setRows] = useState<CommitRow[]>([]);
  const [selectedHash, setSelectedHash] = useState<string | null>(null);
  const [files, setFiles] = useState<CommitFileChange[]>([]);
  const [filesBusy, setFilesBusy] = useState(false);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [diffSides, setDiffSides] = useState<DiffSides | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const remotePrefixes = useMemo(
    () => remotePrefixesFromNames(remoteBranchNames),
    [remoteBranchNames],
  );

  function clearDetail() {
    setSelectedHash(null);
    setFiles([]);
    setSelectedFile(null);
    setDiffSides(null);
  }

  useEffect(() => {
    setBranch(currentBranch ?? ALL_BRANCHES);
    setBranchNames(currentBranch ? [currentBranch] : []);
    setRemoteBranchNames([]);
    clearDetail();
    setRows([]);
    setError(null);
    let cancelled = false;
    listBranches(path)
      .then((next) => {
        if (cancelled) return;
        setBranchNames(next.map((row) => row.name));
        setRemoteBranchNames(
          next.filter((row) => row.isRemote).map((row) => row.name),
        );
      })
      .catch((err) => {
        if (cancelled) return;
        console.warn("listBranches failed", err);
      });
    return () => {
      cancelled = true;
    };
  }, [path, currentBranch]);

  useEffect(() => {
    let cancelled = false;
    setBusy(true);
    clearDetail();
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

  async function selectCommit(row: CommitRow) {
    setSelectedHash(row.hash);
    setSelectedFile(null);
    setDiffSides(null);
    setFilesBusy(true);
    setError(null);
    try {
      console.info("LogTab listCommitFiles", row.hash);
      const next = await listCommitFiles(path, row.hash);
      setFiles(next);
    } catch (err) {
      console.warn("listCommitFiles failed", err);
      setFiles([]);
      setError(errorMessage(err));
    } finally {
      setFilesBusy(false);
    }
  }

  async function openFileDiff(file: CommitFileChange) {
    if (!selectedHash) return;
    setSelectedFile(file.path);
    setError(null);
    try {
      console.info("LogTab getCommitFileSides", file.path);
      const sides = await getCommitFileSides(
        path,
        selectedHash,
        file.path,
        file.oldPath,
      );
      setDiffSides(sides);
    } catch (err) {
      console.warn("getCommitFileSides failed", err);
      setDiffSides(null);
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
              clearDetail();
              setBranch(event.target.value);
            }}
            disabled={busy}
          >
            <option value={ALL_BRANCHES}>全部</option>
            {branchNames.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </label>
      </header>
      <div className="log-body">
        <ul className="log-commits">
          {rows.length === 0 ? (
            <li className="log-empty">{busy ? "加载中…" : "没有提交"}</li>
          ) : (
            rows.map((row) => {
              const labels = parseCommitRefs(row.refs, remotePrefixes);
              const unpushedTip =
                labels.some((l) => l.kind === "local") &&
                !labels.some((l) => l.kind === "remote");
              return (
                <li
                  key={row.hash}
                  className={
                    selectedHash === row.hash
                      ? "log-commit selected"
                      : "log-commit"
                  }
                >
                  <button
                    type="button"
                    className="log-commit-row"
                    onClick={() => {
                      void selectCommit(row);
                    }}
                  >
                    <span className="log-short-hash">{row.shortHash}</span>
                    <span className="log-subject-line">
                      <span className="log-subject">{row.subject}</span>
                      <RefChips labels={labels} />
                      {unpushedTip ? (
                        <span
                          className="log-unpushed-hint"
                          title="尚未推送到远程"
                        >
                          未推送
                        </span>
                      ) : null}
                    </span>
                    <span className="log-meta">
                      {row.author} · {row.date}
                    </span>
                  </button>
                </li>
              );
            })
          )}
        </ul>
        <div className="log-detail">
          <div className="push-confirm-files-panel log-files-panel">
            <div className="push-confirm-panel-title">变更文件</div>
            <ul className="push-confirm-files">
              {!selectedHash ? (
                <li className="push-confirm-empty">选择提交查看文件</li>
              ) : filesBusy ? (
                <li className="push-confirm-empty">加载中…</li>
              ) : files.length === 0 ? (
                <li className="push-confirm-empty">没有文件变更</li>
              ) : (
                files.map((file) => (
                  <li
                    key={`${file.status}:${file.path}`}
                    className={
                      selectedFile === file.path
                        ? "push-confirm-file selected"
                        : "push-confirm-file"
                    }
                  >
                    <button
                      type="button"
                      className="push-confirm-file-btn"
                      onClick={() => setSelectedFile(file.path)}
                      onDoubleClick={() => {
                        void openFileDiff(file);
                      }}
                      title="双击查看 Diff"
                    >
                      <span className="push-confirm-file-status">
                        {file.status}
                      </span>
                      <span className="push-confirm-file-path">
                        {file.oldPath
                          ? `${file.oldPath} → ${file.path}`
                          : file.path}
                      </span>
                    </button>
                  </li>
                ))
              )}
            </ul>
          </div>
          <div className="push-confirm-diff log-diff-panel">
            {diffSides ? (
              <SideBySideDiff
                before={diffSides.before}
                after={diffSides.after}
                binary={diffSides.binary}
                fileLabel={selectedFile ?? undefined}
              />
            ) : (
              <div className="push-confirm-diff-placeholder">
                双击文件查看左右 Diff
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
