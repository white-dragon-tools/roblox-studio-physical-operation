#!/usr/bin/env node

import { mkdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  getLogsFromLine,
  findErrors,
} from "./log-utils.mjs";
import { detectToolbarState } from "./toolbar-detector.mjs";
import { parseOptions, getCommandExamples } from "./cli-parse.mjs";

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

// ============ Handler 函数 ============

async function list() {
  const sm = await getStudioManager();
  const p = await getPlatform();

  const processes = sm.getAllStudioProcesses();
  const logFiles = sm.findLatestStudioLogs(20);
  const logCmdlines = sm.getAllLogCmdlines(logFiles);

  const instances = [];

  for (const proc of processes) {
    const hwnd = p.findWindowByPid(proc.pid);

    let cmdline = proc.cmdline || "";
    for (const [logPath, logCmd] of Object.entries(logCmdlines)) {
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

async function open(placePath) {
  const sm = await getStudioManager();
  const [success, message] = await sm.openPlace(placePath);
  const pidMatch = message.match(/PID:\s*(\d+)/);
  const pid = pidMatch ? parseInt(pidMatch[1], 10) : null;
  return { success, message, pid };
}

async function close(placePath) {
  const sm = await getStudioManager();
  const [success, message] = await sm.closePlace(placePath);
  return { success, message };
}

async function status(placePath) {
  const sm = await getStudioManager();
  const p = await getPlatform();
  const [ok, msg, session] = await sm.getSession(placePath);

  if (!ok) {
    return { active: false, ready: false, error: msg, has_modal: false, modals: [] };
  }

  const modals = p.getModalWindows(session.hwnd, session.pid);
  const hasModal = modals.length > 0;

  let logLastLine = 0;
  if (session.logPath && existsSync(session.logPath)) {
    const content = readFileSync(session.logPath, "utf-8");
    logLastLine = content.split("\n").length;
  }

  return {
    active: true,
    ready: !hasModal,
    place_path: session.placePath,
    pid: session.pid,
    hwnd: session.hwnd,
    log_path: session.logPath,
    log_last_line: logLastLine,
    has_modal: hasModal,
    modal_count: modals.length,
    modals: modals.map((m) => ({
      hwnd: m.hwnd,
      title: m.title,
      size: `${m.width}x${m.height}`,
    })),
  };
}

async function modal(placePath, options = {}) {
  const sm = await getStudioManager();
  const p = await getPlatform();
  const [ok, msg, session] = await sm.getSession(placePath);
  if (!ok) return { error: msg };

  if (options.close) {
    const [count, titles] = p.closeAllModals(session.hwnd, session.pid);
    return { closed_count: count, closed_titles: titles };
  }

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

async function game(placePath, action) {
  const sm = await getStudioManager();
  const p = await getPlatform();
  const [ok, msg, session] = await sm.getSession(placePath);
  if (!ok) return { success: false, message: `错误: ${msg}` };

  switch (action) {
    case "start": {
      const ok2 = p.sendKeyToWindow(session.hwnd, p.VK_F5);
      return { success: ok2, message: ok2 ? "已发送 F5 (开始游戏)" : "发送按键失败" };
    }
    case "stop": {
      const ok2 = p.sendKeyComboToWindow(session.hwnd, [p.VK_SHIFT, p.VK_F5]);
      return { success: ok2, message: ok2 ? "已发送 Shift+F5 (停止游戏)" : "发送按键失败" };
    }
    case "pause": {
      const ok2 = p.sendKeyToWindow(session.hwnd, p.VK_F12);
      return { success: ok2, message: ok2 ? "已发送 F12 (暂停/恢复)" : "发送按键失败" };
    }
    default:
      return { success: false, message: `未知动作: ${action}，可用: start, stop, pause` };
  }
}

async function log(placePath, options = {}) {
  const sm = await getStudioManager();
  const [ok, msg, session] = await sm.getSession(placePath);
  if (!ok) return { error: msg };

  const logOpts = {
    afterLine: options.after_line,
    beforeLine: options.before_line,
    startDate: options.start_date,
    endDate: options.end_date,
    timestamps: options.timestamps,
    runContext: options.context,
    includeContext: true,
  };

  if (options.errors) {
    return findErrors(session.logPath, {
      ...logOpts,
      maxErrors: options.max_errors || 100,
    });
  }

  return getLogsFromLine(session.logPath, logOpts);
}

async function screenshotCmd(placePath, options = {}) {
  const sm = await getStudioManager();
  const p = await getPlatform();
  const [ok, msg, session] = await sm.getSession(placePath);
  if (!ok) return { error: msg };

  mkdirSync(SCREENSHOT_DIR, { recursive: true });

  if (!options.full && !options.normal) {
    if (typeof p.captureViewport !== "function") {
      return { error: "当前平台不支持 viewport 截图" };
    }
    const buf = await p.captureViewport(session.hwnd, session.pid, placePath);
    if (!buf) return { error: "无法捕获游戏视口" };

    const filename = options.filename || `viewport_${Date.now()}.png`;
    const outputPath = join(SCREENSHOT_DIR, filename);
    const sharp = (await import("sharp")).default;
    await sharp(buf.data, { raw: { width: buf.width, height: buf.height, channels: 3 } })
      .png()
      .toFile(outputPath);
    return { success: true, path: outputPath, size: `${buf.width}x${buf.height}` };
  }

  if (options.full) {
    const filename = options.filename || `screenshot_full_${Date.now()}.png`;
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

    const result = await p.captureWindow(session.hwnd, outputPath);
    if (result) {
      return { success: true, path: outputPath, windows_count: 1 };
    }
    return { error: "截图失败" };
  }

  // --normal: 普通截图
  const filename = options.filename || `screenshot_${Date.now()}.png`;
  const outputPath = join(SCREENSHOT_DIR, filename);
  const result = await p.captureWindow(session.hwnd, outputPath);

  if (result) {
    return { success: true, path: outputPath };
  }
  return { error: "截图失败" };
}

async function toolbar(placePath, options = {}) {
  const sm = await getStudioManager();
  const p = await getPlatform();
  const [ok, msg, session] = await sm.getSession(placePath);
  if (!ok) return { error: msg };

  const capture = await p.captureWindowToBuffer(session.hwnd);
  if (!capture) return { error: "无法捕获窗口" };

  // 工具栏在窗口顶部，只需裁剪上部区域进行检测，避免处理整个窗口图像
  const TOOLBAR_MAX_HEIGHT = 300;
  const cropH = Math.min(capture.height, TOOLBAR_MAX_HEIGHT);
  const toolbarCapture = cropH < capture.height
    ? { data: capture.data.subarray(0, capture.width * 3 * cropH), width: capture.width, height: cropH }
    : capture;

  const state = await detectToolbarState(toolbarCapture);

  if (options.debug) {
    let debugPath = null;
    if (options.save !== false) {
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

  if (!state) return { error: "无法检测工具栏状态" };

  return {
    play: state.play,
    pause: state.pause,
    stop: state.stop,
    game_state: state.gameState,
  };
}

// ============ 命令定义 ============

const LOG_OPTIONS = [
  "  --after-line <n>    从指定行号之后开始",
  "  --before-line <n>   到指定行号之前结束",
  "  --start-date <date> 开始日期 (YYYY-MM-DD HH:MM:SS)",
  "  --end-date <date>   结束日期 (YYYY-MM-DD HH:MM:SS)",
  "  --timestamps        显示时间戳",
  "  --context <ctx>     过滤运行上下文 (play/edit)",
];

const COMMANDS = {
  list: {
    args: "",
    desc: "列出所有运行中的 Studio 实例",
  },
  open: {
    args: "<place_path>",
    desc: "打开 Studio 并加载指定的 .rbxl 文件",
  },
  close: {
    args: "<place_path>",
    desc: "关闭指定 Place 的 Studio 实例",
  },
  status: {
    args: "<place_path>",
    desc: "获取 Studio 综合状态（进程、窗口、模态弹窗、日志路径）",
  },
  modal: {
    args: "<place_path> [--close]",
    desc: "检测模态弹窗，使用 --close 关闭所有弹窗",
    options: [
      "  --close             关闭所有模态弹窗",
    ],
  },
  game: {
    args: "<start|stop|pause> <place_path>",
    desc: "游戏控制：start (F5), stop (Shift+F5), pause (F12)",
    subcommands: ["start", "stop", "pause"],
  },
  log: {
    args: "<place_path> [options]",
    desc: "获取日志或检测错误",
    options: [
      "  --errors            检测错误输出（Roblox 特定错误模式）",
      "  --max-errors <n>    最多返回的错误数量（默认 100，配合 --errors）",
      ...LOG_OPTIONS,
    ],
  },
  screenshot: {
    args: "<place_path> [filename]",
    desc: "截取 Studio 窗口截图",
    options: [
      "  --normal            截取普通窗口截图（默认为 viewport）",
      "  --full              截取完整截图（包含所有模态弹窗）",
    ],
  },
  toolbar: {
    args: "<place_path>",
    desc: "检测工具栏按钮状态（播放、暂停、停止）",
    options: [
      "  --debug             输出调试信息和截图",
      "  --no-save           调试模式下不保存截图文件",
    ],
  },
};

function printUsage() {
  console.log(`Usage: rspo <command> [place_path] [options]
       rspo <command> -h    显示命令帮助

Commands:
  Studio 管理:
    list                            列出所有运行中的 Studio 实例
    open <place_path>               打开 Studio
    close <place_path>              关闭 Studio
    status <place_path>             获取综合状态

  模态弹窗:
    modal <place_path> [--close]    检测或关闭模态弹窗

  游戏控制:
    game start <place_path>         开始游戏 (F5)
    game stop <place_path>          停止游戏 (Shift+F5)
    game pause <place_path>         暂停/恢复游戏 (F12)

  日志分析:
    log <place_path>                获取日志
    log <place_path> --errors       检测错误

  工具栏检测:
    toolbar <place_path>            检测工具栏状态
    toolbar <place_path> --debug    带调试信息的检测

  截图:
    screenshot <place_path>           游戏视口截图（默认）
    screenshot <place_path> --normal  普通窗口截图
    screenshot <place_path> --full    完整截图（含弹窗）

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

  if (cmd.subcommands) {
    console.log("Subcommands:");
    for (const sub of cmd.subcommands) {
      console.log(`  ${sub}`);
    }
    console.log();
  }

  if (cmd.options && cmd.options.length > 0) {
    console.log("Options:");
    for (const opt of cmd.options) {
      console.log(opt);
    }
    console.log();
  }

  const examples = getCommandExamples(command);
  if (examples) {
    console.log("Examples:");
    console.log(examples);
  }
}

// parseOptions and getCommandExamples imported from cli-parse.mjs

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

  const options = parseOptions(args.slice(1));

  try {
    let result;

    switch (command) {
      case "list": {
        result = await list();
        break;
      }

      case "open": {
        const placePath = args[1];
        if (!placePath || placePath.startsWith("-")) {
          console.log(JSON.stringify({ error: "缺少 place_path 参数" }));
          process.exit(1);
        }
        result = await open(placePath);
        break;
      }

      case "close": {
        const placePath = args[1];
        if (!placePath || placePath.startsWith("-")) {
          console.log(JSON.stringify({ error: "缺少 place_path 参数" }));
          process.exit(1);
        }
        result = await close(placePath);
        break;
      }

      case "status": {
        const placePath = args[1];
        if (!placePath || placePath.startsWith("-")) {
          console.log(JSON.stringify({ error: "缺少 place_path 参数" }));
          process.exit(1);
        }
        result = await status(placePath);
        break;
      }

      case "modal": {
        const placePath = args[1];
        if (!placePath || placePath.startsWith("-")) {
          console.log(JSON.stringify({ error: "缺少 place_path 参数" }));
          process.exit(1);
        }
        result = await modal(placePath, options);
        break;
      }

      case "game": {
        const action = args[1];
        if (!action || !["start", "stop", "pause"].includes(action)) {
          console.log(JSON.stringify({ error: "用法: rspo game <start|stop|pause> <place_path>" }));
          process.exit(1);
        }
        const placePath = args[2];
        if (!placePath || placePath.startsWith("-")) {
          console.log(JSON.stringify({ error: "缺少 place_path 参数" }));
          process.exit(1);
        }
        result = await game(placePath, action);
        break;
      }

      case "log": {
        const placePath = args[1];
        if (!placePath || placePath.startsWith("-")) {
          console.log(JSON.stringify({ error: "缺少 place_path 参数" }));
          process.exit(1);
        }
        result = await log(placePath, options);
        break;
      }

      case "screenshot": {
        const placePath = args[1];
        if (!placePath || placePath.startsWith("-")) {
          console.log(JSON.stringify({ error: "缺少 place_path 参数" }));
          process.exit(1);
        }
        // 查找非 flag 的第二个参数作为 filename
        const filenameArg = args[2] && !args[2].startsWith("-") ? args[2] : null;
        if (filenameArg) options.filename = filenameArg;
        result = await screenshotCmd(placePath, options);
        break;
      }

      case "toolbar": {
        const placePath = args[1];
        if (!placePath || placePath.startsWith("-")) {
          console.log(JSON.stringify({ error: "缺少 place_path 参数" }));
          process.exit(1);
        }
        result = await toolbar(placePath, options);
        break;
      }
    }

    console.log(JSON.stringify(result, null, 2));
  } catch (e) {
    console.log(JSON.stringify({ error: e.message, stack: e.stack }));
    process.exit(1);
  }
}

// Only run when executed directly, not when imported for testing
import { fileURLToPath } from "node:url";
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
