import { useEffect, useState } from "react";
import {
  checkoutBranch,
  createBranch,
  deleteBranch,
  listBranches,
} from "../../api/git";
import type { BranchRow } from "../../types";
import { ErrorBanner } from "../ErrorBanner";

type BranchesTabProps = {
  path: string;
  onChanged: () => Promise<void>;
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

export function BranchesTab({ path, onChanged }: BranchesTabProps) {
  const [rows, setRows] = useState<BranchRow[]>([]);
  const [newName, setNewName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function refresh() {
    console.info("BranchesTab load enter path=", path);
    const next = await listBranches(path);
    setRows(next);
    setError(null);
    console.info("BranchesTab load exit count=", next.length);
  }

  useEffect(() => {
    let cancelled = false;
    setBusy(true);
    setNewName("");
    listBranches(path)
      .then((next) => {
        if (cancelled) return;
        setRows(next);
        setError(null);
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
      <ul className="branches-list">
        {rows.length === 0 ? (
          <li className="branches-empty">{busy ? "加载中…" : "没有分支"}</li>
        ) : (
          rows.map((row) => {
            const track = trackingLabel(row);
            return (
              <li
                key={`${row.isRemote ? "r" : "l"}:${row.name}`}
                className={
                  row.isCurrent ? "branches-row current" : "branches-row"
                }
              >
                <div className="branches-info">
                  <span className="branches-name">
                    {row.isCurrent ? "* " : ""}
                    {row.name}
                  </span>
                  <span className="branches-meta">
                    {row.isRemote ? "远程" : "本地"}
                    {track ? ` · ${track}` : ""}
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
          })
        )}
      </ul>
    </section>
  );
}
