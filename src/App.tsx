import { getCurrentWebview } from "@tauri-apps/api/webview";
import { useCallback, useEffect, useState } from "react";
import { checkGit } from "./api/git";
import { addRepo } from "./api/repos";
import { ConflictBanner } from "./components/ConflictBanner";
import { RepoSidebar } from "./components/RepoSidebar";
import { BranchesTab } from "./components/tabs/BranchesTab";
import { CommitTab } from "./components/tabs/CommitTab";
import { LogTab } from "./components/tabs/LogTab";
import { useRepoList } from "./hooks/useRepoList";
import "./App.css";

type WorkspaceTab = "commit" | "log" | "branches";
type GitGate = "checking" | "ready" | "missing";

function errorMessage(err: unknown): string {
  if (typeof err === "string") return err;
  if (err instanceof Error) return err.message;
  return String(err);
}

function pathsFromDataTransfer(dt: DataTransfer): string[] {
  const paths: string[] = [];
  for (const file of Array.from(dt.files)) {
    const path = (file as File & { path?: string }).path;
    if (path) {
      paths.push(path);
    }
  }
  return paths;
}

function App() {
  const { items, error, setError, refresh } = useRepoList();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tab, setTab] = useState<WorkspaceTab>("commit");
  const [gitGate, setGitGate] = useState<GitGate>("checking");
  const [dropActive, setDropActive] = useState(false);
  const [tauriDropReady, setTauriDropReady] = useState(false);

  const handleRefresh = useCallback(async () => {
    setError(null);
    await refresh();
  }, [refresh, setError]);

  const addDroppedPaths = useCallback(
    async (paths: string[]) => {
      console.info("addDroppedPaths enter count=", paths.length);
      if (paths.length === 0) {
        setError("无法读取拖拽路径，请使用「添加」按钮选择文件夹。");
        return;
      }
      try {
        for (const path of paths) {
          await addRepo(path);
        }
        setError(null);
        await refresh();
        console.info("addDroppedPaths exit");
      } catch (err) {
        console.warn("addDroppedPaths failed", err);
        setError(errorMessage(err));
      }
    },
    [refresh, setError],
  );

  useEffect(() => {
    console.info("App checkGit start");
    checkGit()
      .then((available) => {
        console.info("App checkGit done available=", available);
        setGitGate(available ? "ready" : "missing");
      })
      .catch((err) => {
        console.warn("App checkGit failed", err);
        setGitGate("missing");
      });
  }, []);

  useEffect(() => {
    setSelectedId((current) => {
      if (current && items.some((item) => item.entry.id === current)) {
        return current;
      }
      return null;
    });
  }, [items]);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let cancelled = false;
    try {
      void getCurrentWebview()
        .onDragDropEvent((event) => {
          if (event.payload.type === "enter" || event.payload.type === "over") {
            setDropActive(true);
          } else if (event.payload.type === "leave") {
            setDropActive(false);
          } else if (event.payload.type === "drop") {
            setDropActive(false);
            void addDroppedPaths(event.payload.paths);
          }
        })
        .then((fn) => {
          if (cancelled) {
            fn();
            return;
          }
          unlisten = fn;
          setTauriDropReady(true);
        })
        .catch((err) => {
          console.warn("onDragDropEvent unavailable", err);
        });
    } catch (err) {
      console.warn("onDragDropEvent unavailable", err);
    }
    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, [addDroppedPaths]);

  const selected = items.find((item) => item.entry.id === selectedId) ?? null;

  if (gitGate === "checking") {
    return (
      <div className="git-missing" role="status">
        正在检测 Git…
      </div>
    );
  }

  if (gitGate === "missing") {
    return (
      <div className="git-missing" role="alert">
        <h1>未检测到 Git</h1>
        <p>
          请安装 Git 并确保命令 <code>git</code> 在 PATH 中，然后重新启动本应用。
        </p>
        <p>
          macOS 可使用 <code>xcode-select --install</code>，或从 git-scm.com
          安装。
        </p>
      </div>
    );
  }

  return (
    <div
      className={dropActive ? "app-shell drop-active" : "app-shell"}
      onDragOver={(event) => {
        if (tauriDropReady) {
          return;
        }
        event.preventDefault();
        setDropActive(true);
      }}
      onDragLeave={() => {
        if (tauriDropReady) {
          return;
        }
        setDropActive(false);
      }}
      onDrop={(event) => {
        if (tauriDropReady) {
          return;
        }
        event.preventDefault();
        setDropActive(false);
        void addDroppedPaths(pathsFromDataTransfer(event.dataTransfer));
      }}
    >
      <RepoSidebar
        items={items}
        selectedId={selectedId}
        onSelect={setSelectedId}
        onChanged={handleRefresh}
        onError={setError}
      />
      <main className="app-main">
        {error ? <p className="app-error">{error}</p> : null}
        {selected ? (
          selected.valid ? (
            <div className="repo-workspace">
              {selected.status?.hasConflicts ? (
                <ConflictBanner onRefresh={handleRefresh} />
              ) : null}
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
                  onChanged={handleRefresh}
                />
              ) : tab === "log" ? (
                <LogTab
                  path={selected.entry.path}
                  currentBranch={selected.status?.branch ?? null}
                />
              ) : (
                <BranchesTab
                  path={selected.entry.path}
                  onChanged={handleRefresh}
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
