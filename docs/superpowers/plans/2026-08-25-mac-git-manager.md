# Mac 多仓 Git 管理器 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 macOS Apple Silicon 上交付一个 Tauri 2 单窗口 App：手动登记多仓、总览状态，并在选中仓库内完成 Commit / Log / Branches 常用子集。

**Architecture:** React+TS 负责 UI；Rust 侧 `repo_registry` 持久化路径，`git_runner` 调用本机 `git`（同仓串行、可超时），`git_parse` 解析输出；经 Tauri commands 暴露给前端。冲突只提示，不做内置合并编辑器。

**Tech Stack:** Tauri 2、React 18+、TypeScript、Vite、本机 `git` CLI、本地 JSON 注册表

**Spec:** `docs/superpowers/specs/2026-08-25-mac-git-manager-design.md`

## Global Constraints

- 平台：仅 macOS（Apple Silicon）；不要求 Windows/Linux
- Git 引擎：只通过本机 `git`，不引入 libgit2 / git2 作为主路径
- 入库：仅手动添加 / 拖拽；不做磁盘扫描
- 冲突：检测与提示即可，无三方合并 UI
- v1 不做 Shelve、交互式 rebase UI、块级 partial commit
- 轮询默认间隔：8000ms（规格「约 5–10s」内取固定值）
- Commit message 语言：中文（本仓库约定）
- 后端关键出入节点写日志（`log` crate / 前端 `console` + 可选文件）

---

## File Structure

```
idea-git/
├── package.json
├── vite.config.ts
├── index.html
├── src/
│   ├── main.tsx
│   ├── App.tsx                 # 左列表 + 右 Tab 壳
│   ├── types.ts                # 与 Rust 对齐的 DTO
│   ├── api/
│   │   ├── repos.ts            # invoke 仓库注册表
│   │   └── git.ts              # invoke Git 命令
│   ├── hooks/
│   │   ├── useRepoList.ts      # 列表 + 轮询 + 聚焦刷新
│   │   └── useSelection.ts     # 当前选中仓库 id
│   └── components/
│       ├── RepoSidebar.tsx
│       ├── ErrorBanner.tsx
│       ├── ConflictBanner.tsx
│       └── tabs/
│           ├── CommitTab.tsx
│           ├── LogTab.tsx
│           └── BranchesTab.tsx
└── src-tauri/
    ├── Cargo.toml
    ├── tauri.conf.json
    ├── capabilities/default.json
    └── src/
        ├── main.rs
        ├── lib.rs
        ├── error.rs
        ├── repo_registry.rs
        ├── git_runner.rs
        ├── git_parse.rs
        └── commands/
            ├── mod.rs
            ├── repos.rs
            └── git.rs
```

---

### Task 1: 脚手架 Tauri 2 + React + TS

**Files:**
- Create: 项目根下由 `npm create tauri-app` / 等价命令生成的标准文件
- Create: `README.md`（如何 `npm install`、`npm run tauri dev`、需本机 git）
- Modify: `src-tauri/tauri.conf.json`（productName、窗口标题「Idea Git」或 `idea-git`）
- Modify: `src-tauri/Cargo.toml`（加依赖：`serde`、`serde_json`、`thiserror`、`tokio`、`uuid`、`chrono`、`log`、`env_logger`）

**Interfaces:**
- Consumes: 无
- Produces: 可 `npm run tauri dev` 打开空窗口的工程骨架

- [ ] **Step 1: 生成项目**

在仓库根（已有 `docs/` 与 `.gitignore`）生成 Tauri+React+TS，避免覆盖 `docs/`：

```bash
cd /Users/jiangpl/ym/code/idea-git
npm create tauri-app@latest . -- --template react-ts --manager npm --yes
# 若交互冲突：先在临时目录创建再把 src/ src-tauri/ package.json 等移入根目录，保留 docs/ 与 .gitignore
```

Expected: 存在 `src/App.tsx`、`src-tauri/src/lib.rs`、`package.json`。

- [ ] **Step 2: 补齐 Rust 依赖**

在 `src-tauri/Cargo.toml` 的 `[dependencies]` 增加：

```toml
serde = { version = "1", features = ["derive"] }
serde_json = "1"
thiserror = "2"
uuid = { version = "1", features = ["v4", "serde"] }
chrono = { version = "0.4", features = ["serde"] }
log = "0.4"
env_logger = "0.11"
tokio = { version = "1", features = ["sync", "time", "process", "rt"] }
```

- [ ] **Step 3: 写 README 启动说明**

```markdown
# idea-git

Mac 多仓 Git 管理器（Tauri 2 + React）。

## 要求
- macOS Apple Silicon
- Node 20+
- Rust stable
- 本机已安装 `git` 且在 PATH 中

## 开发
npm install
npm run tauri dev
```

- [ ] **Step 4: 验证能启动**

```bash
npm install
npm run tauri dev
```

Expected: 出现原生窗口，无 panic。手动关掉窗口后继续。

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "$(cat <<'EOF'
脚手架：初始化 Tauri 2 + React + TypeScript 工程

为多仓 Git 管理器建立可启动的桌面应用骨架。
EOF
)"
```

---

### Task 2: `GitRunner`（本机 git、超时、同仓串行）

**Files:**
- Create: `src-tauri/src/git_runner.rs`
- Create: `src-tauri/src/error.rs`
- Modify: `src-tauri/src/lib.rs`（`mod git_runner; mod error;`）

**Interfaces:**
- Consumes: 本机 `git`
- Produces:
  - `pub struct GitRunner`
  - `pub async fn run(&self, repo_path: &Path, args: &[&str], timeout: Duration) -> Result<GitOutput, AppError>`
  - `pub struct GitOutput { pub stdout: String, pub stderr: String, pub code: i32 }`
  - `pub enum AppError { GitNotFound, GitFailed { code: i32, stderr: String }, Timeout, Io(String), ... }`

- [ ] **Step 1: 写失败测试（同文件 `#[cfg(test)]`）**

在 `git_runner.rs` 底部先写测试（此时 `run` 未实现应编译失败或断言失败）：

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use std::time::Duration;
    use tempfile::tempdir;

    #[tokio::test]
    async fn runs_git_version() {
        let runner = GitRunner::new();
        let out = runner
            .run(Path::new("/"), &["--version"], Duration::from_secs(5))
            .await
            .expect("git should run");
        assert_eq!(out.code, 0);
        assert!(out.stdout.contains("git version") || out.stderr.contains("git version"));
    }

    #[tokio::test]
    async fn serializes_same_repo() {
        let dir = tempdir().unwrap();
        std::process::Command::new("git").args(["init"]).current_dir(dir.path()).status().unwrap();
        let runner = GitRunner::new();
        let p = dir.path().to_path_buf();
        let a = runner.run(&p, &["status", "--porcelain"], Duration::from_secs(5));
        let b = runner.run(&p, &["status", "--porcelain"], Duration::from_secs(5));
        let (ra, rb) = tokio::join!(a, b);
        assert!(ra.is_ok() && rb.is_ok());
    }
}
```

`Cargo.toml` 加：

```toml
[dev-dependencies]
tempfile = "3"
tokio = { version = "1", features = ["rt-multi-thread", "macros"] }
```

- [ ] **Step 2: 跑测试确认未实现时失败**

```bash
cd src-tauri && cargo test git_runner -- --nocapture
```

Expected: 编译失败（`GitRunner` 不存在）或测试失败。

- [ ] **Step 3: 实现 `error.rs` + `GitRunner`**

```rust
// error.rs
use serde::Serialize;
use thiserror::Error;

#[derive(Debug, Error)]
pub enum AppError {
    #[error("找不到 git，请安装并确保在 PATH 中")]
    GitNotFound,
    #[error("git 超时")]
    Timeout,
    #[error("git 失败 (code={code}): {stderr}")]
    GitFailed { code: i32, stderr: String },
    #[error("IO: {0}")]
    Io(String),
    #[error("{0}")]
    Message(String),
}

impl Serialize for AppError {
    fn serialize<S: serde::Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        serializer.serialize_str(&self.to_string())
    }
}

// git_runner.rs（要点）
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::Duration;
use tokio::process::Command;
use tokio::sync::Mutex;

pub struct GitOutput {
    pub stdout: String,
    pub stderr: String,
    pub code: i32,
}

pub struct GitRunner {
    locks: Mutex<HashMap<PathBuf, Arc<Mutex<()>>>>,
}

impl GitRunner {
    pub fn new() -> Self {
        Self { locks: Mutex::new(HashMap::new()) }
    }

    async fn lock_for(&self, repo: &Path) -> Arc<Mutex<()>> {
        let key = repo.to_path_buf();
        let mut map = self.locks.lock().await;
        map.entry(key).or_insert_with(|| Arc::new(Mutex::new(()))).clone()
    }

    pub async fn run(
        &self,
        repo_path: &Path,
        args: &[&str],
        timeout: Duration,
    ) -> Result<GitOutput, crate::error::AppError> {
        let lock = self.lock_for(repo_path).await;
        let _guard = lock.lock().await;
        log::info!("git {:?} in {:?}", args, repo_path);
        let mut cmd = Command::new("git");
        cmd.args(args).current_dir(repo_path);
        let child = cmd.output();
        match tokio::time::timeout(timeout, child).await {
            Err(_) => Err(crate::error::AppError::Timeout),
            Ok(Err(e)) if e.kind() == std::io::ErrorKind::NotFound => {
                Err(crate::error::AppError::GitNotFound)
            }
            Ok(Err(e)) => Err(crate::error::AppError::Io(e.to_string())),
            Ok(Ok(out)) => {
                let code = out.status.code().unwrap_or(-1);
                let stdout = String::from_utf8_lossy(&out.stdout).into_owned();
                let stderr = String::from_utf8_lossy(&out.stderr).into_owned();
                log::info!("git exit {} stderr_len={}", code, stderr.len());
                Ok(GitOutput { stdout, stderr, code })
            }
        }
    }
}
```

注意：`git --version` 可在任意 cwd；测试里用 `Path::new("/")` 可接受。对仓库命令必须 `current_dir(repo_path)`。

- [ ] **Step 4: 跑测试通过**

```bash
cd src-tauri && cargo test git_runner -- --nocapture
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/error.rs src-tauri/src/git_runner.rs src-tauri/src/lib.rs src-tauri/Cargo.toml
git commit -m "$(cat <<'EOF'
功能：实现本机 git 调用器（超时与同仓串行）

为后续 status/commit 等命令提供统一执行入口。
EOF
)"
```

---

### Task 3: `git_parse` — status / ahead-behind / 冲突

**Files:**
- Create: `src-tauri/src/git_parse.rs`
- Modify: `src-tauri/src/lib.rs`

**Interfaces:**
- Consumes: `GitOutput` / 原始字符串
- Produces:
  - `pub struct FileChange { pub path: String, pub index_status: char, pub worktree_status: char }`
  - `pub struct RepoStatus { pub branch: String, pub upstream: Option<String>, pub ahead: u32, pub behind: u32, pub changes: Vec<FileChange>, pub has_conflicts: bool, pub dirty: bool }`
  - `pub fn parse_status_porcelain_v2(stdout: &str) -> Result<RepoStatus, AppError>`（或 v1 porcelain + `##` 行；选定一种并在测试锁死）

约定用 `git status --porcelain=v1 -b`：

- `## branch...upstream [ahead 1, behind 2]`
- `UU` / `AA` / `DD` 等视为冲突
- `dirty = !changes.is_empty()`

- [ ] **Step 1: 写解析测试**

```rust
#[test]
fn parses_branch_ahead_behind_and_conflict() {
    let raw = "\
## main...origin/main [ahead 2, behind 1]
M  src/a.rs
UU conflict.txt
?? scratch.tmp
";
    let s = parse_status_porcelain(raw).unwrap();
    assert_eq!(s.branch, "main");
    assert_eq!(s.ahead, 2);
    assert_eq!(s.behind, 1);
    assert!(s.has_conflicts);
    assert!(s.dirty);
    assert_eq!(s.changes.len(), 3);
}
```

- [ ] **Step 2: 跑测试应失败**

```bash
cd src-tauri && cargo test git_parse -- --nocapture
```

Expected: FAIL / 未定义

- [ ] **Step 3: 实现解析器**

实现 `parse_status_porcelain`：解析 `##` 行取分支与 ahead/behind；其余非空行取 XY + path（处理 `->` 重命名时取右侧路径即可）。

- [ ] **Step 4: 测试通过**

```bash
cd src-tauri && cargo test git_parse -- --nocapture
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/git_parse.rs src-tauri/src/lib.rs
git commit -m "$(cat <<'EOF'
功能：解析 git status porcelain 为结构化状态

支持分支、ahead/behind、冲突与变更列表。
EOF
)"
```

---

### Task 4: `repo_registry` JSON 持久化

**Files:**
- Create: `src-tauri/src/repo_registry.rs`
- Modify: `src-tauri/src/lib.rs`

**Interfaces:**
- Consumes: App 数据目录路径（测试可用 tempdir）
- Produces:
  - `pub struct RepoEntry { pub id: String, pub name: String, pub path: String, pub added_at: String }`
  - `pub struct RepoRegistry { /* path to repos.json */ }`
  - `fn load(&self) -> Result<Vec<RepoEntry>, AppError>`
  - `fn add(&self, path: PathBuf, name: Option<String>) -> Result<RepoEntry, AppError>`（校验 `.git` 存在；默认 name = 目录名）
  - `fn remove(&self, id: &str) -> Result<(), AppError>`
  - `fn update_path(&self, id: &str, new_path: PathBuf) -> Result<RepoEntry, AppError>`
  - `fn list_with_validity(&self) -> Result<Vec<RepoListItem>, AppError>` where `RepoListItem { entry, valid: bool }`（`valid` = path 是目录且含 `.git`）

- [ ] **Step 1: 写测试**

```rust
#[test]
fn add_list_remove_roundtrip() {
    let dir = tempfile::tempdir().unwrap();
    let repo = dir.path().join("demo");
    std::fs::create_dir_all(&repo).unwrap();
    std::process::Command::new("git").args(["init"]).current_dir(&repo).status().unwrap();
    let reg = RepoRegistry::open(dir.path().join("data")).unwrap();
    let e = reg.add(repo.clone(), None).unwrap();
    assert_eq!(e.name, "demo");
    assert_eq!(reg.load().unwrap().len(), 1);
    reg.remove(&e.id).unwrap();
    assert!(reg.load().unwrap().is_empty());
}
```

- [ ] **Step 2: 跑测试失败 → Step 3 实现 → Step 4 通过**

存储文件：`{data_dir}/repos.json`，格式 `{"repos":[...]}`。`add` 前 `path.canonicalize()`，重复路径返回 `AppError::Message("仓库已存在")`。

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/repo_registry.rs src-tauri/src/lib.rs
git commit -m "$(cat <<'EOF'
功能：本地 JSON 仓库注册表增删改查

支持路径校验与失效标记所需的 valid 字段。
EOF
)"
```

---

### Task 5: Tauri commands — 仓库 CRUD + `git_available` + `repo_status`

**Files:**
- Create: `src-tauri/src/commands/mod.rs`, `repos.rs`, `git.rs`
- Modify: `src-tauri/src/lib.rs`（`manage` state：`GitRunner`、`RepoRegistry`；`invoke_handler`）
- Modify: capabilities 允许 dialog 选目录（若用 `@tauri-apps/plugin-dialog`）

**Interfaces:**
- Produces（前端可 invoke 的命令名与类型）：
  - `list_repos() -> Vec<RepoListItem>`
  - `add_repo(path: String, name: Option<String>) -> RepoEntry`
  - `remove_repo(id: String)`
  - `relocate_repo(id: String, path: String) -> RepoEntry`
  - `check_git() -> bool`
  - `get_repo_status(path: String) -> RepoStatus`（内部：`git status --porcelain=v1 -b`，timeout 15s）

- [ ] **Step 1: 实现 commands 并在 `lib.rs` 注册**

```rust
#[tauri::command]
async fn get_repo_status(
    path: String,
    runner: State<'_, GitRunner>,
) -> Result<RepoStatus, AppError> {
    let out = runner
        .run(Path::new(&path), &["status", "--porcelain=v1", "-b"], Duration::from_secs(15))
        .await?;
    if out.code != 0 {
        return Err(AppError::GitFailed { code: out.code, stderr: out.stderr });
    }
    parse_status_porcelain(&out.stdout)
}
```

启动时 `env_logger::init()`；`RepoRegistry::open` 使用 `app.path().app_data_dir()`。

- [ ] **Step 2: 集成冒烟**

```bash
cd src-tauri && cargo test && cargo check
```

Expected: PASS / 无错误

- [ ] **Step 3: Commit**

```bash
git add src-tauri/src/
git commit -m "$(cat <<'EOF'
功能：暴露仓库注册与 status 的 Tauri 命令

打通前端 invoke 所需的后端 API 入口。
EOF
)"
```

---

### Task 6: 前端类型、API 封装与左列表壳

**Files:**
- Create: `src/types.ts`, `src/api/repos.ts`, `src/api/git.ts`
- Create: `src/components/RepoSidebar.tsx`
- Modify: `src/App.tsx`
- 安装：`@tauri-apps/api`、`@tauri-apps/plugin-dialog`（选文件夹）

**Interfaces:**
- Consumes: Task 5 命令名
- Produces: `listRepos` / `addRepo` / `removeRepo` TS 函数；侧栏可添加/删除/选中

- [ ] **Step 1: `types.ts` 与 Rust DTO 字段名一致（serde rename 默认 snake_case → 前端用 camelCase 时在 Rust 加 `#[serde(rename_all = "camelCase")]`）**

统一 **camelCase** 导出：

```typescript
export type RepoEntry = { id: string; name: string; path: string; addedAt: string };
export type RepoListItem = { entry: RepoEntry; valid: boolean };
export type FileChange = { path: string; indexStatus: string; worktreeStatus: string };
export type RepoStatus = {
  branch: string;
  upstream: string | null;
  ahead: number;
  behind: number;
  changes: FileChange[];
  hasConflicts: boolean;
  dirty: boolean;
};
```

- [ ] **Step 2: API + Sidebar + App 布局（左 260px / 右 flex）**

添加按钮调用 dialog `open({ directory: true })` 后 `add_repo`。无选中时右侧显示「选择一个仓库」。

- [ ] **Step 3: `npm run tauri dev` 手动：添加本机某 git 仓，列表出现，删除消失**

- [ ] **Step 4: Commit**

```bash
git commit -m "$(cat <<'EOF'
功能：实现仓库侧栏添加与删除

完成多仓总览入口的手动登记闭环。
EOF
)"
```

---

### Task 7: 总览状态徽章、轮询、失效标红、冲突角标

**Files:**
- Create: `src/hooks/useRepoList.ts`
- Modify: `src/components/RepoSidebar.tsx`, `src/App.tsx`

**Interfaces:**
- Consumes: `list_repos`, `get_repo_status`
- Produces: 每仓展示 `branch · dirty摘要 · ↑n ↓m`；`valid===false` 红色；`hasConflicts` 角标

- [ ] **Step 1: `useRepoList`**

- 加载 `list_repos`
- 对每个 `valid` 仓调用 `get_repo_status`（可 `Promise.allSettled`）
- `setInterval(..., 8000)` 刷新；`window` `focus` 时立即刷新
- 卸载 clearInterval

- [ ] **Step 2: 侧栏渲染状态；失效项显示「重新定位」调用 `relocate_repo`**

- [ ] **Step 3: 手动验证 2+ 仓轮询与标红**

- [ ] **Step 4: Commit**

```bash
git commit -m "$(cat <<'EOF'
功能：侧栏展示分支与 ahead/behind 并定时刷新

支持失效路径标红与冲突角标提示。
EOF
)"
```

---

### Task 8: Commit Tab（勾选、Diff、Commit、Amend、Commit & Push）

**Files:**
- Create: `src/components/tabs/CommitTab.tsx`, `src/components/ErrorBanner.tsx`
- Modify: `src-tauri/src/commands/git.rs`, `src/api/git.ts`, `src/App.tsx`
- Extend parse if needed for diff（原始字符串即可）

**Interfaces:**
- 新命令：
  - `get_diff(path: String, file: String, staged: bool) -> String`  
    → `git diff --` / `git diff --cached --` + file
  - `stage_paths(path, paths: Vec<String>)` → `git add -- <paths>`
  - `unstage_paths` → `git restore --staged --`
  - `commit(path, message: String, amend: bool) -> ()`  
    → `git commit -m` / `git commit --amend -m`（amend 时若 message 空则 `--amend --no-edit` 仅当规格允许；v1：Amend 必须带 message 或复用原 message 用 `--amend --no-edit` 二选一——**选定：amend 且 message 非空用 `-m`，message 空用 `--no-edit`**）
  - `push(path) -> ()` → `git push` timeout 120s

- [ ] **Step 1: Rust 命令 + 单元/集成：在 tempfile 仓改文件、`git add`、`commit` 后 `log -1` 有提交**

- [ ] **Step 2: `CommitTab` UI**

- 左：changes 复选框（默认勾选已修改）；点文件加载 diff  
- 右：`<pre>` Diff  
- 下：message、`Amend` checkbox、`Commit`、`Commit & Push`  
- 失败时 `ErrorBanner` 显示 stderr  
- 成功后回调 `onChanged()` 刷新 status  

- [ ] **Step 3: 手动验收部分提交与 push（有 remote 时）**

- [ ] **Step 4: Commit**

```bash
git commit -m "$(cat <<'EOF'
功能：实现 Commit 工作流（勾选、Diff、提交与推送）

对齐 IDEA 常用的暂存提交体验子集。
EOF
)"
```

---

### Task 9: Log Tab

**Files:**
- Create: `src/components/tabs/LogTab.tsx`
- Modify: `src-tauri/src/git_parse.rs`, `commands/git.rs`, `src/api/git.ts`, `App.tsx`

**Interfaces:**
- `list_commits(path, branch: Option<String>, limit: u32) -> Vec<CommitRow>`  
  - `git log --graph --oneline --decorate -n {limit}` 解析困难则改用：  
    `git log -n {limit} --format=%H%x09%h%x09%s%x09%an%x09%aI%x09%D` + 可选 `--graph` 仅展示装饰字段  
  - **选定：** 不用图形字符；列表字段 `hash, shortHash, subject, author, date, refs`；简单「拓扑感」用 `git log --all` 或指定 branch
- `get_commit_diff(path, hash) -> String` → `git show --stat --format=fuller {hash}` 或 `git show {hash}`

- [ ] **Step 1: 解析测试 + 命令**

```rust
#[test]
fn parses_log_lines() {
    let raw = "abc\tdef123\tmsg\tAnn\t2026-01-01T00:00:00+08:00\tHEAD -> main\n";
    let rows = parse_log(raw).unwrap();
    assert_eq!(rows[0].short_hash, "def123");
}
```

- [ ] **Step 2: UI — 分支筛选下拉（来自 `list_branches` 可先 hardcode 当前 branch，Task 10 再接）、点击行显示 diff**

- [ ] **Step 3: 手动验收**

- [ ] **Step 4: Commit**

```bash
git commit -m "$(cat <<'EOF'
功能：实现提交历史 Log 与只读 Diff

支持按分支筛选并查看单次提交详情。
EOF
)"
```

---

### Task 10: Branches Tab

**Files:**
- Create: `src/components/tabs/BranchesTab.tsx`
- Modify: `git_parse.rs`, `commands/git.rs`, `api/git.ts`, `App.tsx`

**Interfaces:**
- `list_branches(path) -> Vec<BranchRow>`  
  - `git branch -vv` + `git branch -r` 或 `git for-each-ref --format=...`  
  - 字段：`name, isRemote, isCurrent, upstream: Option<String>, ahead, behind`
- `checkout_branch(path, name)`
- `create_branch(path, name, checkout: bool)`
- `delete_branch(path, name, force: bool)` — UI 先 `confirm`，默认 `force=false`（`-d`），失败再提示

- [ ] **Step 1: 解析/命令测试（temp repo 建分支、checkout、删除）**

- [ ] **Step 2: UI 列表 + 操作按钮；当前分支高亮；显示 tracking ↑↓**

- [ ] **Step 3: 手动验收**

- [ ] **Step 4: Commit**

```bash
git commit -m "$(cat <<'EOF'
功能：实现分支列表与切换/新建/删除

覆盖日常分支操作常用子集。
EOF
)"
```

---

### Task 11: 冲突 Banner、启动 git 检测、拖拽添加

**Files:**
- Create: `src/components/ConflictBanner.tsx`
- Modify: `App.tsx`, `RepoSidebar.tsx`, `main.tsx` / 窗口 drop 事件

**Interfaces:**
- 选中仓 `status.hasConflicts` 时顶部 Banner：「存在合并冲突，请用 IDEA / mergetool 等外部工具解决后点击刷新」
- 启动调用 `check_git()`，false 则全屏提示
- 拖拽文件夹到窗口：`add_repo`（Tauri `onDragDropEvent` / HTML drop + 路径插件；若路径获取受限则文档说明仅用按钮添加，并实现按钮路径）

- [ ] **Step 1: ConflictBanner + check_git 启动门闸**

- [ ] **Step 2: 拖拽添加（能通则做；权限不够则 README 写明限制，侧栏添加仍可用）**

- [ ] **Step 3: 按规格 §8.2 手工过一遍清单**

- [ ] **Step 4: Commit**

```bash
git commit -m "$(cat <<'EOF'
功能：冲突提示、git 检测与拖拽添加仓库

补齐 v1 错误体验与入库交互。
EOF
)"
```

---

### Task 12: 前端轻量单测与收尾

**Files:**
- Create: `src/components/ErrorBanner.test.tsx`（或 Vitest 测纯函数：例如从 status 生成侧栏副标题）
- Create: `src/lib/formatRepoSubtitle.ts` + 测试
- Modify: `package.json` scripts `"test": "vitest run"`

**Interfaces:**
- `formatRepoSubtitle(status: RepoStatus): string` → 如 `main · 3 changes · ↑2 ↓1`

- [ ] **Step 1: 抽纯函数并写 Vitest**

```ts
import { describe, it, expect } from "vitest";
import { formatRepoSubtitle } from "./formatRepoSubtitle";

it("formats dirty ahead behind", () => {
  expect(
    formatRepoSubtitle({
      branch: "main",
      upstream: "origin/main",
      ahead: 2,
      behind: 0,
      changes: [{ path: "a", indexStatus: "M", worktreeStatus: " " }],
      hasConflicts: false,
      dirty: true,
    }),
  ).toContain("↑2");
});
```

- [ ] **Step 2: `npm test` 通过；`cargo test` 通过**

- [ ] **Step 3: 更新 README 验收步骤（复制规格手动清单）**

- [ ] **Step 4: Commit**

```bash
git commit -m "$(cat <<'EOF'
测试：补充侧栏文案单测并完善 README 验收说明

便于回归总览展示与手工验收。
EOF
)"
```

---

## Spec Coverage Self-Review

| 规格项 | 任务 |
|--------|------|
| 手动添加 / 拖拽 | Task 6, 11 |
| 总览分支/dirty/ahead-behind/冲突角标 | Task 7, 11 |
| Commit 勾选 Diff message Amend Push | Task 8 |
| Log 筛选与只读 Diff | Task 9 |
| Branches checkout/新建/删除/tracking | Task 10 |
| 冲突只提示 | Task 11 |
| 本机 git、超时串行 | Task 2 |
| JSON 注册表、失效标红、重定位 | Task 4, 7 |
| 轮询 + 聚焦刷新 | Task 7 |
| 错误 Banner / 找不到 git | Task 8, 11 |
| Rust + 前端测试 | Task 2–4, 8–10, 12 |
| 不做扫盘/libgit2/三方合并 | 全局约束，无对应实现任务 |

**占位符扫描：** 已消除 TBD；Log「简单图形」落实为「无 graph 字符、列表+refs」（与规格「简单图形/线性」兼容的可交付子集）。  
**类型一致性：** DTO 统一 camelCase；`RepoStatus` / `RepoEntry` 前后端同名字段。

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-08-25-mac-git-manager.md`.

**两种执行方式：**

1. **Subagent-Driven（推荐）** — 每个 Task 开新子代理，Task 间回顾，迭代快  
2. **Inline Execution** — 本会话用 executing-plans 按批次推进并设检查点  

你选哪一种？
