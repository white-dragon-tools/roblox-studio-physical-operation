# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概述

`@white-dragon-tools/roblox-studio-physical-operation` — 跨平台（Windows + macOS）Roblox Studio 自动化工具。提供三种接口：CLI (`rspo`)、MCP Server（Claude Code 插件）、Node.js 库。所有 CLI 输出为 JSON。

## 常用命令

```bash
npm install                    # 安装依赖
npm test                       # 运行单元测试（vitest，排除 native 测试）
npm run test:native            # 仅运行原生平台测试（需要真实 OS API）
npm run test:all               # 运行所有测试（单元 + 原生）
npm run test:watch             # watch 模式
npx vitest run tests/log-utils.test.mjs   # 运行单个测试文件
```

发布通过 GitHub Release 触发 CI（`.github/workflows/publish.yml`），发布到 npm public registry。

## 架构

三个入口点，共享同一套核心模块：

```
CLI (cli.mjs) ──┐
MCP (mcp-server.mjs) ──┼──→ studio-manager.mjs ──→ platform/{windows,macos}.mjs
Library (index.mjs) ──┘     log-utils.mjs
                            log-filter.mjs
                            toolbar-detector.mjs
```

### 核心模块职责

- **studio-manager.mjs** — 进程发现、PID↔日志映射、会话管理（`getSession`）、打开/关闭 Studio。所有平台操作通过 `platform/` 抽象层调用。
- **log-utils.mjs** — 日志解析（正则匹配 Roblox 日志格式）、日期过滤、增量读取（`afterLine`/`beforeLine`）、游戏状态索引（Edit/Play 上下文）、搜索和错误检测。返回结果有 32KB 字节上限。
- **log-filter.mjs** — Studio 内部日志噪音过滤（前缀/子串匹配规则）。
- **toolbar-detector.mjs** — OpenCV WASM 模板匹配 + HSV 颜色分析，检测工具栏按钮状态（enabled/disabled），推断游戏运行状态。支持 dark/light/legacy 三种主题。
- **platform/index.mjs** — 根据 `process.platform` 动态加载 Windows 或 macOS 后端。
- **platform/windows.mjs** — Win32 API via koffi（EnumWindows、SendInput、PrintWindow、GDI32）。
- **platform/macos.mjs** — CoreGraphics + Accessibility API via koffi、screencapture 命令、AppleScript。Viewport 捕获通过 AX 树遍历找到游戏视口坐标后裁剪。

### 关键依赖

- **koffi** — Native FFI，调用系统 API（Win32 / CoreGraphics / Accessibility）
- **opencv-wasm** — 模板匹配（无需原生编译）
- **sharp** — 图像处理（截图、灰度转换、裁剪）
- **@modelcontextprotocol/sdk** — MCP 服务器实现

### 测试分层

- `tests/*.test.mjs` — 纯单元测试，不依赖平台 API
- `tests/*.native.test.mjs` — 原生测试，需要真实运行环境（vitest.native.config.mjs 单独配置）
- `tests/toolbar_stats/` — 截图样本用于工具栏检测回归测试

### npm 发布配置

包通过 GitHub Packages registry 安装（.npmrc 中配置 `@white-dragon-tools` scope），通过 npm public registry 发布。

## 插件缓存同步（代码变更后必须执行）

本项目作为 Claude Code 插件安装时，MCP server 从插件缓存目录加载，而非当前工作目录。代码变更后如果不同步缓存，MCP tool schema 会与源码不一致。

**每次修改源码后，执行以下步骤：**

1. bump `package.json` 中的 `version`
2. 删除旧缓存，拷贝当前工作目录到新版本缓存：
```bash
# 设置版本号（替换为实际值）
OLD_VER=<旧版本>
NEW_VER=$(node -p "require('./package.json').version")
CACHE_BASE=~/.claude/plugins/cache/roblox-studio-physical-operation-marketplace/roblox-studio-physical-operation

rm -rf "$CACHE_BASE/$OLD_VER"
cp -R "$(pwd)" "$CACHE_BASE/$NEW_VER"
```
3. 更新 `~/.claude/plugins/installed_plugins.json` 中对应条目的 `installPath`、`version`、`lastUpdated`
4. 重启 Claude Code 会话使新 MCP server 生效

## 编码规范

- ES Modules（`.mjs` 扩展名），`"type": "module"`
- Node.js >= 18
- 代码和注释中使用中文
