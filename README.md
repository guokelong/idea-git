# idea-git

Mac 多仓 Git 管理器（Tauri 2 + React）。

## 要求
- macOS Apple Silicon
- Node 20+
- Rust stable
- 本机已安装 `git` 且在 PATH 中

启动时会调用 `check_git()`；若 PATH 中没有 `git`，窗口全屏提示安装，不进入主界面。

## 开发
npm install
npm run tauri dev

## 添加仓库
- 点击侧栏「添加」，用系统目录选择器选中 Git 仓库文件夹。
- 将仓库文件夹拖到应用窗口：Tauri `onDragDropEvent` 会给出本地路径并调用 `add_repo`。
- 若路径拿不到（例如只用浏览器打开前端、或 WebView 未提供 `File.path`），拖拽会提示改用按钮；侧栏「添加」始终可用。

## 冲突
选中仓存在合并冲突时，详情顶部显示 Banner，引导用 IDEA / mergetool 等外部工具解决后点击「刷新」。应用不内置三方合并编辑器；窗口聚焦与约 8s 轮询也会刷新状态。

## 手动验收

1. 添加 3+ 真实仓库，列表状态与 `git status` / tracking 一致
2. 部分文件 Commit；已配置 remote 时 Commit & Push 可用
3. Log 按分支查看并打开提交 Diff
4. checkout / 新建 / 删除分支（删除有确认）
5. 冲突时仅提示，无内置合并编辑器
6. 网络/凭证错误时 push/fetch 失败清晰且不崩溃
7. Apple Silicon 上多仓轮询内存可接受（相对 Electron 类工具主观更轻）
