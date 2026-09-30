import { useEffect, useMemo, useState } from "react";
import {
  checkoutBranch,
  checkoutRemoteBranch,
  createBranch,
  createBranchFrom,
  deleteBranch,
  listBranches,
} from "../../api/git";
import type { BranchRow } from "../../types";
import {
  allBranchDirPaths,
  buildBranchTree,
  localNameFromRemote,
  splitLocalAndRemote,
  type BranchTreeNode,
} from "../../lib/branchTree";
import { ErrorBanner } from "../ErrorBanner";
import { NewBranchFromDialog } from "../NewBranchFromDialog";

type BranchesTabProps = {
  path: string;
  onChanged: () => Promise<void>;
};

type SectionId = "local" | "remote";

type ContextMenuState = {
  x: number;
  y: number;
  row: BranchRow;
};

function errorMessage(err: unknown): string {
  if (typeof err === "string") return err;
  if (err instanceof Error) return err.message;
  return String(err);
}

function trackingLabel(row: BranchRow): string {
  const parts: string[] = [];
  if (row.upstream) {
    parts.push(row.upstream);
  }
  if (row.ahead > 0) {
    parts.push(`↑${row.ahead}`);
  }
  if (row.behind > 0) {
    parts.push(`↓${row.behind}`);
  }
  return parts.join(" ");
}

function expandKey(section: SectionId, fullPath: string): string {
  return `${section}:${fullPath}`;
}

export function BranchesTab({ path, onChanged }: BranchesTabProps) {
  const [rows, setRows] = useState<BranchRow[]>([]);
  const [newName, setNewName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sectionOpen, setSectionOpen] = useState({
    local: true,
    remote: true,
  });
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [menu, setMenu] = useState<ContextMenuState | null>(null);
  const [newBranchFrom, setNewBranchFrom] = useState<{
    remoteRef: string;
    suggestedName: string;
  } | null>(null);
  const [dialogError, setDialogError] = useState<string | null>(null);

  const { local, remote } = useMemo(() => splitLocalAndRemote(rows), [rows]);
  const localTree = useMemo(() => buildBranchTree(local), [local]);
  const remoteTree = useMemo(() => buildBranchTree(remote), [remote]);

  async function refresh() {
    console.info("BranchesTab load enter path=", path);
    const next = await listBranches(path);
    setRows(next);
    setError(null);
    const { local: loc, remote: rem } = splitLocalAndRemote(next);
    setExpanded(
      new Set([
        ...allBranchDirPaths(buildBranchTree(loc), "local:"),
        ...allBranchDirPaths(buildBranchTree(rem), "remote:"),
      ]),
    );
    console.info("BranchesTab load exit count=", next.length);
  }

  useEffect(() => {
    let cancelled = false;
    setBusy(true);
    setNewName("");
    setMenu(null);
    setSectionOpen({ local: true, remote: true });
    listBranches(path)
      .then((next) => {
        if (cancelled) return;
        setRows(next);
        setError(null);
        const { local: loc, remote: rem } = splitLocalAndRemote(next);
        setExpanded(
          new Set([
            ...allBranchDirPaths(buildBranchTree(loc), "local:"),
            ...allBranchDirPaths(buildBranchTree(rem), "remote:"),
          ]),
        );
        console.info("BranchesTab load exit count=", next.length);
      })
      .catch((err) => {
        if (cancelled) return;
        console.warn("listBranches failed", err);
        setRows([]);
        setError(errorMessage(err));
      })
      .finally(() => {
        if (!cancelled) setBusy(false);
      });
    return () => {
      cancelled = true;
    };
  }, [path]);

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

  async function afterMutation() {
    await refresh();
    await onChanged();
  }

  async function handleCreate(checkout: boolean) {
    const name = newName.trim();
    if (!name) return;
    setBusy(true);
    setError(null);
    try {
      await createBranch(path, name, checkout);
      setNewName("");
      await afterMutation();
    } catch (err) {
      console.warn("createBranch failed", err);
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleCheckout(name: string) {
    setBusy(true);
    setError(null);
    try {
      await checkoutBranch(path, name);
      await afterMutation();
    } catch (err) {
      console.warn("checkoutBranch failed", err);
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleCheckoutRemote(remoteRef: string) {
    setMenu(null);
    setBusy(true);
    setError(null);
    try {
      console.info("BranchesTab checkout remote", remoteRef);
      await checkoutRemoteBranch(path, remoteRef);
      await afterMutation();
    } catch (err) {
      console.warn("checkoutRemoteBranch failed", err);
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleNewBranchFrom(remoteRef: string) {
    setMenu(null);
    setDialogError(null);
    setNewBranchFrom({
      remoteRef,
      suggestedName: localNameFromRemote(remoteRef),
    });
  }

  async function confirmNewBranchFrom(name: string) {
    if (!newBranchFrom) return;
    const { remoteRef } = newBranchFrom;
    setBusy(true);
    setDialogError(null);
    setError(null);
    try {
      console.info("BranchesTab new branch from", remoteRef, "→", name);
      await createBranchFrom(path, name, remoteRef, true);
      setNewBranchFrom(null);
      await afterMutation();
    } catch (err) {
      console.warn("createBranchFrom failed", err);
      setDialogError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(name: string) {
    if (!window.confirm(`删除分支 ${name}？`)) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await deleteBranch(path, name, false);
      await afterMutation();
    } catch (err) {
      const message = errorMessage(err);
      console.warn("deleteBranch failed", err);
      if (window.confirm(`${message}\n\n强制删除 ${name}？`)) {
        try {
          await deleteBranch(path, name, true);
          setError(null);
          await afterMutation();
        } catch (forceErr) {
          console.warn("deleteBranch force failed", forceErr);
          setError(errorMessage(forceErr));
        }
      } else {
        setError(message);
      }
    } finally {
      setBusy(false);
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

  function renderBranchRow(row: BranchRow, depth: number, section: SectionId) {
    const track = trackingLabel(row);
    const pad = { paddingLeft: `${8 + depth * 14}px` };
    return (
      <li
        key={`${section}:branch:${row.name}`}
        className={row.isCurrent ? "branches-row current" : "branches-row"}
        style={pad}
        onContextMenu={(event) => {
          if (!row.isRemote) return;
          event.preventDefault();
          setMenu({ x: event.clientX, y: event.clientY, row });
        }}
      >
        <span className="commit-tree-twistie-spacer" />
        <div className="branches-info">
          <span className="branches-name">
            {row.isCurrent ? "* " : ""}
            {row.name.includes("/")
              ? row.name.split("/").pop()
              : row.name}
          </span>
          <span className="branches-meta">
            {track || (row.isRemote ? "远程" : "本地")}
          </span>
        </div>
        <div className="branches-actions">
          {!row.isRemote && !row.isCurrent ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                void handleCheckout(row.name);
              }}
            >
              切换
            </button>
          ) : null}
          {!row.isRemote && !row.isCurrent ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                void handleDelete(row.name);
              }}
            >
              删除
            </button>
          ) : null}
        </div>
      </li>
    );
  }

  function renderNode(
    node: BranchTreeNode,
    depth: number,
    section: SectionId,
  ) {
    if (node.kind === "dir") {
      const open = expanded.has(expandKey(section, node.fullPath));
      const pad = { paddingLeft: `${8 + depth * 14}px` };
      return (
        <li key={`${section}:dir:${node.fullPath}`} className="branches-tree-item">
          <div className="branches-dir-row" style={pad}>
            <button
              type="button"
              className="commit-tree-twistie"
              aria-label={open ? "折叠" : "展开"}
              onClick={() => toggleExpanded(section, node.fullPath)}
            >
              {open ? "▾" : "▸"}
            </button>
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
    return renderBranchRow(node.branch!, depth, section);
  }

  function renderSection(
    section: SectionId,
    title: string,
    branches: BranchRow[],
    nodes: BranchTreeNode[],
  ) {
    if (branches.length === 0) return null;
    const open = sectionOpen[section];
    return (
      <li className="branches-section">
        <div className="commit-section-header">
          <button
            type="button"
            className="commit-tree-twistie"
            aria-label={open ? "折叠分组" : "展开分组"}
            onClick={() =>
              setSectionOpen((prev) => ({
                ...prev,
                [section]: !prev[section],
              }))
            }
          >
            {open ? "▾" : "▸"}
          </button>
          <span className="commit-section-title">
            {title} {branches.length}
          </span>
        </div>
        {open ? (
          <ul className="commit-tree-children">
            {nodes.map((node) => renderNode(node, 0, section))}
          </ul>
        ) : null}
      </li>
    );
  }

  return (
    <section className="branches-tab">
      {error ? <ErrorBanner message={error} /> : null}
      <header className="branches-toolbar">
        <input
          className="branches-new-name"
          placeholder="新分支名"
          value={newName}
          onChange={(event) => setNewName(event.target.value)}
          disabled={busy}
        />
        <button
          type="button"
          disabled={busy || newName.trim().length === 0}
          onClick={() => {
            void handleCreate(false);
          }}
        >
          新建
        </button>
        <button
          type="button"
          disabled={busy || newName.trim().length === 0}
          onClick={() => {
            void handleCreate(true);
          }}
        >
          新建并切换
        </button>
      </header>
      <ul className="branches-list commit-tree">
        {rows.length === 0 ? (
          <li className="branches-empty">{busy ? "加载中…" : "没有分支"}</li>
        ) : (
          <>
            {renderSection("local", "本地", local, localTree)}
            {renderSection("remote", "远程", remote, remoteTree)}
          </>
        )}
      </ul>
      {menu ? (
        <div
          className="commit-context-menu"
          style={{ left: menu.x, top: menu.y }}
          onClick={(event) => event.stopPropagation()}
        >
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              void handleCheckoutRemote(menu.row.name);
            }}
          >
            Checkout
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              handleNewBranchFrom(menu.row.name);
            }}
          >
            {`New Branch from '${menu.row.name}'…`}
          </button>
        </div>
      ) : null}
      {newBranchFrom ? (
        <NewBranchFromDialog
          remoteRef={newBranchFrom.remoteRef}
          suggestedName={newBranchFrom.suggestedName}
          busy={busy}
          error={dialogError}
          onCancel={() => {
            if (busy) return;
            setNewBranchFrom(null);
            setDialogError(null);
          }}
          onConfirm={(name) => {
            void confirmNewBranchFrom(name);
          }}
        />
      ) : null}
    </section>
  );
}
