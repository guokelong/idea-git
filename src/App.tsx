import { useEffect, useState } from "react";
import { RepoSidebar } from "./components/RepoSidebar";
import { CommitTab } from "./components/tabs/CommitTab";
import { useRepoList } from "./hooks/useRepoList";
import "./App.css";

function App() {
  const { items, error, setError, refresh } = useRepoList();
  const [selectedId, setSelectedId] = useState<string | null>(null);

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
                <span className="repo-tab active">Commit</span>
              </nav>
              <CommitTab
                path={selected.entry.path}
                status={selected.status}
                onChanged={async () => {
                  setError(null);
                  await refresh();
                }}
              />
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
