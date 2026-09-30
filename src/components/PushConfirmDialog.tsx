import { useEffect, useState } from "react";
import {
  getCommitFileSides,
  listCommitFiles,
  type DiffSides,
} from "../api/git";
import type { CommitFileChange, CommitRow, PushPreview } from "../types";
import { ErrorBanner } from "./ErrorBanner";
import { SideBySideDiff } from "./SideBySideDiff";

type PushConfirmDialogProps = {
  repoPath: string;
  preview: PushPreview;
  busy: boolean;
  error: string | null;
  onCancel: () => void;
  onConfirm: () => void;
};

function errorMessage(err: unknown): string {
  if (typeof err === "string") return err;
  if (err instanceof Error) return err.message;
  return String(err);
}

export function PushConfirmDialog({
  repoPath,
  preview,
  busy,
  error,
  onCancel,
  onConfirm,
}: PushConfirmDialogProps) {
  const [selectedHash, setSelectedHash] = useState<string | null>(null);
  const [files, setFiles] = useState<CommitFileChange[]>([]);
  const [filesBusy, setFilesBusy] = useState(false);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [diffSides, setDiffSides] = useState<DiffSides | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !busy) {
        onCancel();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [busy, onCancel]);

  useEffect(() => {
    setSelectedHash(null);
    setFiles([]);
    setSelectedFile(null);
    setDiffSides(null);
    setLocalError(null);
  }, [preview]);

  async function selectCommit(row: CommitRow) {
    setSelectedHash(row.hash);
    setSelectedFile(null);
    setDiffSides(null);
    setFilesBusy(true);
    setLocalError(null);
    try {
      console.info("PushConfirmDialog listCommitFiles", row.hash);
      const next = await listCommitFiles(repoPath, row.hash);
      setFiles(next);
    } catch (err) {
      console.warn("listCommitFiles failed", err);
      setFiles([]);
      setLocalError(errorMessage(err));
    } finally {
      setFilesBusy(false);
    }
  }

  async function openFileDiff(file: CommitFileChange) {
    if (!selectedHash) return;
    setSelectedFile(file.path);
    setLocalError(null);
    try {
      console.info("PushConfirmDialog getCommitFileSides", file.path);
      const sides = await getCommitFileSides(
        repoPath,
        selectedHash,
        file.path,
        file.oldPath,
      );
      setDiffSides(sides);
    } catch (err) {
      console.warn("getCommitFileSides failed", err);
      setDiffSides(null);
      setLocalError(errorMessage(err));
    }
  }

  const title = preview.newBranch
    ? `Push Commits to ${preview.remote}`
    : `Push Commits to ${preview.remote}/${preview.branch}`;
  const banner = error ?? localError;

  return (
    <div className="modal-backdrop" role="presentation">
      <div
        className="modal-dialog push-confirm-dialog push-confirm-wide"
        role="dialog"
        aria-modal="true"
        aria-labelledby="push-confirm-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="modal-header">
          <h2 id="push-confirm-title">{title}</h2>
          {preview.newBranch ? (
            <p className="modal-subtitle">将创建远程分支并设置 upstream</p>
          ) : null}
        </header>
        {banner ? <ErrorBanner message={banner} /> : null}
        <div className="push-confirm-body">
          <ul className="push-confirm-list">
            {preview.commits.map((row) => (
              <li
                key={row.hash}
                className={
                  selectedHash === row.hash
                    ? "push-confirm-item selected"
                    : "push-confirm-item"
                }
              >
                <button
                  type="button"
                  className="push-confirm-commit-btn"
                  disabled={busy}
                  onClick={() => {
                    void selectCommit(row);
                  }}
                >
                  <div className="push-confirm-subject">
                    <code>{row.shortHash}</code> {row.subject}
                  </div>
                  <div className="push-confirm-meta">
                    {row.author} · {row.date}
                  </div>
                </button>
              </li>
            ))}
          </ul>
          <div className="push-confirm-files-panel">
            <div className="push-confirm-panel-title">变更文件</div>
            <ul className="push-confirm-files">
              {!selectedHash ? (
                <li className="push-confirm-empty">点击左侧提交查看文件</li>
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
                      disabled={busy}
                      onDoubleClick={() => {
                        void openFileDiff(file);
                      }}
                      onClick={() => setSelectedFile(file.path)}
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
          <div className="push-confirm-diff">
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
        <footer className="modal-actions">
          <button type="button" disabled={busy} onClick={onCancel}>
            Cancel
          </button>
          <button
            type="button"
            className="primary"
            disabled={busy}
            onClick={onConfirm}
          >
            {busy ? "Pushing…" : "Push"}
          </button>
        </footer>
      </div>
    </div>
  );
}
