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
