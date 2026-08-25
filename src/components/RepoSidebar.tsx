import { open } from "@tauri-apps/plugin-dialog";
import { addRepo, relocateRepo, removeRepo } from "../api/repos";
import {
  formatRepoStatusLine,
  type RepoOverviewItem,
} from "../hooks/useRepoList";

type RepoSidebarProps = {
  items: RepoOverviewItem[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onChanged: () => Promise<void>;
  onError: (message: string) => void;
};

function errorMessage(err: unknown): string {
  if (typeof err === "string") return err;
  if (err instanceof Error) return err.message;
  return String(err);
}

export function RepoSidebar({
  items,
  selectedId,
  onSelect,
  onChanged,
  onError,
}: RepoSidebarProps) {
  async function handleAdd() {
    try {
      const selected = await open({ directory: true, multiple: false });
      if (typeof selected !== "string") {
        return;
      }
      await addRepo(selected);
      await onChanged();
    } catch (err) {
      console.warn("addRepo failed", err);
      onError(errorMessage(err));
    }
  }

  async function handleRemove(id: string) {
    try {
      await removeRepo(id);
      await onChanged();
    } catch (err) {
      console.warn("removeRepo failed", err);
      onError(errorMessage(err));
    }
  }

  async function handleRelocate(id: string) {
    try {
      const selected = await open({ directory: true, multiple: false });
      if (typeof selected !== "string") {
        return;
      }
      await relocateRepo(id, selected);
      await onChanged();
    } catch (err) {
      console.warn("relocateRepo failed", err);
      onError(errorMessage(err));
    }
  }

  return (
    <aside className="repo-sidebar">
      <header className="repo-sidebar-header">
        <h2>仓库</h2>
        <div className="repo-sidebar-actions">
          <button type="button" onClick={handleAdd}>
            添加
          </button>
          <button
            type="button"
            onClick={() => {
              if (selectedId) {
                void handleRemove(selectedId);
              }
            }}
            disabled={!selectedId}
          >
            删除
          </button>
        </div>
      </header>
      <ul className="repo-list">
        {items.length === 0 ? (
          <li className="repo-empty">尚未添加仓库</li>
        ) : (
          items.map((item) => {
            const { id, name, path } = item.entry;
            const selected = id === selectedId;
            const classes = [
              "repo-item",
              selected ? "selected" : "",
              item.valid ? "" : "invalid",
            ]
              .filter(Boolean)
              .join(" ");
            return (
              <li key={id} className={classes}>
                <button
                  type="button"
                  className="repo-item-main"
                  onClick={() => onSelect(id)}
                  title={path}
                >
                  <span className="repo-name-row">
                    <span
                      className={item.valid ? "repo-name" : "repo-name invalid"}
                    >
                      {name}
                    </span>
                    {item.status?.hasConflicts ? (
                      <span className="repo-conflict-badge">冲突</span>
                    ) : null}
                  </span>
                  <span className="repo-status-line">
                    {item.valid
                      ? item.status
                        ? formatRepoStatusLine(item.status)
                        : "状态未知"
                      : "路径失效"}
                  </span>
                </button>
                {item.valid ? null : (
                  <button
                    type="button"
                    className="repo-relocate"
                    onClick={() => {
                      void handleRelocate(id);
                    }}
                  >
                    重新定位
                  </button>
                )}
              </li>
            );
          })
        )}
      </ul>
    </aside>
  );
}
