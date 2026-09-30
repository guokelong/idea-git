# idea-git

面向 macOS（Apple Silicon）的**本地多仓库 Git 管理器**。

日常开很多仓库时，往往只是为了看状态、提交、切分支，却要为此打开完整的 IntelliJ IDEA。  
**idea-git** 把 IDEA 里常用的 Git 工作流抽成独立轻量桌面应用：左侧多仓总览，右侧按 **Commit / Log / Branches** 三个 Tab 操作——交互习惯尽量贴近 IDEA 的 Git 工具窗口，而不是再学一套全新 UI。

技术栈：**Tauri 2 + React + TypeScript**，Git 操作走本机 `git` CLI（与终端 / IDEA 共用 hooks、credential helper）。

---

## 它解决什么问题

| 痛点 | idea-git 的做法 |
|------|-----------------|
| 多仓状态要切很多 IDEA 窗口 | 侧栏一次登记多个仓库，总览分支、脏状态、ahead/behind、冲突 |
| 只想 commit / 看 log / 切分支 | 单仓详情提供 Commit / Log / Branches 常用子集 |
| Electron 类工具偏重 | Tauri + 系统 WebView，相对更轻 |

**目标：** 不打开 IDEA，也能完成「看多仓状态 + 日常提交 / 看历史 / 管理分支」的闭环。

---

## 界面结构（参照 IDEA）

```
┌──────────────┬─────────────────────────────────────┐
│ 仓库列表      │  Commit  |  Log  |  Branches        │
│ · idea-git   │─────────────────────────────────────│
│ · api-server │  变更列表（可勾选） │  并排 Diff      │
│ · web-admin  │  提交说明           │                 │
│ [添加][刷新]  │  [Commit] [Push…]  │                 │
└──────────────┴─────────────────────────────────────┘
```

- **左侧：** 仓库登记与总览（别名、当前分支、dirty、↑↓、冲突角标）
- **右侧：** 选中仓库后的工作区，三个 Tab 对齐 IDEA 常见 Git 面板分工

---

## 能力一览

### 多仓库总览

- 手动添加仓库路径，或把文件夹**拖拽**进窗口
- 持久化登记信息；路径失效时可**重新定位**或移除
- 列表展示当前分支、是否有未提交变更、相对 remote 的 ahead/behind
- 存在合并冲突时侧栏角标 + 详情 Banner；窗口聚焦与约 8s 轮询会刷新状态

### Commit（贴近 IDEA Commit 工具窗）

- 变更文件 **树形 / 列表** 切换
- 勾选文件后 Stage / Unstage；支持提交消息
- 单文件 **并排 Diff**（可全屏），二进制文件提示无法预览
- **Commit** / **Commit & Push**
- Push 前弹出确认框，预览将要推送的提交（类似 IDEA Push 确认）
- 可将路径写入 `.gitignore`

### Log（提交历史）

- 按分支查看提交历史
- 查看某次提交的变更文件与只读 Diff（并排）

### Branches（分支）

- 本地 / 远程分支列表（树形展示）
- Checkout 本地分支；基于远程分支检出
- 新建分支、从指定起点新建分支
- 删除分支（有确认）

### 冲突处理（刻意不做内置合并）

- 仅提示存在冲突，引导用 IDEA / `git mergetool` 等外部工具解决
- 解决后点「刷新」或等待轮询即可更新状态  
- **不内置**三方合并编辑器

---

## 当前不做（刻意裁剪）

相对完整 IDEA，v1 明确不做这些，避免做成「又一个巨型 IDE」：

- 自动扫描整盘发现仓库
- Shelve、交互式 Rebase UI、块级 partial commit 等高级能力
- 内嵌 libgit2 作为主引擎（统一走系统 `git`）
- Windows / Linux（当前仅 macOS Apple Silicon）

---

## 环境要求

- macOS Apple Silicon（M 系列）
- Node 20+
- Rust stable
- 本机已安装 `git` 且在 `PATH` 中

启动时会检测 `git`；若不存在，窗口全屏提示安装，不进入主界面。

---

## 开发与运行

```bash
npm install
npm run tauri dev
```

常用命令：

| 命令 | 说明 |
|------|------|
| `npm run tauri dev` | 启动桌面应用开发模式 |
| `npm test` | 前端单测 |
| `npm run build` | 构建前端 |

### 推送本仓库到 GitHub（可选）

本地凭证写在 `.env.github`（已被 gitignore，勿提交），模板见 `.env.github.example`：

```bash
cp .env.github.example .env.github   # 若尚未创建
# 编辑 .env.github，填入 GITHUB_TOKEN
npm run push:github
```

---

## 添加仓库说明

- 侧栏 **添加**：系统目录选择器选中 Git 仓库根目录
- **拖拽**文件夹到窗口：走 Tauri `onDragDropEvent` 拿到本地路径后登记
- 若在纯浏览器预览前端、拿不到本地路径，拖拽会提示改用「添加」按钮

---

## License

[MIT](./LICENSE)
