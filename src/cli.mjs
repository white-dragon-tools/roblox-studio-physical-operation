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

async function studioOpen(placePath) {
  const sm = await getStudioManager();
  const [success, message] = await sm.openPlace(placePath);
  const pidMatch = message.match(/PID:\s*(\d+)/);
  const pid = pidMatch ? parseInt(pidMatch[1], 10) : null;
  return { success, message, pid };
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

  const capture = await p.captureWindowToBuffer(session.hwnd);
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

  const capture = await p.captureWindowToBuffer(session.hwnd);
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

// ============ 命令映射 ============

const LOG_OPTIONS = [
  "  --after-line <n>    从指定行号之后开始",
  "  --before-line <n>   到指定行号之前结束",
  "  --start-date <date> 开始日期 (YYYY-MM-DD HH:MM:SS)",
  "  --end-date <date>   结束日期 (YYYY-MM-DD HH:MM:SS)",
  "  --timestamps        显示时间戳",
  "  --context <ctx>     过滤运行上下文 (play/edit)",
];

const COMMANDS = {
  // 系统
  studio_help: { fn: studioHelp, args: "", desc: "获取帮助文档" },
  studio_list: { fn: studioList, args: "", desc: "列出所有运行中的 Studio 实例" },
  open: { fn: studioOpen, args: "<place_path>", desc: "打开 Studio 并加载指定的 .rbxl 文件" },
  close: { fn: studioClose, args: "<place_path>", desc: "关闭指定 Place 的 Studio 实例" },
  studio_status: { fn: studioStatus, args: "<place_path>", desc: "获取指定 Place 的基本状态" },
  studio_query: { fn: studioQuery, args: "<place_path>", desc: "综合查询状态（进程、窗口、模态弹窗）" },
  // 模态弹窗
  modal_detect: { fn: modalDetect, args: "<place_path>", desc: "检测是否存在模态弹窗" },
  modal_close: { fn: modalClose, args: "<place_path>", desc: "关闭所有模态弹窗" },
  // 游戏控制
  game_start: { fn: gameStart, args: "<place_path>", desc: "开始游戏（发送 F5）" },
  game_stop: { fn: gameStop, args: "<place_path>", desc: "停止游戏（发送 Shift+F5）" },
  game_pause: { fn: gamePause, args: "<place_path>", desc: "暂停/恢复游戏（发送 F12）" },
  // 日志
  logs_get: { fn: logsGet, args: "<place_path> [options]", desc: "获取过滤后的日志（仅用户脚本输出）", options: LOG_OPTIONS },
  logs_search: { fn: logsSearch, args: "<place_path> <pattern> [options]", desc: "在日志中搜索匹配的条目", options: LOG_OPTIONS },
  logs_clean: { fn: logsClean, args: "[days]", desc: "清理超过指定天数的旧日志文件（默认 7 天）" },
  logs_has_error: { fn: logsHasError, args: "<place_path> [options]", desc: "检测指定范围内是否有错误输出", options: [...LOG_OPTIONS, "  --max-errors <n>    最多返回的错误数量（默认 100）"] },
  logs_by_date: { fn: logsByDate, args: "<place_path> [options]", desc: "按日期范围获取日志", options: LOG_OPTIONS },
  // 工具栏
  toolbar_state: { fn: toolbarState, args: "<place_path>", desc: "检测工具栏按钮状态（播放、暂停、停止）" },
  toolbar_state_debug: { fn: toolbarStateDebug, args: "<place_path> [--no-save]", desc: "带调试信息的工具栏状态检测" },
  // 截图
  screenshot: { fn: screenshot, args: "<place_path> [filename]", desc: "截取 Studio 窗口截图" },
  screenshot_full: { fn: screenshotFull, args: "<place_path> [filename]", desc: "截取完整截图（包含所有模态弹窗）" },
};

function printUsage() {
  console.log(`Usage: rspo <command> [place_path] [options]
       rspo <command> -h    显示命令帮助

Commands:
  Studio 管理:
    studio_help                     获取帮助文档
    studio_list                     列出所有运行中的 Studio 实例
    open <place_path>               打开 Studio
    close <place_path>              关闭 Studio
    studio_status <place_path>      获取状态
    studio_query <place_path>       综合查询状态

  模态弹窗:
    modal_detect <place_path>       检测模态弹窗
    modal_close <place_path>        关闭所有模态弹窗

  游戏控制:
    game_start <place_path>         开始游戏 (F5)
    game_stop <place_path>          停止游戏 (Shift+F5)
    game_pause <place_path>         暂停/恢复游戏 (F12)

  日志分析:
    logs_get <place_path>           获取日志
    logs_search <place_path> <pattern>  搜索日志
    logs_clean [days]               清理旧日志 (默认 7 天)
    logs_has_error <place_path>     检测错误
    logs_by_date <place_path>       按日期获取日志

  工具栏检测:
    toolbar_state <place_path>      检测工具栏状态
    toolbar_state_debug <place_path>  带调试的工具栏检测

  截图:
    screenshot <place_path>         截图
    screenshot_full <place_path>    完整截图（含弹窗）

所有命令输出 JSON 格式。使用 "rspo <command> -h" 查看命令详情。
`);
}

function printCommandHelp(command) {
  const cmd = COMMANDS[command];
  if (!cmd) {
    console.log(`未知命令: ${command}`);
    process.exit(1);
  }

  console.log(`Usage: rspo ${command} ${cmd.args}

${cmd.desc}
`);

  if (cmd.options && cmd.options.length > 0) {
    console.log("Options:");
    for (const opt of cmd.options) {
      console.log(opt);
    }
    console.log();
  }

  // 输出示例
  const examples = getCommandExamples(command);
  if (examples) {
    console.log("Examples:");
    console.log(examples);
  }
}

function getCommandExamples(command) {
  const exampleMap = {
    open: '  rspo open "D:/project/game.rbxl"',
    close: '  rspo close "D:/project/game.rbxl"',
    studio_query: '  rspo studio_query "D:/project/game.rbxl"\n\n  Output: { "active": true, "ready": true, "pid": 12345, "hwnd": 67890, "has_modal": false }',
    game_start: '  rspo game_start "D:/project/game.rbxl"',
    game_stop: '  rspo game_stop "D:/project/game.rbxl"',
    game_pause: '  rspo game_pause "D:/project/game.rbxl"',
    modal_close: '  rspo modal_close "D:/project/game.rbxl"',
    logs_get: '  rspo logs_get "D:/project/game.rbxl"\n  rspo logs_get "D:/project/game.rbxl" --after-line 100 --timestamps',
    logs_search: '  rspo logs_search "D:/project/game.rbxl" "error"\n  rspo logs_search "D:/project/game.rbxl" "Score:" --context play',
    logs_clean: '  rspo logs_clean\n  rspo logs_clean 14',
    logs_has_error: '  rspo logs_has_error "D:/project/game.rbxl"\n  rspo logs_has_error "D:/project/game.rbxl" --after-line 100',
    logs_by_date: '  rspo logs_by_date "D:/project/game.rbxl" --start-date "2024-01-01 00:00:00"',
    toolbar_state: '  rspo toolbar_state "D:/project/game.rbxl"\n\n  Output: { "play": "enabled", "pause": "disabled", "stop": "disabled", "game_state": "stopped" }',
    toolbar_state_debug: '  rspo toolbar_state_debug "D:/project/game.rbxl"',
    screenshot: '  rspo screenshot "D:/project/game.rbxl"\n  rspo screenshot "D:/project/game.rbxl" my_screenshot.png',
    screenshot_full: '  rspo screenshot_full "D:/project/game.rbxl"',
  };
  return exampleMap[command] || null;
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args[0] === "--help" || args[0] === "-h") {
    printUsage();
    process.exit(0);
  }

  const command = args[0];
  const cmdInfo = COMMANDS[command];

  if (!cmdInfo) {
    console.log(JSON.stringify({ error: `未知命令: ${command}` }));
    process.exit(1);
  }

  // 检查命令级别的 -h
  if (args.includes("-h") || args.includes("--help")) {
    printCommandHelp(command);
    process.exit(0);
  }

  const handler = cmdInfo.fn;

  try {
    let result;

    // 解析选项参数
    const options = parseOptions(args.slice(1));

    // 特殊处理不需要 place_path 的命令
    if (command === "studio_help" || command === "studio_list") {
      result = await handler();
    } else if (command === "logs_clean") {
      const days = args[1] && !args[1].startsWith("-") ? parseInt(args[1], 10) : 7;
      result = await handler(days);
    } else if (command === "logs_search") {
      const placePath = args[1];
      const pattern = args[2] || "";
      if (!placePath || placePath.startsWith("-")) {
        console.log(JSON.stringify({ error: "缺少 place_path 参数" }));
        process.exit(1);
      }
      result = await handler(placePath, pattern, options);
    } else if (command === "toolbar_state_debug") {
      const placePath = args[1];
      if (!placePath || placePath.startsWith("-")) {
        console.log(JSON.stringify({ error: "缺少 place_path 参数" }));
        process.exit(1);
      }
      const saveDebug = !args.includes("--no-save");
      result = await handler(placePath, saveDebug);
    } else if (command === "screenshot" || command === "screenshot_full") {
      const placePath = args[1];
      if (!placePath || placePath.startsWith("-")) {
        console.log(JSON.stringify({ error: "缺少 place_path 参数" }));
        process.exit(1);
      }
      const filename = args[2] && !args[2].startsWith("-") ? args[2] : null;
      result = await handler(placePath, filename);
    } else if (command.startsWith("logs_")) {
      const placePath = args[1];
      if (!placePath || placePath.startsWith("-")) {
        console.log(JSON.stringify({ error: "缺少 place_path 参数" }));
        process.exit(1);
      }
      result = await handler(placePath, options);
    } else {
      const placePath = args[1];
      if (!placePath || placePath.startsWith("-")) {
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

function parseOptions(args) {
  const options = {};
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--after-line" && args[i + 1]) {
      options.after_line = parseInt(args[++i], 10);
    } else if (arg === "--before-line" && args[i + 1]) {
      options.before_line = parseInt(args[++i], 10);
    } else if (arg === "--start-date" && args[i + 1]) {
      options.start_date = args[++i];
    } else if (arg === "--end-date" && args[i + 1]) {
      options.end_date = args[++i];
    } else if (arg === "--timestamps") {
      options.timestamps = true;
    } else if (arg === "--context" && args[i + 1]) {
      options.context = args[++i];
    } else if (arg === "--max-errors" && args[i + 1]) {
      options.max_errors = parseInt(args[++i], 10);
    }
  }
  return options;
}

main();
