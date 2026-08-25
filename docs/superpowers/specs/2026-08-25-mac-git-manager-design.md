# Mac 本地多仓 Git 管理器 — 设计说明

**日期：** 2026-08-25  
**状态：** 待实现  
**平台：** macOS（Apple Silicon / M 系列）

## 1. 问题与目标

在 Mac 上管理本地多个 Git 仓库，减少为「只看 Git」而打开 IDEA 的次数。  
第一版以**多仓库总览**为主入口；进入单仓后提供接近 IDEA 习惯的 **Commit / Log / Branches** 常用子集。

**成功标准：** 不打开 IDEA，也能完成「看多仓状态 + 日常 commit / 看历史 / 切换分支」的闭环。

## 2. 范围

### 2.1 做（v1）

| 能力 | 说明 |
|------|------|
| 仓库登记 | 手动添加路径 / 拖拽文件夹；持久化别名与路径 |
| 总览列表 | 当前分支、dirty、ahead/behind；冲突角标 |
| Commit | 勾选变更、单文件 Diff、message、可选 Amend、Commit / Commit & Push |
| Log | 简单图形/线性历史、按分支筛选、提交 Diff（只读） |
| Branches | 本地/远程列表、checkout、新建、删除（确认）、tracking 与 ahead/behind |
| 冲突 | 仅提示 + 引导外部工具；刷新后更新状态 |

### 2.2 不做（v1）

- 自动扫描磁盘发现仓库
- 内置三方冲突合并编辑器
- IDEA 全功能对标（Shelve、交互式 rebase UI、块级 partial commit 等）
- 内嵌 libgit2 作为主引擎
- 跨平台（Windows / Linux）

## 3. 技术选型

| 层 | 选择 | 理由 |
|----|------|------|
| 壳 | Tauri 2 | 相对 Electron 内存更小；用系统 WKWebView |
| UI | React + TypeScript | 生态成熟，迭代快 |
| Git | 本机 `git` CLI | 与终端/IDEA 行为、hooks、credential helper 一致 |
| 持久化 | 本地 JSON（App 数据目录） | v1 数据简单，够用 |

## 4. 产品形态与信息架构

**单主窗口：** 左侧仓库列表 + 右侧详情 Tab（Commit | Log | Branches）。

```
┌──────────────┬─────────────────────────────────────┐
│ Repos        │  Commit  |  Log  |  Branches        │
│ · idea-git   │─────────────────────────────────────│
│ · api-server │  Changes (check)  │  Diff           │
│ · web-admin  │  Message          │                 │
│ [+ Add]      │  [Commit] [Push]  │                 │
└──────────────┴─────────────────────────────────────┘
```

- 列表项：别名、分支、dirty 摘要、↑↓、冲突角标  
- 添加 / 移除 / 刷新；失效路径标红，可重新定位或移除  

## 5. 架构

```
React UI
  → TS invoke 封装 + 状态 / 轮询
    → Tauri Commands (Rust)
         · 仓库注册表 CRUD
         · GitRunner（spawn git、超时、取消、同仓串行）
         · 解析 status / log / branch 等输出
           → 本机 git + 用户 credential / hooks
```

### 5.1 关键模块

| 模块 | 职责 | 依赖 |
|------|------|------|
| `repo_registry` | 读写已登记仓库元数据 | 文件系统 |
| `git_runner` | 执行 git、超时/取消、同仓队列 | 本机 `git` |
| `git_parse` | porcelain / log / branch 输出结构化 | `git_runner` |
| `ui/overview` | 列表与总览状态 | registry + status API |
| `ui/commit` | 变更勾选、Diff、提交/推送 | git API |
| `ui/log` | 历史与只读 Diff | git API |
| `ui/branches` | 分支列表与切换/新建/删除 | git API |

## 6. 数据流

1. **启动：** 读注册表 → 校验路径 → 检测 `git` 是否在 PATH  
2. **选中仓库：** 立即刷新 status / 分支 / ahead-behind  
3. **列表后台：** 可配置轮询（默认约 5–10s）+ 窗口聚焦时刷新  
4. **写操作成功后：** 强制刷新相关视图  
5. **并发：** 同仓命令串行；不同仓库读操作可并行  

## 7. 错误处理

| 场景 | 行为 |
|------|------|
| git 非 0 | 详情区顶部 stderr 摘要，可展开全文 |
| 认证/网络失败 | 明确失败文案，不假装成功 |
| 合并冲突 | 角标 + Banner，引导外部解决后刷新 |
| 找不到 git | 启动提示安装或配置 PATH |
| 路径失效 | 列表标红，支持重新定位或移除 |

调试：前端关键操作与 Rust 侧命令出入（路径可保留）写本地日志。

## 8. 测试与验收

### 8.1 自动化

- Rust：临时仓库测 status / commit / branch / log 解析  
- 前端：勾选、Tab、错误 Banner 等状态单测  
- v1 不做完整 E2E  

### 8.2 手动验收

1. 添加 3+ 真实仓库，列表状态与 `git status` / tracking 一致  
2. 部分文件 Commit；已配置 remote 时 Commit & Push 可用  
3. Log 按分支查看并打开提交 Diff  
4. checkout / 新建 / 删除分支（删除有确认）  
5. 冲突时仅提示，无内置合并编辑器  
6. 网络/凭证错误时 push/fetch 失败清晰且不崩溃  
7. Apple Silicon 上多仓轮询内存可接受（相对 Electron 类工具主观更轻）  

## 9. 后续（非 v1）

- 目录扫描自动发现仓库  
- 简易冲突辅助（打开文件 / 标记已解决）  
- 总览窗 + 独立仓库工作区窗  
- 更完整的 IDEA 对齐（rebase UI、shelve 等）  

## 10. 决策记录

| 决策 | 结论 |
|------|------|
| 产品重心 | 多仓总览优先（方案 A） |
| 入库方式 | 仅手动添加 |
| Git 深度 | Commit + Log + Branches 常用子集 |
| 技术栈 | Tauri 2 + React + TS；本机 git |
| 主布局 | 左列表 + 右详情 Tab |
| 冲突 | 只提示，不内置解决 |
