import { useEffect, useMemo, useRef, useState } from "react";
import {
  addToGitignore,
  commit,
  getDiffSides,
  listCommitsToPush,
  push,
  stagePaths,
  unstagePaths,
  type DiffSides,
} from "../../api/git";
import type { FileChange, PushPreview, RepoStatus } from "../../types";
import {
  buildChangeTree,
  collectFilePaths,
  ignorePatternForNode,
  type ChangeTreeNode,
} from "../../lib/changeTree";
import {
  parentPathLabel,
  splitTrackedAndUntracked,
  statusColorClass,
} from "../../lib/fileStatus";
import { ErrorBanner } from "../ErrorBanner";
import { PushConfirmDialog } from "../PushConfirmDialog";
import { SideBySideDiff } from "../SideBySideDiff";

type CommitTabProps = {
  path: string;
  status: RepoStatus | null;
  onChanged: () => Promise<void>;
};

type ContextMenuState = {
  x: number;
  y: number;
  node: ChangeTreeNode;
};

type SectionId = "tracked" | "untracked";
type ViewMode = "tree" | "list";

const VIEW_MODE_KEY = "idea-git.commitViewMode";

function loadViewMode(): ViewMode {
  try {
    const saved = localStorage.getItem(VIEW_MODE_KEY);
    if (saved === "list" || saved === "tree") return saved;
  } catch {
    /* ignore */
  }
  return "tree";
}

function errorMessage(err: unknown): string {
  if (typeof err === "string") return err;
  if (err instanceof Error) return err.message;
  return String(err);
}

function isStaged(change: FileChange): boolean {
  return change.indexStatus !== " " && change.indexStatus !== "?";
}

function shouldShowStagedDiff(change: FileChange): boolean {
  const worktreeDirty =
    change.worktreeStatus !== " " && change.worktreeStatus !== "?";
  return isStaged(change) && !worktreeDirty;
}

function fileDisplayName(change: FileChange): string {
  const parts = change.path.split("/");
  return parts[parts.length - 1] || change.path;
}

function allDirPaths(nodes: ChangeTreeNode[], prefix: string): string[] {
  const paths: string[] = [];
  for (const node of nodes) {
    if (node.kind === "dir") {
      paths.push(`${prefix}${node.fullPath}`);
      paths.push(...allDirPaths(node.children ?? [], prefix));
    }
  }
  return paths;
}

function expandKey(section: SectionId, fullPath: string): string {
  return `${section}:${fullPath}`;
}

export function CommitTab({ path, status, onChanged }: CommitTabProps) {
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [diffSides, setDiffSides] = useState<DiffSides | null>(null);
  const [message, setMessage] = useState("");
  const [amend, setAmend] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [pushPreview, setPushPreview] = useState<PushPreview | null>(null);
  const [pushBusy, setPushBusy] = useState(false);
  const [pushError, setPushError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [sectionOpen, setSectionOpen] = useState({
    tracked: true,
    untracked: true,
  });
  const [viewMode, setViewMode] = useState<ViewMode>(loadViewMode);
  const [menu, setMenu] = useState<ContextMenuState | null>(null);
  const knownRef = useRef<{
    path: string;
    files: Set<string>;
    dirs: Set<string>;
  }>({
    path: "",
    files: new Set(),
    dirs: new Set(),
  });

  const changes = status?.changes ?? [];
  const { tracked, untracked } = useMemo(
    () => splitTrackedAndUntracked(changes),
    [changes],
  );
  const trackedTree = useMemo(() => buildChangeTree(tracked), [tracked]);
  const untrackedTree = useMemo(() => buildChangeTree(untracked), [untracked]);
  const changeByPath = useMemo(() => {
    const map = new Map<string, FileChange>();
    for (const change of changes) {
      map.set(change.path, change);
    }
    return map;
  }, [changes]);

  useEffect(() => {
    const files = (status?.changes ?? []).map((change) => change.path);
    const { tracked: t, untracked: u } = splitTrackedAndUntracked(
      status?.changes ?? [],
    );
    const dirs = [
      ...allDirPaths(buildChangeTree(t), "tracked:"),
      ...allDirPaths(buildChangeTree(u), "untracked:"),
    ];
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
      setDiffSides(null);
      setMessage("");
      setAmend(false);
      setError(null);
      setMenu(null);
      setSectionOpen({ tracked: true, untracked: true });
      setExpanded(new Set(dirs));
    } else {
      setExpanded((prev) => {
        const next = new Set([...prev].filter((d) => dirs.includes(d)));
        for (const d of dirs) {
          if (!knownRef.current.dirs.has(d)) {
            next.add(d);
          }
        }
        return next;
      });
    }
    knownRef.current = {
      path,
      files: new Set(files),
      dirs: new Set(dirs),
    };
  }, [path, status]);

  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    window.addEventListener("click", close);
    window.addEventListener("scroll", close, true);
    return () => {
      window.removeEventListener("click", close);
      window.removeEventListener("scroll", close, true);
    };
  }, [menu]);

  async function loadDiff(change: FileChange) {
    setSelectedFile(change.path);
    try {
      const sides = await getDiffSides(
        path,
        change.path,
        shouldShowStagedDiff(change),
      );
      setDiffSides(sides);
      setError(null);
    } catch (err) {
      console.warn("getDiffSides failed", err);
      setError(errorMessage(err));
    }
  }

  function nodeCheckedState(node: ChangeTreeNode): boolean | "mixed" {
    const paths = collectFilePaths(node);
    if (paths.length === 0) return false;
    const checkedCount = paths.filter((p) => checked.has(p)).length;
    if (checkedCount === 0) return false;
    if (checkedCount === paths.length) return true;
    return "mixed";
  }

  async function togglePaths(paths: string[], nextChecked: boolean) {
    try {
      if (nextChecked) {
        await stagePaths(path, paths);
      } else {
        const toUnstage = paths.filter((p) => {
          const change = changeByPath.get(p);
          return change ? isStaged(change) : false;
        });
        if (toUnstage.length > 0) {
          await unstagePaths(path, toUnstage);
        }
      }
      setChecked((prev) => {
        const next = new Set(prev);
        for (const p of paths) {
          if (nextChecked) next.add(p);
          else next.delete(p);
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

  async function openPushConfirm() {
    setError(null);
    setSuccess(null);
    setPushError(null);
    try {
      console.info("CommitTab openPushConfirm enter");
      const preview = await listCommitsToPush(path);
      if (preview.commits.length === 0) {
        setError("没有可推送的提交");
        setPushPreview(null);
        return;
      }
      setPushPreview(preview);
    } catch (err) {
      console.warn("listCommitsToPush failed", err);
      setError(errorMessage(err));
      setPushPreview(null);
    }
  }

  async function handleCommit(alsoPush: boolean) {
    setBusy(true);
    setError(null);
    setSuccess(null);
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
      setMessage("");
      setAmend(false);
      setSelectedFile(null);
      setDiffSides(null);
      await onChanged();
      if (alsoPush) {
        await openPushConfirm();
      }
    } catch (err) {
      console.warn(alsoPush ? "commit and push failed" : "commit failed", err);
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function handlePushOnly() {
    setBusy(true);
    try {
      await openPushConfirm();
    } finally {
      setBusy(false);
    }
  }

  async function confirmPush() {
    if (!pushPreview) return;
    setPushBusy(true);
    setPushError(null);
    try {
      console.info("CommitTab confirmPush enter");
      await push(path);
      const count = pushPreview.commits.length;
      const dest = `${pushPreview.remote}/${pushPreview.branch}`;
      setPushPreview(null);
      setSuccess(`已推送到 ${dest}（${count} 个提交）`);
      await onChanged();
      console.info("CommitTab confirmPush exit");
    } catch (err) {
      console.warn("push failed", err);
      setPushError(errorMessage(err));
    } finally {
      setPushBusy(false);
    }
  }

  useEffect(() => {
    if (!success) return;
    const timer = window.setTimeout(() => setSuccess(null), 3000);
    return () => window.clearTimeout(timer);
  }, [success]);

  async function handleIgnore(node: ChangeTreeNode) {
    const pattern = ignorePatternForNode(node);
    setMenu(null);
    try {
      console.info("CommitTab ignore pattern=", pattern);
      await addToGitignore(path, pattern);
      setError(null);
      await onChanged();
    } catch (err) {
      console.warn("addToGitignore failed", err);
      setError(errorMessage(err));
    }
  }

  function toggleExpanded(section: SectionId, fullPath: string) {
    const key = expandKey(section, fullPath);
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function setViewModePersist(mode: ViewMode) {
    setViewMode(mode);
    try {
      localStorage.setItem(VIEW_MODE_KEY, mode);
    } catch {
      /* ignore */
    }
  }

  function fileAsNode(change: FileChange): ChangeTreeNode {
    return {
      name: fileDisplayName(change),
      fullPath: change.path,
      kind: "file",
      change,
    };
  }

  function renderFileRow(
    change: FileChange,
    depth: number,
    section: SectionId,
    showTwistieSpacer: boolean,
  ) {
    const pad = { paddingLeft: `${8 + depth * 14}px` };
    const parent = parentPathLabel(change.path);
    const node = fileAsNode(change);
    return (
      <li key={`${section}:file:${change.path}`} className="commit-tree-item">
        <div
          className={
            selectedFile === change.path
              ? "commit-change commit-tree-row selected"
              : "commit-change commit-tree-row"
          }
          style={pad}
          onContextMenu={(event) => {
            event.preventDefault();
            setMenu({ x: event.clientX, y: event.clientY, node });
          }}
        >
          {showTwistieSpacer ? (
            <span className="commit-tree-twistie-spacer" />
          ) : null}
          <input
            type="checkbox"
            checked={checked.has(change.path)}
            onChange={(event) => {
              void togglePaths([change.path], event.target.checked);
            }}
          />
          <button
            type="button"
            className={`commit-change-name ${statusColorClass(change)}`}
            onClick={() => {
              void loadDiff(change);
            }}
            title={change.path}
          >
            <span className="commit-file-name">{fileDisplayName(change)}</span>
            {parent ? <span className="commit-file-path">{parent}</span> : null}
          </button>
        </div>
      </li>
    );
  }

  function renderNode(node: ChangeTreeNode, depth: number, section: SectionId) {
    const pad = { paddingLeft: `${8 + depth * 14}px` };
    const checkedState = nodeCheckedState(node);
    const keyPrefix = `${section}:`;

    if (node.kind === "dir") {
      const open = expanded.has(expandKey(section, node.fullPath));
      return (
        <li key={`${keyPrefix}dir:${node.fullPath}`} className="commit-tree-item">
          <div
            className="commit-change commit-tree-row"
            style={pad}
            onContextMenu={(event) => {
              event.preventDefault();
              setMenu({ x: event.clientX, y: event.clientY, node });
            }}
          >
            <button
              type="button"
              className="commit-tree-twistie"
              aria-label={open ? "折叠" : "展开"}
              onClick={() => toggleExpanded(section, node.fullPath)}
            >
              {open ? "▾" : "▸"}
            </button>
            <input
              type="checkbox"
              checked={checkedState === true}
              ref={(el) => {
                if (el) el.indeterminate = checkedState === "mixed";
              }}
              onChange={(event) => {
                void togglePaths(collectFilePaths(node), event.target.checked);
              }}
            />
            <span className="commit-tree-dirname">{node.name}</span>
          </div>
          {open ? (
            <ul className="commit-tree-children">
              {(node.children ?? []).map((child) =>
                renderNode(child, depth + 1, section),
              )}
            </ul>
          ) : null}
        </li>
      );
    }

    return renderFileRow(node.change!, depth, section, true);
  }

  function renderSectionHeader(
    section: SectionId,
    title: string,
    files: FileChange[],
  ) {
    const open = sectionOpen[section];
    const paths = files.map((f) => f.path);
    const checkedCount = paths.filter((p) => checked.has(p)).length;
    const allChecked = paths.length > 0 && checkedCount === paths.length;
    const mixed = checkedCount > 0 && checkedCount < paths.length;
    return (
      <div className="commit-section-header">
        <button
          type="button"
          className="commit-tree-twistie"
          aria-label={open ? "折叠分组" : "展开分组"}
          onClick={() =>
            setSectionOpen((prev) => ({ ...prev, [section]: !prev[section] }))
          }
        >
          {open ? "▾" : "▸"}
        </button>
        <input
          type="checkbox"
          className="commit-section-check"
          checked={allChecked}
          ref={(el) => {
            if (el) el.indeterminate = mixed;
          }}
          disabled={paths.length === 0}
          title="全选本组"
          aria-label={`${title} 全选`}
          onChange={(event) => {
            void togglePaths(paths, event.target.checked);
          }}
        />
        <span className="commit-section-title">
          {title} {files.length} {files.length === 1 ? "file" : "files"}
        </span>
      </div>
    );
  }

  function renderTreeSection(
    section: SectionId,
    title: string,
    files: FileChange[],
    nodes: ChangeTreeNode[],
  ) {
    if (files.length === 0) return null;
    const open = sectionOpen[section];
    return (
      <li className="commit-section">
        {renderSectionHeader(section, title, files)}
        {open ? (
          <ul className="commit-tree-children">
            {nodes.map((node) => renderNode(node, 0, section))}
          </ul>
        ) : null}
      </li>
    );
  }

  function renderListSection(
    section: SectionId,
    title: string,
    files: FileChange[],
  ) {
    if (files.length === 0) return null;
    const open = sectionOpen[section];
    const sorted = [...files].sort((a, b) => a.path.localeCompare(b.path));
    return (
      <li className="commit-section">
        {renderSectionHeader(section, title, files)}
        {open ? (
          <ul className="commit-tree-children">
            {sorted.map((change) => renderFileRow(change, 0, section, false))}
          </ul>
        ) : null}
      </li>
    );
  }

  const canCommit = amend || message.trim().length > 0;

  return (
    <section className="commit-tab">
      {error ? <ErrorBanner message={error} /> : null}
      {success ? (
        <div className="success-banner" role="status">
          {success}
        </div>
      ) : null}
      <div className="commit-body">
        <div className="commit-changes-panel">
          <div className="commit-view-toggle" role="group" aria-label="展示方式">
            <button
              type="button"
              className={viewMode === "tree" ? "active" : undefined}
              onClick={() => setViewModePersist("tree")}
            >
              树状
            </button>
            <button
              type="button"
              className={viewMode === "list" ? "active" : undefined}
              onClick={() => setViewModePersist("list")}
            >
              列表
            </button>
          </div>
          <ul className="commit-changes commit-tree">
            {changes.length === 0 ? (
              <li className="commit-empty">没有变更</li>
            ) : viewMode === "tree" ? (
              <>
                {renderTreeSection(
                  "tracked",
                  "更改",
                  tracked,
                  trackedTree,
                )}
                {renderTreeSection(
                  "untracked",
                  "Unversioned Files",
                  untracked,
                  untrackedTree,
                )}
              </>
            ) : (
              <>
                {renderListSection("tracked", "更改", tracked)}
                {renderListSection("untracked", "Unversioned Files", untracked)}
              </>
            )}
          </ul>
        </div>
        <div className="commit-diff">
          <SideBySideDiff
            before={diffSides?.before ?? ""}
            after={diffSides?.after ?? ""}
            binary={diffSides?.binary}
            fileLabel={selectedFile ?? undefined}
          />
        </div>
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
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              void handlePushOnly();
            }}
            title="仅推送当前分支（可在外部已 commit 后使用）"
          >
            Push
          </button>
        </div>
      </footer>
      {menu ? (
        <div
          className="commit-context-menu"
          style={{ left: menu.x, top: menu.y }}
          onClick={(event) => event.stopPropagation()}
        >
          <button
            type="button"
            onClick={() => {
              void handleIgnore(menu.node);
            }}
          >
            添加到 .gitignore
          </button>
        </div>
      ) : null}
      {pushPreview ? (
        <PushConfirmDialog
          repoPath={path}
          preview={pushPreview}
          busy={pushBusy}
          error={pushError}
          onCancel={() => {
            if (pushBusy) return;
            setPushPreview(null);
            setPushError(null);
          }}
          onConfirm={() => {
            void confirmPush();
          }}
        />
      ) : null}
    </section>
  );
}
