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

export function loadLogIndex() {
  if (!existsSync(LOG_INDEX_PATH)) return {};
  try {
    return JSON.parse(readFileSync(LOG_INDEX_PATH, "utf-8"));
  } catch {
    return {};
  }
}

export function saveLogIndex(index) {
  try {
    writeFileSync(LOG_INDEX_PATH, JSON.stringify(index, null, 2), "utf-8");
  } catch {}
}

// pid → placePath 持久化映射
function getPidPlaceMap() {
  const index = loadLogIndex();
  return index._pidPlaceMap || {};
}

function setPidPlace(pid, placePath) {
  const index = loadLogIndex();
  if (!index._pidPlaceMap) index._pidPlaceMap = {};
  index._pidPlaceMap[pid] = placePath;
  saveLogIndex(index);
}

function removePidPlace(pid) {
  const index = loadLogIndex();
  if (index._pidPlaceMap) {
    delete index._pidPlaceMap[pid];
    saveLogIndex(index);
  }
}

export function getLogCommandLineRaw(logPath) {
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
      if (foundCmd && (line.includes("RobloxStudioBeta") || line.includes("RobloxStudio"))) {
        return line;
      }
    }
  } catch {}
  return null;
}

export function getLogPlacePathRaw(logPath) {
  try {
    const content = readFileSync(logPath, { encoding: "utf-8" });
    const lines = content.split("\n");
    for (let i = 0; i < Math.min(lines.length, 200); i++) {
      const match = lines[i].match(/\[FLog::FileOpenEventHandler\] Trying to open local file (.+)/);
      if (match) return match[1].trim();
    }
  } catch {}
  return null;
}

function getLogPlacePath(logPath) {
  const index = loadLogIndex();
  const filename = basename(logPath);
  let mtime;
  try {
    mtime = statSync(logPath).mtimeMs;
  } catch {
    return null;
  }
  if (index[filename] && index[filename].mtime === mtime && index[filename].placePath !== undefined) {
    return index[filename].placePath;
  }
  const placePath = getLogPlacePathRaw(logPath);
  if (!index[filename]) index[filename] = {};
  index[filename].mtime = mtime;
  index[filename].placePath = placePath;
  saveLogIndex(index);
  return placePath;
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

// 统一的实例列表函数，跨平台解析 PID → place_path
export async function listInstances() {
  const p = await getPlatformModule();
  const processes = getAllStudioProcesses();
  const logFiles = findLatestStudioLogs(20);
  const instances = [];

  if (process.platform === "darwin") {
    const pidLogMap = buildPidLogMapMac(processes);
    const pidPlaceMap = getPidPlaceMap();
    for (const proc of processes) {
      const hwnd = p.findWindowByPid(proc.pid);
      const logPath = pidLogMap[proc.pid];
      let placePath = pidPlaceMap[proc.pid] || null;
      let placeId = null;
      let type = "local";

      if (!placePath && logPath) {
        placePath = getLogPlacePath(logPath);
      }

      const cmdline = proc.cmdline || "";
      const placeIdMatch = cmdline.match(/-placeId\s+(\d+)/);
      if (placeIdMatch) {
        type = "cloud";
        placeId = parseInt(placeIdMatch[1], 10);
      }

      const entry = { pid: proc.pid, hwnd, type };
      if (type === "cloud") entry.place_id = placeId;
      else entry.place_path = placePath;
      instances.push(entry);
    }
  } else {
    // Windows: 通过日志命令行解析
    const logCmdlines = getAllLogCmdlines(logFiles);
    for (const proc of processes) {
      const hwnd = p.findWindowByPid(proc.pid);

      let cmdline = proc.cmdline || "";
      for (const [, logCmd] of Object.entries(logCmdlines)) {
        if (hwnd && !cmdline) {
          cmdline = logCmd;
          break;
        }
      }

      const placeIdMatch = cmdline.match(/-placeId\s+(\d+)/);
      if (placeIdMatch) {
        instances.push({ pid: proc.pid, hwnd, type: "cloud", place_id: parseInt(placeIdMatch[1], 10) });
      } else {
        const rbxlMatch = cmdline.match(/\.exe["\s]+(.+\.rbxl)/i);
        const placePath = rbxlMatch ? rbxlMatch[1].replace(/"/g, "") : null;
        instances.push({ pid: proc.pid, hwnd, type: "local", place_path: placePath });
      }
    }
  }

  return instances;
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
      })
      .filter(({ cmdline }) => !cmdline.includes("RobloxCrashHandler"));
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

// Mac: build PID -> log file mapping via CrashHandler cmdline, fallback to lsof
function buildPidLogMapMac(processes) {
  const pidLogMap = {};
  // 1) CrashHandler: --studioPid <pid> --attachment=..._last.log=<path>
  try {
    const result = execSync("ps -eo pid,command", { encoding: "utf-8", timeout: 5000 });
    for (const line of result.split("\n")) {
      if (!line.includes("RobloxCrashHandler")) continue;
      const pidMatch = line.match(/--studioPid\s+(\d+)/);
      const logMatch = line.match(/--attachment=attachment_[^=]+=([^\s]+_last\.log)/);
      if (pidMatch && logMatch) {
        pidLogMap[parseInt(pidMatch[1], 10)] = logMatch[1];
      }
    }
  } catch {}

  // 2) lsof fallback for PIDs not yet mapped
  const unmapped = processes.filter((proc) => !pidLogMap[proc.pid]);
  if (unmapped.length > 0) {
    try {
      const pids = unmapped.map((proc) => proc.pid).join(",");
      const result = execSync(`lsof -p ${pids} 2>/dev/null`, { encoding: "utf-8", timeout: 5000 });
      for (const line of result.split("\n")) {
        if (!line.includes("_last.log")) continue;
        const parts = line.split(/\s+/);
        const pid = parseInt(parts[1], 10);
        const logPath = parts[parts.length - 1];
        if (pid && logPath && !pidLogMap[pid]) {
          pidLogMap[pid] = logPath;
        }
      }
    } catch {}
  }
  return pidLogMap;
}

export async function findSessionByPlacePath(placePath) {
  const sep = process.platform === "win32" ? "\\" : "/";
  const normalized = normalize(placePath).toLowerCase();
  const processes = getAllStudioProcesses();
  const logFiles = findLatestStudioLogs(20);
  const p = await getPlatformModule();

  if (process.platform === "darwin") {
    const pidLogMap = buildPidLogMapMac(processes);

    // 0) pid→placePath 映射（openPlace 时写入）
    const pidPlaceMap = getPidPlaceMap();
    for (const proc of processes) {
      const mapped = pidPlaceMap[proc.pid];
      if (mapped && normalize(mapped).toLowerCase() === normalized) {
        const hwnd = p.findWindowByPid(proc.pid);
        if (hwnd) {
          const logPath = pidLogMap[proc.pid] || null;
          return { placePath, logPath, hwnd, pid: proc.pid };
        }
      }
    }

    const lockFile = normalize(placePath + ".lock").toLowerCase();

    // 1) lsof 检查哪个进程持有 .rbxl.lock 文件
    for (const proc of processes) {
      try {
        const lsofResult = execSync(`lsof -p ${proc.pid} 2>/dev/null`, { encoding: "utf-8", timeout: 5000 });
        if (lsofResult.toLowerCase().includes(lockFile)) {
          const hwnd = p.findWindowByPid(proc.pid);
          if (hwnd) {
            const logPath = pidLogMap[proc.pid] || null;
            return { placePath, logPath, hwnd, pid: proc.pid };
          }
        }
      } catch {}
    }

    // 2) fallback: 日志中的 FileOpenEventHandler
    for (const proc of processes) {
      const logPath = pidLogMap[proc.pid];
      if (!logPath) continue;
      const logPlace = getLogPlacePath(logPath);
      if (!logPlace) continue;
      if (normalize(logPlace).toLowerCase() !== normalized) continue;
      const hwnd = p.findWindowByPid(proc.pid);
      if (hwnd) {
        return { placePath, logPath, hwnd, pid: proc.pid };
      }
    }
    return null;
  }

  // Windows: match via log cmdline
  const logCmdlines = getAllLogCmdlines(logFiles);
  for (const [logPath, cmdline] of Object.entries(logCmdlines)) {
    const cmdNorm = cmdline.replace(/[\\/]/g, sep).toLowerCase();
    if (!cmdNorm.includes(normalized.replace(/[\\/]/g, sep))) continue;

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

export async function openPlace(placePath) {
  if (!existsSync(placePath)) return [false, `Place file not found: ${placePath}`];

  const existing = await findSessionByPlacePath(placePath);
  if (existing) return [false, `Place already opened (PID: ${existing.pid})`];

  const p = await getPlatformModule();
  const studioPath = p.getStudioPath();
  if (!studioPath) return [false, "Cannot find Roblox Studio path"];
  if (!existsSync(studioPath)) return [false, `Roblox Studio not found: ${studioPath}`];

  try {
    let child;
    if (process.platform === "darwin") {
      child = spawn("open", ["-g", "-a", studioPath, placePath], { detached: true, stdio: "ignore" });
    } else {
      child = spawn(studioPath, [placePath], { detached: true, stdio: "ignore" });
    }
    child.unref();

    // Mac: `open -a` PID != Studio PID, poll findSessionByPlacePath instead
    const start = Date.now();
    while (Date.now() - start < 30000) {
      const session = await findSessionByPlacePath(placePath);
      if (session) {
        setPidPlace(session.pid, placePath);
        return [true, `Studio started (PID: ${session.pid}, HWND: ${session.hwnd})`];
      }
      await new Promise((r) => setTimeout(r, 2000));
    }
    return [false, "Studio started, but session not found within timeout"];
  } catch (e) {
    return [false, `Failed to start Studio: ${e.message}`];
  }
}

export async function closePlace(placePath = null, placeId = null) {
  const [ok, msg, session] = await getSession(placePath, placeId);
  if (!ok) return [false, msg];

  try {
    const p = await getPlatformModule();
    const killed = p.closeStudio(session.pid);
    if (!killed) return [false, `Failed to close Studio (PID: ${session.pid}), process may still be running`];

    removePidPlace(session.pid);

    if (placePath && !placePath.startsWith("cloud:")) {
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
