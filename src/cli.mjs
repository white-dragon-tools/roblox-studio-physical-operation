#!/usr/bin/env node

import { readFileSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import {
  getLogsFromLine,
  searchLogsFromLine,
  findErrors,
  cleanOldLogs,
  getLogsByDate,
} from "./log-utils.mjs";
import { detectToolbarState } from "./toolbar-detector.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const README_PATH = join(__dirname, "..", "README.md");
const SCREENSHOT_DIR = join(tmpdir(), "roblox_studio_mcp_screenshots");

let platform;
async function getPlatform() {
  if (platform) return platform;
  platform = await import("./platform/index.mjs");
  return platform;
}

let studioManager;
async function getStudioManager() {
  if (studioManager) return studioManager;
  studioManager = await import("./studio-manager.mjs");
  return studioManager;
}

// ============ 系统工具 ============

async function studioHelp() {
  try {
    return { content: readFileSync(README_PATH, "utf-8") };
  } catch (e) {
    return { error: `无法读取帮助文档: ${e.message}` };
  }
}

async function studioList() {
  const sm = await getStudioManager();
  const p = await getPlatform();

  const processes = sm.getAllStudioProcesses();
  const logFiles = sm.findLatestStudioLogs(20);
  const logCmdlines = sm.getAllLogCmdlines(logFiles);

  const instances = [];

  for (const proc of processes) {
    const hwnd = p.findWindowByPid(proc.pid);

    // 从日志文件中找到对应的命令行
    let cmdline = proc.cmdline || "";
    for (const [logPath, logCmd] of Object.entries(logCmdlines)) {
      // 简单匹配：如果进程有窗口，就用最新的日志命令行
      if (hwnd && !cmdline) {
        cmdline = logCmd;
        break;
      }
    }

    const placeIdMatch = cmdline.match(/-placeId\s+(\d+)/);
    if (placeIdMatch) {
      instances.push({
        pid: proc.pid,
        hwnd,
        type: "cloud",
        place_id: parseInt(placeIdMatch[1], 10),
      });
    } else {
      const rbxlMatch = cmdline.match(/\.exe["\s]+(.+\.rbxl)/i);
      const placePath = rbxlMatch ? rbxlMatch[1].replace(/"/g, "") : null;
      instances.push({
        pid: proc.pid,
        hwnd,
        type: "local",
        place_path: placePath,
      });
    }
  }

  return instances;
}

async function studioOpen(placePath, options = {}) {
  const sm = await getStudioManager();
  const [success, message, result] = await sm.openPlace(placePath, options);
  const pidMatch = message.match(/PID:\s*(\d+)/);
  const pid = pidMatch ? parseInt(pidMatch[1], 10) : null;
  
  const response = { success, message, pid };
  if (result?.injectedPath) {
    response.injected_path = result.injectedPath;
    response.original_path = result.originalPath;
  }
  return response;
}

async function studioClose(placePath) {
  const sm = await getStudioManager();
  const [success, message] = await sm.closePlace(placePath);
  return { success, message };
}

async function studioStatus(placePath) {
  const sm = await getStudioManager();
  const [ok, msg, session] = await sm.getSession(placePath);
  if (!ok) return { active: false, error: msg };

  return {
    active: true,
    place_path: session.placePath,
    pid: session.pid,
    hwnd: session.hwnd,
    log_path: session.logPath,
  };
}

async function studioQuery(placePath) {
  const sm = await getStudioManager();
  const p = await getPlatform();
  const [ok, msg, session] = await sm.getSession(placePath);

  if (!ok) {
    return { active: false, ready: false, error: msg, has_modal: false, modals: [] };
  }

  const modals = p.getModalWindows(session.hwnd, session.pid);
  const hasModal = modals.length > 0;

  return {
    active: true,
    ready: !hasModal,
    pid: session.pid,
    hwnd: session.hwnd,
    has_modal: hasModal,
    modal_count: modals.length,
    modals: modals.map((m) => ({
      hwnd: m.hwnd,
      title: m.title,
      size: `${m.width}x${m.height}`,
    })),
  };
}

// ============ 模态弹窗 ============

async function modalDetect(placePath) {
  const sm = await getStudioManager();
  const p = await getPlatform();
  const [ok, msg, session] = await sm.getSession(placePath);
  if (!ok) return { error: msg };

  const modals = p.getModalWindows(session.hwnd, session.pid);

  return {
    has_modal: modals.length > 0,
    count: modals.length,
    modals: modals.map((m) => ({
      hwnd: m.hwnd,
      title: m.title,
      size: `${m.width}x${m.height}`,
    })),
  };
}

async function modalClose(placePath) {
  const sm = await getStudioManager();
  const p = await getPlatform();
  const [ok, msg, session] = await sm.getSession(placePath);
  if (!ok) return { error: msg };
  const [count, titles] = p.closeAllModals(session.hwnd, session.pid);
  return { closed_count: count, closed_titles: titles };
}

// ============ 游戏控制 ============

async function gameStart(placePath) {
  const sm = await getStudioManager();
  const p = await getPlatform();
  const [ok, msg, session] = await sm.getSession(placePath);
  if (!ok) return { success: false, message: `错误: ${msg}` };

  const ok2 = p.sendKeyToWindow(session.hwnd, p.VK_F5);
  return { success: ok2, message: ok2 ? "已发送 F5 (开始游戏)" : "发送按键失败" };
}

async function gameStop(placePath) {
  const sm = await getStudioManager();
  const p = await getPlatform();
  const [ok, msg, session] = await sm.getSession(placePath);
  if (!ok) return { success: false, message: `错误: ${msg}` };

  const ok2 = p.sendKeyComboToWindow(session.hwnd, [p.VK_SHIFT, p.VK_F5]);
  return { success: ok2, message: ok2 ? "已发送 Shift+F5 (停止游戏)" : "发送按键失败" };
}

async function gamePause(placePath) {
  const sm = await getStudioManager();
  const p = await getPlatform();
  const [ok, msg, session] = await sm.getSession(placePath);
  if (!ok) return { success: false, message: `错误: ${msg}` };

  const ok2 = p.sendKeyToWindow(session.hwnd, p.VK_F12);
  return { success: ok2, message: ok2 ? "已发送 F12 (暂停/恢复)" : "发送按键失败" };
}

// ============ 日志分析 ============

async function logsGet(placePath, options = {}) {
  const sm = await getStudioManager();
  const [ok, msg, session] = await sm.getSession(placePath);
  if (!ok) return { error: msg };

  return getLogsFromLine(session.logPath, {
    afterLine: options.after_line,
    beforeLine: options.before_line,
    startDate: options.start_date,
    endDate: options.end_date,
    timestamps: options.timestamps,
    runContext: options.context,
    includeContext: true,
  });
}

async function logsSearch(placePath, pattern, options = {}) {
  const sm = await getStudioManager();
  const [ok, msg, session] = await sm.getSession(placePath);
  if (!ok) return { error: msg };

  return searchLogsFromLine(session.logPath, pattern, {
    afterLine: options.after_line,
    beforeLine: options.before_line,
    startDate: options.start_date,
    endDate: options.end_date,
    timestamps: options.timestamps,
    runContext: options.context,
    includeContext: true,
  });
}

async function logsClean(days = 7) {
  const count = cleanOldLogs(days);
  return { message: `已清理 ${count} 个旧日志文件`, count };
}

async function logsHasError(placePath, options = {}) {
  const sm = await getStudioManager();
  const [ok, msg, session] = await sm.getSession(placePath);
  if (!ok) return { error: msg };

  return findErrors(session.logPath, {
    afterLine: options.after_line,
    beforeLine: options.before_line,
    startDate: options.start_date,
    endDate: options.end_date,
    runContext: options.context,
    maxErrors: options.max_errors || 100,
  });
}

async function logsByDate(placePath, options = {}) {
  const sm = await getStudioManager();
  const [ok, msg, session] = await sm.getSession(placePath);
  if (!ok) return { error: msg };

  return getLogsByDate(session.logPath, {
    startDate: options.start_date,
    endDate: options.end_date,
    timestamps: options.timestamps !== false,
    runContext: options.context,
    includeContext: true,
  });
}

// ============ 工具栏状态 ============

async function toolbarState(placePath) {
  const sm = await getStudioManager();
  const p = await getPlatform();
  const [ok, msg, session] = await sm.getSession(placePath);
  if (!ok) return { error: msg };

  const capture = p.captureWindowToBuffer(session.hwnd);
  if (!capture) return { error: "无法捕获窗口" };

  const state = await detectToolbarState(capture);
  if (!state) return { error: "无法检测工具栏状态" };

  return {
    play: state.play,
    pause: state.pause,
    stop: state.stop,
    game_state: state.gameState,
  };
}

async function toolbarStateDebug(placePath, saveDebugImage = true) {
  const sm = await getStudioManager();
  const p = await getPlatform();
  const [ok, msg, session] = await sm.getSession(placePath);
  if (!ok) return { error: msg };

  const capture = p.captureWindowToBuffer(session.hwnd);
  if (!capture) return { error: "无法捕获窗口" };

  const state = await detectToolbarState(capture);

  let debugPath = null;
  if (saveDebugImage) {
    mkdirSync(SCREENSHOT_DIR, { recursive: true });
    debugPath = join(SCREENSHOT_DIR, `toolbar_debug_${Date.now()}.png`);
    const sharp = (await import("sharp")).default;
    await sharp(capture.data, { raw: { width: capture.width, height: capture.height, channels: 3 } })
      .png()
      .toFile(debugPath);
  }

  return {
    state: state ? {
      play: state.play,
      pause: state.pause,
      stop: state.stop,
      game_state: state.gameState,
    } : null,
    debug: {
      image_path: debugPath,
      capture_size: `${capture.width}x${capture.height}`,
      buttons: state?.buttons || [],
    },
  };
}

// ============ 截图 ============

async function screenshot(placePath, filename = null) {
  const sm = await getStudioManager();
  const p = await getPlatform();
  const [ok, msg, session] = await sm.getSession(placePath);
  if (!ok) return { error: msg };

  mkdirSync(SCREENSHOT_DIR, { recursive: true });

  if (!filename) {
    filename = `screenshot_${Date.now()}.png`;
  }

  const outputPath = join(SCREENSHOT_DIR, filename);
  const result = await p.captureWindow(session.hwnd, outputPath);

  if (result) {
    return { success: true, path: outputPath };
  } else {
    return { error: "截图失败" };
  }
}

async function screenshotFull(placePath, filename = null) {
  const sm = await getStudioManager();
  const p = await getPlatform();
  const [ok, msg, session] = await sm.getSession(placePath);
  if (!ok) return { error: msg };

  mkdirSync(SCREENSHOT_DIR, { recursive: true });

  if (!filename) {
    filename = `screenshot_full_${Date.now()}.png`;
  }

  const outputPath = join(SCREENSHOT_DIR, filename);

  if (typeof p.captureWindowWithModals === "function") {
    const [result, windowsInfo] = p.captureWindowWithModals(session.hwnd, session.pid, outputPath);
    if (result) {
      return {
        success: true,
        path: outputPath,
        windows_count: windowsInfo.length,
        windows: windowsInfo.map((w) => ({
          hwnd: w.hwnd,
          title: w.title || "",
          size: `${w.width || 0}x${w.height || 0}`,
        })),
      };
    }
    return { error: "截图失败", details: windowsInfo };
  }

  // Fallback to regular screenshot
  const result = await p.captureWindow(session.hwnd, outputPath);
  if (result) {
    return { success: true, path: outputPath, windows_count: 1 };
  }
  return { error: "截图失败" };
}

// ============ 文件操作 ============

async function injectLocalPathCmd(placePath) {
  const { resolve } = await import("node:path");
  const absolutePath = resolve(placePath);

  if (!existsSync(absolutePath)) {
    return { success: false, error: `文件不存在: ${absolutePath}` };
  }

  try {
    const { injectLocalPath } = await import("./lune-manager.mjs");
    const outputPath = await injectLocalPath(absolutePath);
    return { 
      success: true, 
      original_path: absolutePath,
      output_path: outputPath,
    };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

// ============ 命令映射 ============

const COMMANDS = {
  // 系统
  studio_help: studioHelp,
  studio_list: studioList,
  open: studioOpen,
  close: studioClose,
  studio_status: studioStatus,
  studio_query: studioQuery,
  // 模态弹窗
  modal_detect: modalDetect,
  modal_close: modalClose,
  // 游戏控制
  game_start: gameStart,
  game_stop: gameStop,
  game_pause: gamePause,
  // 日志
  logs_get: logsGet,
  logs_search: logsSearch,
  logs_clean: logsClean,
  logs_has_error: logsHasError,
  logs_by_date: logsByDate,
  // 工具栏
  toolbar_state: toolbarState,
  toolbar_state_debug: toolbarStateDebug,
  // 截图
  screenshot: screenshot,
  screenshot_full: screenshotFull,
  // 文件操作
  inject: injectLocalPathCmd,
};

function printUsage() {
  console.log(`Usage: cli.mjs <command> [place_path] [options]

Commands:
  studio_help                     获取帮助文档
  studio_list                     列出所有运行中的 Studio 实例
  open <place_path> [--inject]    打开 Studio (--inject: 注入 LocalPlacePath)
  close <place_path>              关闭 Studio
  studio_status <place_path>      获取状态
  studio_query <place_path>       综合查询状态

  modal_detect <place_path>       检测模态弹窗
  modal_close <place_path>        关闭所有模态弹窗

  game_start <place_path>         开始游戏 (F5)
  game_stop <place_path>          停止游戏 (Shift+F5)
  game_pause <place_path>         暂停/恢复游戏 (F12)

  logs_get <place_path>           获取日志
  logs_search <place_path> <pattern>  搜索日志
  logs_clean [days]               清理旧日志 (默认 7 天)
  logs_has_error <place_path>     检测错误
  logs_by_date <place_path>       按日期获取日志

  toolbar_state <place_path>      检测工具栏状态
  toolbar_state_debug <place_path>  带调试的工具栏检测

  screenshot <place_path>         截图
  screenshot_full <place_path>    完整截图（含弹窗）

  inject <place_path>             注入 LocalPlacePath 属性到临时文件
`);
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args[0] === "--help" || args[0] === "-h") {
    printUsage();
    process.exit(0);
  }

  const command = args[0];
  const handler = COMMANDS[command];

  if (!handler) {
    console.log(JSON.stringify({ error: `未知命令: ${command}` }));
    process.exit(1);
  }

  try {
    let result;

    // 特殊处理不需要 place_path 的命令
    if (command === "studio_help" || command === "studio_list") {
      result = await handler();
    } else if (command === "logs_clean") {
      const days = args[1] ? parseInt(args[1], 10) : 7;
      result = await handler(days);
    } else if (command === "logs_search") {
      const placePath = args[1];
      const pattern = args[2] || "";
      result = await handler(placePath, pattern);
    } else if (command === "open") {
      const placePath = args[1];
      if (!placePath) {
        console.log(JSON.stringify({ error: "缺少 place_path 参数" }));
        process.exit(1);
      }
      const injectFlag = args.includes("--inject");
      result = await handler(placePath, { injectLocalPath: injectFlag });
    } else {
      const placePath = args[1];
      if (!placePath) {
        console.log(JSON.stringify({ error: "缺少 place_path 参数" }));
        process.exit(1);
      }
      result = await handler(placePath);
    }

    console.log(JSON.stringify(result, null, 2));
  } catch (e) {
    console.log(JSON.stringify({ error: e.message, stack: e.stack }));
    process.exit(1);
  }
}

main();
