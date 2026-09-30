# Push 确认对话框 — 设计说明

**日期：** 2026-08-26  
**状态：** 待实现  
**关联：** Commit Tab Push / Commit & Push

## 1. 问题与目标

当前点 Push 成功时无界面反馈，失败才出错误条，用户无法确认是否推送成功，也无法在推送前看到将要推送的提交。

**目标：** 接近 IDEA：点 Push → 先展示待推送提交列表 → 用户确认后再真正 push；成功/失败均有明确反馈。

## 2. 范围

### 2.1 做

| 能力 | 说明 |
|------|------|
| 确认对话框 | 模态：待推提交列表 + Cancel / Push |
| 待推列表数据 | 有 upstream：`upstream..HEAD`；无 upstream：当前分支本地提交并标明将设置 upstream |
| Push 入口 | 独立 Push、以及 Commit & Push（commit 成功后再打开同一对话框） |
| 成功反馈 | 关闭对话框 + 简短成功提示 + 刷新 status |
| 失败反馈 | 对话框内展示错误，不关闭，可重试 |
| 无待推 | 不打开确认列表；提示「没有可推送的提交」 |

### 2.2 不做

- 选择远程 / 自定义 remote 名
- force push、tags、push 选项面板
- 每个 commit 下的文件树展开
- 遮罩点击关闭（避免误关）

## 3. 交互流程

```
[Push] / [Commit & Push 且 commit 已成功]
        │
        ▼
  加载 list_commits_to_push
        │
        ├─ 空列表 ──► 横幅提示「没有可推送的提交」；结束
        │
        └─ 有提交 ──► 打开模态对话框
                          │
              Cancel / Esc ──► 关闭，不 push
                          │
                     [Push] ──► push_inner（含无 upstream 时 -u）
                                   │
                          成功 ──► 关对话框 + 成功提示 + onChanged
                          失败 ──► 对话框内 ErrorBanner，可再点 Push
```

推送进行中：Push 按钮禁用，文案「Pushing…」；Cancel 仍可关对话框（不取消已发出的 git push；首版不做取消 git）。

## 4. 数据与 API

### 4.1 后端

新增 `list_commits_to_push(path: String) -> PushPreview`：

```
PushPreview {
  branch: String,
  remote: String,           // 首版固定 "origin"；有 upstream 时可从 upstream 解析 remote 名
  upstream: Option<String>,
  newBranch: bool,          // upstream 为空
  commits: Vec<CommitRow>,  // 复用现有 CommitRow
}
```

实现要点：

1. `fetch_repo_status` 取 `branch` / `upstream`
2. 有 upstream：`git log --format=<现有 LOG_FORMAT> <upstream>..HEAD`
3. 无 upstream：`git log --format=... HEAD`（该分支全部可达提交；与「首次 push -u」一致展示将上传的历史）。若担心过长，可设上限（如 100），UI 注明「仅显示最近 N 条」
4. 空输出 → `commits: []`
5. 出入口打日志（`list_commits_to_push enter/exit`）

现有 `push` 命令不变（已支持无 upstream 时 `--set-upstream origin <branch>`）。

### 4.2 前端

- `api/git.ts`：`listCommitsToPush(path) -> PushPreview`
- 组件：`PushConfirmDialog`（props：preview、busy、error、onCancel、onConfirm）
- `CommitTab`：
  - Push：先拉 preview，空则 setError/成功提示区「没有可推送…」，否则打开对话框
  - Commit & Push：commit 成功后同样走上述流程（不再在 commit 路径里静默 `push`）

### 4.3 成功提示

轻量：Commit Tab 顶部成功横幅（绿色/中性），约 3s 自动消失或下次操作清除。文案示例：`已推送到 origin/<branch>（N 个提交）`。失败仍用现有 `ErrorBanner` 风格（对话框内优先）。

## 5. UI 结构

```
┌─────────────────────────────────────────┐
│ Push Commits to origin/<branch>         │
│ （newBranch 时副标题：将设置 upstream）  │
├─────────────────────────────────────────┤
│ abc1234  fix: ...                       │
│          author · date                  │
│ def5678  feat: ...                      │
│          ...                            │
├─────────────────────────────────────────┤
│              [Cancel]  [Push]           │
└─────────────────────────────────────────┘
```

- 样式沿用现有 App 暗色变量，不引入新主题
- Esc / Cancel 关闭；点击遮罩不关闭
- 列表可滚动，对话框最大高度约视口 70%

## 6. 测试

| 层 | 用例 |
|----|------|
| Rust | 有 upstream 且 ahead≥1 → 返回对应 commits |
| Rust | 已同步（ahead=0）→ commits 为空 |
| Rust | 无 upstream 新分支 → `newBranch=true` 且 commits 非空 |
| 前端（可选） | 空 preview 不打开对话框；确认后调用 push |

## 7. 验收

1. 有本地未推提交时点 Push，看到列表后再确认才真正 push  
2. 推送成功有提示，侧栏/status ahead 归零  
3. 推送失败对话框内可见错误，可重试  
4. 无待推时点 Push，有「没有可推送」类提示，不误调 push  
5. Commit & Push 在 commit 后进入同一确认流程  
