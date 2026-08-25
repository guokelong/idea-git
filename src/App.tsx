import { useEffect, useState } from "react";
import { RepoSidebar } from "./components/RepoSidebar";
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
          <p className="app-placeholder">{selected.entry.name}</p>
        ) : (
          <p className="app-placeholder">选择一个仓库</p>
        )}
      </main>
    </div>
  );
}

export default App;
