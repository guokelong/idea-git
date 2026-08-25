import { useCallback, useEffect, useState } from "react";
import { listRepos } from "./api/repos";
import { RepoSidebar } from "./components/RepoSidebar";
import type { RepoListItem } from "./types";
import "./App.css";

function App() {
  const [items, setItems] = useState<RepoListItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    console.info("refresh repos enter");
    const next = await listRepos();
    setItems(next);
    setSelectedId((current) => {
      if (current && next.some((item) => item.entry.id === current)) {
        return current;
      }
      return null;
    });
    console.info("refresh repos exit count=", next.length);
  }, []);

  useEffect(() => {
    refresh().catch((err) => {
      console.warn("listRepos failed", err);
      setError(typeof err === "string" ? err : err instanceof Error ? err.message : String(err));
    });
  }, [refresh]);

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
          <p className="app-placeholder">{selected.entry.name}</p>
        ) : (
          <p className="app-placeholder">选择一个仓库</p>
        )}
      </main>
    </div>
  );
}

export default App;
