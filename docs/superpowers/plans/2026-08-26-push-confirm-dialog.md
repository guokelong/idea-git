# Push 确认对话框 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 点 Push 先展示待推送提交列表，确认后再 push，并给出成功/失败反馈。

**Architecture:** Rust 新增 `list_commits_to_push` 返回 `PushPreview`；前端 `PushConfirmDialog` 模态确认；`CommitTab` 的 Push / Commit & Push 走同一流程。

**Tech Stack:** Tauri 2 + React + TypeScript；本机 git CLI；现有 `CommitRow` / `parse_log`。

## Global Constraints

- 不主动 git commit（用户未要求时）
- 后端关键出入口写日志
- 无 force push / 选远程 / commit 文件树
- 遮罩点击不关闭对话框

## File Structure

| 文件 | 职责 |
|------|------|
| `src-tauri/src/commands/git.rs` | `PushPreview`、`list_commits_to_push_inner`、command、测试 |
| `src-tauri/src/lib.rs` | 注册 command |
| `src/types.ts` | `PushPreview` 类型 |
| `src/api/git.ts` | `listCommitsToPush` |
| `src/components/PushConfirmDialog.tsx` | 模态 UI |
| `src/components/tabs/CommitTab.tsx` | 接入对话框与成功提示 |
| `src/App.css` | 对话框与成功横幅样式 |

---

### Task 1: `list_commits_to_push` 后端

**Files:**
- Modify: `src-tauri/src/commands/git.rs`
- Modify: `src-tauri/src/lib.rs`

**Produces:**
- `PushPreview { branch, remote, upstream: Option<String>, new_branch: bool, commits: Vec<CommitRow> }`
- `list_commits_to_push_inner(path, runner) -> Result<PushPreview, AppError>`
- Tauri command `list_commits_to_push`

- [ ] **Step 1: 写失败测试**（有 upstream ahead；已同步空列表；无 upstream newBranch）
- [ ] **Step 2: 跑测试确认失败** — `cargo test list_commits_to_push`
- [ ] **Step 3: 实现** — 有 upstream 用 `upstream..HEAD`；无则 `HEAD` + `new_branch=true`；`-n 100`
- [ ] **Step 4: 注册 command + 测试通过**
- [ ] **Step 5: 不 commit**（除非用户要求）

---

### Task 2: 前端 API + 类型

**Files:**
- Modify: `src/types.ts`
- Modify: `src/api/git.ts`

- [ ] 增加 `PushPreview`（camelCase）
- [ ] `listCommitsToPush(path)` invoke + 日志

---

### Task 3: `PushConfirmDialog` + CSS

**Files:**
- Create: `src/components/PushConfirmDialog.tsx`
- Modify: `src/App.css`

Props: `preview`, `busy`, `error`, `onCancel`, `onConfirm`  
Esc 关闭；遮罩不关闭；列表可滚动。

---

### Task 4: 接入 CommitTab

**Files:**
- Modify: `src/components/tabs/CommitTab.tsx`

- [ ] Push：拉 preview → 空则提示 → 否则开对话框
- [ ] 确认：push → 成功关对话框 + 成功横幅 + onChanged；失败对话框内错误
- [ ] Commit & Push：commit 成功后同上，不再静默 push
- [ ] 成功横幅约 3s 清除
- [ ] 验证：`npm test`、`npm run build`、`cargo test list_commits_to_push`

---

## Spec coverage

| Spec | Task |
|------|------|
| 确认对话框 | 3, 4 |
| list_commits_to_push | 1, 2 |
| 成功/失败反馈 | 4 |
| 无待推提示 | 4 |
| Commit & Push 同流程 | 4 |
