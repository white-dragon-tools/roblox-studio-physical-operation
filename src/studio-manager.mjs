import { execSync, spawn } from "node:child_process";
import { existsSync, readFileSync, writeFileSync, readdirSync, statSync, unlinkSync } from "node:fs";
import { join, basename, normalize } from "node:path";
import { LOG_DIR } from "./log-utils.mjs";

const LOG_INDEX_PATH = join(LOG_DIR, ".mcp_log_index.json");

// Lazy-loaded platform module
let _platform = null;
async function getPlatformModule() {
  if (_platform) return _platform;
  _platform = await import("./platform/index.mjs");
  return _platform;
}

function loadLogIndex() {
  if (!existsSync(LOG_INDEX_PATH)) return {};
  try {
    return JSON.parse(readFileSync(LOG_INDEX_PATH, "utf-8"));
  } catch {
    return {};
  }
}

function saveLogIndex(index) {
  try {
    writeFileSync(LOG_INDEX_PATH, JSON.stringify(index, null, 2), "utf-8");
  } catch {}
}

function getLogCommandLineRaw(logPath) {
  try {
    const content = readFileSync(logPath, { encoding: "utf-8" });
    const lines = content.split("\n");
    let foundCmd = false;
    for (let i = 0; i < Math.min(lines.length, 30); i++) {
      const line = lines[i].trim();
      if (line.includes("Command line:")) {
        foundCmd = true;
        continue;
      }
      if (foundCmd && line.includes("RobloxStudioBeta")) {
        return line;
      }
    }
  } catch {}
  return null;
}

export function getAllLogCmdlines(logFiles) {
  const index = loadLogIndex();
  const result = {};
  let updated = false;

  for (const logPath of logFiles) {
    const filename = basename(logPath);
    let mtime;
    try {
      mtime = statSync(logPath).mtimeMs;
    } catch {
      continue;
    }

    let cmdline;
    if (index[filename] && index[filename].mtime === mtime) {
      cmdline = index[filename].cmdline;
    } else {
      cmdline = getLogCommandLineRaw(logPath);
      index[filename] = { cmdline, mtime };
      updated = true;
    }
    if (cmdline) result[logPath] = cmdline;
  }

  if (updated) saveLogIndex(index);
  return result;
}

export function getAllStudioProcesses() {
  if (process.platform === "win32") {
    return getAllStudioProcessesWindows();
  }
  return getAllStudioProcessesMac();
}

function getAllStudioProcessesWindows() {
  try {
    // Use Get-Process (fast) instead of Win32_Process (slow/hangs)
    const result = execSync(
      'powershell -NoProfile -Command "Get-Process RobloxStudioBeta -ErrorAction SilentlyContinue | Select-Object Id | ConvertTo-Json"',
      { encoding: "utf-8", timeout: 5000 },
    );
    const data = JSON.parse(result.trim() || "[]");
    const arr = Array.isArray(data) ? data : [data];
    return arr.filter(p => p && p.Id).map(p => ({
      pid: p.Id,
      cmdline: "", // We'll match via log files instead
    }));
  } catch {
    return [];
  }
}

function getAllStudioProcessesMac() {
  try {
    const result = execSync("pgrep -f RobloxStudio", {
      encoding: "utf-8",
      timeout: 5000,
    });
    return result
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((s) => {
        const pid = parseInt(s, 10);
        let cmdline = "";
        try {
          cmdline = execSync(`ps -p ${pid} -o command=`, {
            encoding: "utf-8",
            timeout: 5000,
          }).trim();
        } catch {}
        return { pid, cmdline };
      });
  } catch {
    return [];
  }
}

export function findLatestStudioLogs(limit = 10) {
  if (!existsSync(LOG_DIR)) return [];
  const pattern = process.platform === "win32" ? "_Studio_" : "Studio";
  try {
    const files = readdirSync(LOG_DIR)
      .filter((f) => f.includes(pattern) && f.endsWith(".log"))
      .map((f) => {
        const p = join(LOG_DIR, f);
        return { path: p, mtime: statSync(p).mtimeMs };
      })
      .sort((a, b) => b.mtime - a.mtime);
    return files.slice(0, limit).map((f) => f.path);
  } catch {
    return [];
  }
}

export async function findSessionByPlacePath(placePath) {
  const sep = process.platform === "win32" ? "\\" : "/";
  const normalized = normalize(placePath).toLowerCase();
  const processes = getAllStudioProcesses();
  const logFiles = findLatestStudioLogs(20);
  const logCmdlines = getAllLogCmdlines(logFiles);

  const p = await getPlatformModule();

  // Match log file cmdline to place path, then find running process with window
  for (const [logPath, cmdline] of Object.entries(logCmdlines)) {
    const cmdNorm = cmdline.replace(/[\\/]/g, sep).toLowerCase();
    if (!cmdNorm.includes(normalized.replace(/[\\/]/g, sep))) continue;

    // Found a log file for this place, now find a running process with a window
    for (const proc of processes) {
      const hwnd = p.findWindowByPid(proc.pid);
      if (hwnd) {
        return { placePath, logPath, hwnd, pid: proc.pid };
      }
    }
  }
  return null;
}

export async function findSessionByPlaceId(placeId) {
  const pattern = `-placeId ${placeId}`;
  const processes = getAllStudioProcesses();
  const logFiles = findLatestStudioLogs(20);
  const logCmdlines = getAllLogCmdlines(logFiles);

  const p = await getPlatformModule();

  for (const [logPath, cmdline] of Object.entries(logCmdlines)) {
    if (!cmdline.includes(pattern)) continue;
    // Found a log file for this place ID, now find a running process with a window
    for (const proc of processes) {
      const hwnd = p.findWindowByPid(proc.pid);
      if (hwnd) {
        return { placePath: `cloud:${placeId}`, logPath, hwnd, pid: proc.pid };
      }
    }
  }
  return null;
}

export async function getSession(placePath = null, placeId = null) {
  if (!placePath && !placeId) return [false, "Must specify placePath or placeId", null];
  if (placePath && placeId) return [false, "Cannot specify both placePath and placeId", null];

  if (placePath) {
    const session = await findSessionByPlacePath(placePath);
    if (session) return [true, "Found local Place session", session];
    return [false, "Place not opened", null];
  }
  const session = await findSessionByPlaceId(placeId);
  if (session) return [true, "Found cloud Place session", session];
  return [false, `Place ID ${placeId} session not found`, null];
}

export async function openPlace(placePath, options = {}) {
  const { injectLocalPath: shouldInject = false } = options;

  if (!existsSync(placePath)) return [false, `Place file not found: ${placePath}`];

  const existing = await findSessionByPlacePath(placePath);
  if (existing) return [false, `Place already opened (PID: ${existing.pid})`];

  const p = await getPlatformModule();
  const studioPath = p.getStudioPath();
  if (!studioPath) return [false, "Cannot find Roblox Studio path"];
  if (!existsSync(studioPath)) return [false, `Roblox Studio not found: ${studioPath}`];

  // 如果需要注入 LocalPlacePath，创建临时文件
  let actualPath = placePath;
  if (shouldInject) {
    try {
      const { injectLocalPath } = await import("./lune-manager.mjs");
      actualPath = await injectLocalPath(placePath);
    } catch (e) {
      return [false, `Failed to inject LocalPlacePath: ${e.message}`];
    }
  }

  try {
    let child;
    if (process.platform === "darwin") {
      child = spawn("open", ["-a", studioPath, actualPath], { detached: true, stdio: "ignore" });
    } else {
      child = spawn(studioPath, [actualPath], { detached: true, stdio: "ignore" });
    }
    child.unref();
    const pid = child.pid;

    let hwnd = null;
    const start = Date.now();
    while (Date.now() - start < 30000) {
      hwnd = p.findWindowByPid(pid);
      if (hwnd) break;
      await new Promise((r) => setTimeout(r, 1000));
    }

    if (!hwnd) return [false, `Studio started (PID: ${pid}), but window not found`];
    
    const result = { pid, hwnd };
    if (shouldInject) {
      result.injectedPath = actualPath;
      result.originalPath = placePath;
    }
    return [true, `Studio started (PID: ${pid}, HWND: ${hwnd})`, result];
  } catch (e) {
    return [false, `Failed to start Studio: ${e.message}`];
  }
}

export async function closePlace(placePath = null, placeId = null) {
  const [ok, msg, session] = await getSession(placePath, placeId);
  if (!ok) return [false, msg];

  try {
    if (process.platform === "win32") {
      execSync(`powershell -NoProfile -Command "Stop-Process -Id ${session.pid} -Force"`, { timeout: 5000 });
    } else {
      execSync(`kill ${session.pid}`, { timeout: 5000 });
    }

    if (process.platform === "win32" && placePath && !placePath.startsWith("cloud:")) {
      const lockPath = placePath + ".lock";
      for (let i = 0; i < 3; i++) {
        await new Promise((r) => setTimeout(r, 200));
        if (existsSync(lockPath)) {
          try {
            unlinkSync(lockPath);
            break;
          } catch {}
        }
      }
    }

    return [true, `Studio closed (PID: ${session.pid})`];
  } catch (e) {
    return [false, `Failed to close Studio: ${e.message}`];
  }
}
