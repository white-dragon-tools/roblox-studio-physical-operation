#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { getLogsFromLine, findErrors } from "./log-utils.mjs";
import { detectToolbarState } from "./toolbar-detector.mjs";
import { ensureScreenshotDir, recordViewport } from "./screenshot-utils.mjs";

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

// ============ Handler functions (mirroring cli.mjs logic) ============

async function handleList() {
  const sm = await getStudioManager();
  return sm.listInstances();
}

async function handleOpen(placePath) {
  const sm = await getStudioManager();
  const [success, message] = await sm.openPlace(placePath);
  const pidMatch = message.match(/PID:\s*(\d+)/);
  const pid = pidMatch ? parseInt(pidMatch[1], 10) : null;
  return { success, message, pid };
}

async function handleActivate(placePath) {
  const sm = await getStudioManager();
  const p = await getPlatform();
  const [ok, msg, session] = await sm.getSession(placePath);
  if (!ok) return { success: false, message: msg };
  const result = p.activateWindow(session.hwnd, session.pid);
  return { success: result, message: result ? "已激活窗口" : "激活窗口失败" };
}

async function handleHide(placePath) {
  const sm = await getStudioManager();
  const p = await getPlatform();
  const [ok, msg, session] = await sm.getSession(placePath);
  if (!ok) return { success: false, message: msg };
  const result = p.hideWindow(session.hwnd, session.pid);
  return { success: result, message: result ? "已隐藏窗口" : "隐藏窗口失败" };
}

async function handleClose(placePath) {
  const sm = await getStudioManager();
  const [success, message] = await sm.closePlace(placePath);
  return { success, message };
}

async function handleStatus(placePath) {
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

async function handleModal(placePath, shouldClose) {
  const sm = await getStudioManager();
  const p = await getPlatform();
  const [ok, msg, session] = await sm.getSession(placePath);
  if (!ok) return { error: msg };

  if (shouldClose) {
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

async function handleGame(placePath, action) {
  const sm = await getStudioManager();
  const p = await getPlatform();
  const [ok, msg, session] = await sm.getSession(placePath);
  if (!ok) return { success: false, message: msg };

  switch (action) {
    case "start": {
      const ok2 = p.sendKeyToWindow(session.hwnd, p.VK_F5);
      return { success: ok2, message: ok2 ? "Sent F5 (start game)" : "Failed to send key" };
    }
    case "stop": {
      const ok2 = p.sendKeyComboToWindow(session.hwnd, [p.VK_SHIFT, p.VK_F5]);
      return { success: ok2, message: ok2 ? "Sent Shift+F5 (stop game)" : "Failed to send key" };
    }
    case "pause": {
      const ok2 = p.sendKeyToWindow(session.hwnd, p.VK_F12);
      return { success: ok2, message: ok2 ? "Sent F12 (pause/resume)" : "Failed to send key" };
    }
    default:
      return { success: false, message: `Unknown action: ${action}. Available: start, stop, pause` };
  }
}

async function handleLog(placePath, options = {}) {
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

async function handleScreenshot(placePath, options = {}) {
  const sm = await getStudioManager();
  const p = await getPlatform();
  const [ok, msg, session] = await sm.getSession(placePath);
  if (!ok) return { error: msg };

  const screenshotDir = ensureScreenshotDir(placePath);

  if (options.mode === "viewport") {
    if (typeof p.captureViewport !== "function") {
      return { error: "Viewport capture not supported on this platform" };
    }
    const buf = await p.captureViewport(session.hwnd, session.pid, placePath);
    if (!buf) return { error: "Failed to capture game viewport" };

    const filename = options.filename || `viewport_${Date.now()}.png`;
    const outputPath = join(screenshotDir, filename);
    const sharp = (await import("sharp")).default;
    await sharp(buf.data, { raw: { width: buf.width, height: buf.height, channels: 3 } })
      .png()
      .toFile(outputPath);
    return { success: true, path: outputPath, size: `${buf.width}x${buf.height}` };
  }

  if (options.mode === "full") {
    const filename = options.filename || `screenshot_full_${Date.now()}.png`;
    const outputPath = join(screenshotDir, filename);

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
      return { error: "Screenshot failed", details: windowsInfo };
    }

    const result = await p.captureWindow(session.hwnd, outputPath);
    if (result) {
      return { success: true, path: outputPath, windows_count: 1 };
    }
    return { error: "Screenshot failed" };
  }

  // Default: normal screenshot
  const filename = options.filename || `screenshot_${Date.now()}.png`;
  const outputPath = join(screenshotDir, filename);
  const result = await p.captureWindow(session.hwnd, outputPath);

  if (result) {
    return { success: true, path: outputPath };
  }
  return { error: "Screenshot failed" };
}

async function handleToolbar(placePath) {
  const sm = await getStudioManager();
  const p = await getPlatform();
  const [ok, msg, session] = await sm.getSession(placePath);
  if (!ok) return { error: msg };

  const capture = await p.captureWindowToBuffer(session.hwnd);
  if (!capture) return { error: "Failed to capture window" };

  // Toolbar is at the top — crop to reduce image processing cost
  const TOOLBAR_MAX_HEIGHT = 300;
  const cropH = Math.min(capture.height, TOOLBAR_MAX_HEIGHT);
  const toolbarCapture = cropH < capture.height
    ? { data: capture.data.subarray(0, capture.width * 3 * cropH), width: capture.width, height: cropH }
    : capture;

  const state = await detectToolbarState(toolbarCapture);
  if (!state) return { error: "Failed to detect toolbar state" };

  return {
    play: state.play,
    pause: state.pause,
    stop: state.stop,
    game_state: state.gameState,
  };
}

async function handleSave(placePath) {
  const sm = await getStudioManager();
  const p = await getPlatform();
  const [ok, msg, session] = await sm.getSession(placePath);
  if (!ok) return { success: false, error: msg };

  const ok2 = p.sendKeyComboToWindow(session.hwnd, [p.VK_CONTROL, p.VK_S]);
  return { success: ok2, message: ok2 ? "Sent Ctrl+S (save place)" : "Failed to send key" };
}

async function handleRecord(placePath, options = {}) {
  const sm = await getStudioManager();
  const [ok, msg, session] = await sm.getSession(placePath);
  if (!ok) return { error: msg };

  return recordViewport({
    windowId: session.hwnd,
    pid: session.pid,
    placePath,
    duration: options.duration || 3,
    fps: options.fps || 3,
  });
}

// ============ MCP Server setup ============

const server = new McpServer({
  name: "roblox-studio",
  version: "0.6.2",
});

server.tool(
  "list_studios",
  "List all running Roblox Studio instances with their PIDs, window handles, and place info",
  {},
  async () => {
    try {
      const result = await handleList();
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    } catch (e) {
      return { content: [{ type: "text", text: JSON.stringify({ error: e.message }) }], isError: true };
    }
  },
);

server.tool(
  "open_place",
  "Open Roblox Studio and load a .rbxl place file. Waits up to 30s for the Studio window to appear.",
  { place_path: z.string().describe("Absolute path to the .rbxl place file") },
  async ({ place_path }) => {
    try {
      const result = await handleOpen(place_path);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    } catch (e) {
      return { content: [{ type: "text", text: JSON.stringify({ error: e.message }) }], isError: true };
    }
  },
);

server.tool(
  "activate_window",
  "Activate (bring to front) the Roblox Studio window for a specific place file",
  { place_path: z.string().describe("Absolute path to the .rbxl place file") },
  async ({ place_path }) => {
    try {
      const result = await handleActivate(place_path);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    } catch (e) {
      return { content: [{ type: "text", text: JSON.stringify({ error: e.message }) }], isError: true };
    }
  },
);

server.tool(
  "hide_window",
  "Hide the Roblox Studio window for a specific place file",
  { place_path: z.string().describe("Absolute path to the .rbxl place file") },
  async ({ place_path }) => {
    try {
      const result = await handleHide(place_path);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    } catch (e) {
      return { content: [{ type: "text", text: JSON.stringify({ error: e.message }) }], isError: true };
    }
  },
);

server.tool(
  "close_place",
  "Close the Roblox Studio instance for a specific place file (force kill)",
  { place_path: z.string().describe("Absolute path to the .rbxl place file") },
  async ({ place_path }) => {
    try {
      const result = await handleClose(place_path);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    } catch (e) {
      return { content: [{ type: "text", text: JSON.stringify({ error: e.message }) }], isError: true };
    }
  },
);

server.tool(
  "get_status",
  "Get comprehensive status of a Studio instance: process info, window handle, modal dialogs, log path and last line number",
  { place_path: z.string().describe("Absolute path to the .rbxl place file") },
  async ({ place_path }) => {
    try {
      const result = await handleStatus(place_path);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    } catch (e) {
      return { content: [{ type: "text", text: JSON.stringify({ error: e.message }) }], isError: true };
    }
  },
);

server.tool(
  "manage_modals",
  "Detect or close modal dialogs (popups) in a Studio instance. Use close=true to dismiss all modals.",
  {
    place_path: z.string().describe("Absolute path to the .rbxl place file"),
    close: z.boolean().optional().default(false).describe("If true, close all modal dialogs instead of just listing them"),
  },
  async ({ place_path, close }) => {
    try {
      const result = await handleModal(place_path, close);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    } catch (e) {
      return { content: [{ type: "text", text: JSON.stringify({ error: e.message }) }], isError: true };
    }
  },
);

server.tool(
  "game_control",
  "Control game execution in Roblox Studio: start (F5), stop (Shift+F5), or pause/resume (F12)",
  {
    place_path: z.string().describe("Absolute path to the .rbxl place file"),
    action: z.enum(["start", "stop", "pause"]).describe("Game control action: start, stop, or pause"),
  },
  async ({ place_path, action }) => {
    try {
      const result = await handleGame(place_path, action);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    } catch (e) {
      return { content: [{ type: "text", text: JSON.stringify({ error: e.message }) }], isError: true };
    }
  },
);

server.tool(
  "get_logs",
  "Get filtered logs from a Studio instance. Returns user script output (FLog::Output, Warning, Error) with play/edit context labels. Use after_line for incremental reading.",
  {
    place_path: z.string().describe("Absolute path to the .rbxl place file"),
    after_line: z.number().optional().describe("Only return logs after this line number (for incremental reading)"),
    before_line: z.number().optional().describe("Only return logs before this line number"),
    start_date: z.string().optional().describe("Start date filter (YYYY-MM-DD or YYYY-MM-DD HH:MM:SS)"),
    end_date: z.string().optional().describe("End date filter (YYYY-MM-DD or YYYY-MM-DD HH:MM:SS)"),
    timestamps: z.boolean().optional().default(false).describe("Include timestamps in log output"),
    context: z.enum(["play", "edit"]).optional().describe("Filter by run context: play (game running) or edit (edit mode)"),
    errors: z.boolean().optional().default(false).describe("If true, detect and return only errors instead of all logs"),
    max_errors: z.number().optional().describe("Maximum number of errors to return (default 100, only with errors=true)"),
  },
  async ({ place_path, ...options }) => {
    try {
      const result = await handleLog(place_path, options);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    } catch (e) {
      return { content: [{ type: "text", text: JSON.stringify({ error: e.message }) }], isError: true };
    }
  },
);

server.tool(
  "screenshot",
  "Capture a screenshot of the Roblox Studio window. Saves to a temp directory and returns the file path.",
  {
    place_path: z.string().describe("Absolute path to the .rbxl place file"),
    mode: z.enum(["normal", "full", "viewport"]).optional().default("viewport").describe("Screenshot mode: normal (main window), full (with modal dialogs), viewport (game viewport only, macOS)"),
    filename: z.string().optional().describe("Custom filename for the screenshot (default: auto-generated with timestamp)"),
  },
  async ({ place_path, mode, filename }) => {
    try {
      const result = await handleScreenshot(place_path, { mode, filename });
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    } catch (e) {
      return { content: [{ type: "text", text: JSON.stringify({ error: e.message }) }], isError: true };
    }
  },
);

server.tool(
  "detect_toolbar",
  "Detect the state of Roblox Studio toolbar buttons (Play/Pause/Stop) using template matching. Returns game_state: 'running' or 'stopped'.",
  { place_path: z.string().describe("Absolute path to the .rbxl place file") },
  async ({ place_path }) => {
    try {
      const result = await handleToolbar(place_path);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    } catch (e) {
      return { content: [{ type: "text", text: JSON.stringify({ error: e.message }) }], isError: true };
    }
  },
);

server.tool(
  "save_place",
  "Save the current place in Roblox Studio by sending Ctrl+S (Windows) / Cmd+S (macOS)",
  { place_path: z.string().describe("Absolute path to the .rbxl place file") },
  async ({ place_path }) => {
    try {
      const result = await handleSave(place_path);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    } catch (e) {
      return { content: [{ type: "text", text: JSON.stringify({ error: e.message }) }], isError: true };
    }
  },
);

server.tool(
  "record",
  "Record the game viewport over a duration, capturing frames and compositing them into a grid image for AI analysis. Returns the grid image path.",
  {
    place_path: z.string().describe("Absolute path to the .rbxl place file"),
    duration: z.number().optional().default(3).describe("Recording duration in seconds (default: 3)"),
    fps: z.number().optional().default(3).describe("Frames per second (default: 3)"),
  },
  async ({ place_path, duration, fps }) => {
    try {
      const result = await handleRecord(place_path, { duration, fps });
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    } catch (e) {
      return { content: [{ type: "text", text: JSON.stringify({ error: e.message }) }], isError: true };
    }
  },
);

// Start server
const transport = new StdioServerTransport();
await server.connect(transport);
