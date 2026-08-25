import { open } from "@tauri-apps/plugin-dialog";
import { addRepo, removeRepo } from "../api/repos";
import type { RepoListItem } from "../types";

type RepoSidebarProps = {
  items: RepoListItem[];
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
            return (
              <li
                key={id}
                className={selected ? "repo-item selected" : "repo-item"}
              >
                <button
                  type="button"
                  className="repo-item-main"
                  onClick={() => onSelect(id)}
                  title={path}
                >
                  <span
                    className={item.valid ? "repo-name" : "repo-name invalid"}
                  >
                    {name}
                  </span>
                </button>
              </li>
            );
          })
        )}
      </ul>
    </aside>
  );
}
