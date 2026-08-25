import { useEffect, useState } from "react";
import { RepoSidebar } from "./components/RepoSidebar";
import { BranchesTab } from "./components/tabs/BranchesTab";
import { CommitTab } from "./components/tabs/CommitTab";
import { LogTab } from "./components/tabs/LogTab";
import { useRepoList } from "./hooks/useRepoList";
import "./App.css";

type WorkspaceTab = "commit" | "log" | "branches";

function App() {
  const { items, error, setError, refresh } = useRepoList();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tab, setTab] = useState<WorkspaceTab>("commit");

  useEffect(() => {
    setSelectedId((current) => {
      if (current && items.some((item) => item.entry.id === current)) {
        return current;
      }
      return null;
    });
  }, [items]);

  const selected = items.find((item) => item.entry.id === selectedId) ?? null;

  return (
    <div className="app-shell">
      <RepoSidebar
        items={items}
        selectedId={selectedId}
        onSelect={setSelectedId}
        onChanged={async () => {
          setError(null);
          await refresh();
        }}
        onError={setError}
      />
      <main className="app-main">
        {error ? <p className="app-error">{error}</p> : null}
        {selected ? (
          selected.valid ? (
            <div className="repo-workspace">
              <nav className="repo-tabs">
                <button
                  type="button"
                  className={tab === "commit" ? "repo-tab active" : "repo-tab"}
                  onClick={() => setTab("commit")}
                >
                  Commit
                </button>
                <button
                  type="button"
                  className={tab === "log" ? "repo-tab active" : "repo-tab"}
                  onClick={() => setTab("log")}
                >
                  Log
                </button>
                <button
                  type="button"
                  className={tab === "branches" ? "repo-tab active" : "repo-tab"}
                  onClick={() => setTab("branches")}
                >
                  Branches
                </button>
              </nav>
              {tab === "commit" ? (
                <CommitTab
                  path={selected.entry.path}
                  status={selected.status}
                  onChanged={async () => {
                    setError(null);
                    await refresh();
                  }}
                />
              ) : tab === "log" ? (
                <LogTab
                  path={selected.entry.path}
                  currentBranch={selected.status?.branch ?? null}
                />
              ) : (
                <BranchesTab
                  path={selected.entry.path}
                  onChanged={async () => {
                    setError(null);
                    await refresh();
                  }}
                />
              )}
            </div>
          ) : (
            <p className="app-placeholder">路径失效，请重新定位</p>
          )
        ) : (
          <p className="app-placeholder">选择一个仓库</p>
        )}
      </main>
    </div>
  );
}

export default App;
