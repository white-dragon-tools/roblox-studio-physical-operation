import { readFileSync, existsSync, readdirSync, unlinkSync, statSync } from "node:fs";
import { join, basename } from "node:path";
import os from "node:os";
import { shouldExclude } from "./log-filter.mjs";

const LOG_DIR =
  process.platform === "win32"
    ? join(process.env.LOCALAPPDATA || "", "Roblox", "logs")
    : process.platform === "darwin"
      ? join(os.homedir(), "Library", "Logs", "Roblox")
      : join(os.homedir(), ".local", "share", "Roblox", "logs");

export { LOG_DIR };

const DEFAULT_CATEGORIES = ["FLog::Output", "FLog::Warning", "FLog::Error"];
const ERROR_CATEGORIES = ["FLog::Warning", "FLog::Error", "DFLog::HttpTraceError"];

const LOG_LINE_RE =
  /^(\d{4}-\d{2}-\d{2}T[\d:.]+Z),[\d.]+,[a-f0-9]+,\d+(?:,(\w+))?\s*\[([^\]]+)\]\s*(.*)$/;

export function parseLogLine(line, lineNum = 0) {
  const m = LOG_LINE_RE.exec(line);
  if (!m) return null;
  return {
    timestamp: m[1],
    level: m[2] || "Info",
    category: m[3],
    message: m[4],
    raw: line,
    lineNum,
    runContext: "unknown",
  };
}

export function parseTimestamp(str) {
  if (!str) return null;
  const formats = [
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})\.(\d+)Z$/,
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})Z$/,
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})$/,
    /^(\d{4})-(\d{2})-(\d{2})$/,
  ];
  for (const re of formats) {
    const m = re.exec(str);
    if (m) {
      const [, y, mo, d, h = "0", mi = "0", s = "0", ms = "0"] = m;
      return new Date(
        Date.UTC(+y, +mo - 1, +d, +h, +mi, +s, +ms.slice(0, 3).padEnd(3, "0")),
      );
    }
  }
  return null;
}

export function isTimestampInRange(timestamp, startDate = null, endDate = null) {
  if (!startDate && !endDate) return true;
  const ts = parseTimestamp(timestamp);
  if (!ts) return false;

  if (startDate) {
    const start = parseTimestamp(startDate);
    if (start && ts < start) return false;
  }
  if (endDate) {
    let end = parseTimestamp(endDate);
    if (end) {
      if (endDate.length === 10) {
        end = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate(), 23, 59, 59, 999));
      }
      if (ts > end) return false;
    }
  }
  return true;
}

export function isErrorLog(entry) {
  if (ERROR_CATEGORIES.includes(entry.category)) return true;
  const lvl = entry.level.toLowerCase();
  if (lvl === "warning" || lvl === "error") return true;
  return false;
}

const STATE_RE = /Setting StudioGameStateType to StudioGameStateType_(\w+)/;

export function buildGameStateIndex(logPath) {
  if (!existsSync(logPath)) return [];
  const ranges = [];
  let currentState = "Edit";
  let currentStartLine = 1;
  let currentStartTime = "";

  const content = readFileSync(logPath, { encoding: "utf-8" });
  const lines = content.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const lineNum = i + 1;
    const line = lines[i];
    if (!line.includes("AssetDataModelManager")) continue;

    const m = STATE_RE.exec(line);
    if (m) {
      const newState = m[1];
      const entry = parseLogLine(line.trim(), lineNum);
      const timestamp = entry ? entry.timestamp : "";

      if (currentStartLine > 0) {
        ranges.push({
          state: currentState,
          startLine: currentStartLine,
          endLine: lineNum - 1,
          startTime: currentStartTime,
          endTime: timestamp,
        });
      }
      currentState = newState;
      currentStartLine = lineNum;
      currentStartTime = timestamp;
    }
  }

  if (currentStartLine > 0) {
    ranges.push({
      state: currentState,
      startLine: currentStartLine,
      endLine: -1,
      startTime: currentStartTime,
      endTime: "",
    });
  }
  return ranges;
}

export function getRunContextForLine(lineNum, stateRanges) {
  for (const r of stateRanges) {
    if (r.startLine <= lineNum && (r.endLine === -1 || lineNum <= r.endLine)) {
      const state = r.state.toLowerCase();
      if (state.includes("server") || state.includes("client")) return "play";
      if (state.includes("edit")) return "edit";
    }
  }
  return "unknown";
}

export function getLogsFromLine(
  logPath,
  {
    afterLine = null,
    beforeLine = null,
    startDate = null,
    endDate = null,
    timestamps = false,
    categories = null,
    applyFilter = true,
    runContext = null,
    includeContext = false,
  } = {},
) {
  const MAX_BYTES = 32000;
  const empty = { logs: "", startLine: 0, lastLine: 0, remaining: 0, hasMore: false };
  if (!existsSync(logPath)) return empty;

  const cats = categories || DEFAULT_CATEGORIES;
  let stateRanges = [];
  if (runContext || includeContext) {
    stateRanges = buildGameStateIndex(logPath);
  }

  let startLine = null;
  let lastLine = 0;
  let currentBytes = 0;
  const logLines = [];
  let remaining = 0;
  let bytesExceeded = false;

  const content = readFileSync(logPath, { encoding: "utf-8" });
  const lines = content.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const lineNum = i + 1;
    if (afterLine !== null && lineNum <= afterLine) continue;
    if (beforeLine !== null && lineNum >= beforeLine) break;

    const line = lines[i].trim();
    if (!line) continue;

    const entry = parseLogLine(line, lineNum);
    if (!entry) continue;
    if (cats.length > 0 && !cats.includes(entry.category)) continue;
    if (applyFilter && shouldExclude(entry.message)) continue;
    if (startDate || endDate) {
      if (!isTimestampInRange(entry.timestamp, startDate, endDate)) continue;
    }

    if (runContext || includeContext) {
      const ctx = getRunContextForLine(lineNum, stateRanges);
      entry.runContext = ctx;
      if (runContext && ctx !== runContext) continue;
    }

    remaining++;
    if (bytesExceeded) continue;

    const parts = [];
    if (includeContext) {
      const labels = { play: "[P]", edit: "[E]", unknown: "[?]" };
      parts.push(labels[entry.runContext] || "[?]");
    }
    if (timestamps) {
      parts.push(`[${entry.timestamp.slice(11, 19)}]`);
    }
    parts.push(entry.message);
    const outputLine = parts.join(" ");
    const lineBytes = Buffer.byteLength(outputLine, "utf-8") + 1;

    if (currentBytes + lineBytes > MAX_BYTES && logLines.length > 0) {
      bytesExceeded = true;
      continue;
    }

    if (startLine === null) startLine = lineNum;
    logLines.push(outputLine);
    lastLine = lineNum;
    currentBytes += lineBytes;
  }

  const returnedCount = logLines.length;
  return {
    logs: logLines.join("\n"),
    startLine: startLine || 0,
    lastLine,
    remaining: remaining - returnedCount,
    hasMore: remaining > returnedCount,
  };
}

export function searchLogsFromLine(
  logPath,
  pattern,
  {
    afterLine = null,
    beforeLine = null,
    startDate = null,
    endDate = null,
    timestamps = false,
    categories = null,
    applyFilter = true,
    runContext = null,
    includeContext = false,
  } = {},
) {
  const MAX_BYTES = 32000;
  const empty = { logs: "", startLine: 0, lastLine: 0, matchCount: 0, remaining: 0, hasMore: false };
  if (!existsSync(logPath)) return empty;

  const cats = categories || DEFAULT_CATEGORIES;
  let regex;
  try {
    regex = new RegExp(pattern, "i");
  } catch {
    return { error: `Invalid regex pattern: ${pattern}` };
  }

  let stateRanges = [];
  if (runContext || includeContext) {
    stateRanges = buildGameStateIndex(logPath);
  }

  let startLine = null;
  let lastLine = 0;
  let currentBytes = 0;
  const logLines = [];
  let matchCount = 0;
  let bytesExceeded = false;

  const content = readFileSync(logPath, { encoding: "utf-8" });
  const lines = content.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const lineNum = i + 1;
    if (afterLine !== null && lineNum <= afterLine) continue;
    if (beforeLine !== null && lineNum >= beforeLine) break;

    const line = lines[i].trim();
    if (!line) continue;

    const entry = parseLogLine(line, lineNum);
    if (!entry) continue;
    if (cats.length > 0 && !cats.includes(entry.category)) continue;
    if (applyFilter && shouldExclude(entry.message)) continue;
    if (startDate || endDate) {
      if (!isTimestampInRange(entry.timestamp, startDate, endDate)) continue;
    }
    if (runContext || includeContext) {
      const ctx = getRunContextForLine(lineNum, stateRanges);
      entry.runContext = ctx;
      if (runContext && ctx !== runContext) continue;
    }
    if (!regex.test(entry.message)) continue;

    matchCount++;
    if (bytesExceeded) continue;

    const parts = [`${lineNum}|`];
    if (includeContext) {
      const labels = { play: "[P]", edit: "[E]", unknown: "[?]" };
      parts.push(labels[entry.runContext] || "[?]");
    }
    if (timestamps) {
      parts.push(`[${entry.timestamp.slice(11, 19)}]`);
    }
    parts.push(entry.message);
    const outputLine = parts.join(" ");
    const lineBytes = Buffer.byteLength(outputLine, "utf-8") + 1;

    if (currentBytes + lineBytes > MAX_BYTES && logLines.length > 0) {
      bytesExceeded = true;
      continue;
    }

    if (startLine === null) startLine = lineNum;
    logLines.push(outputLine);
    lastLine = lineNum;
    currentBytes += lineBytes;
  }

  const returnedCount = logLines.length;
  return {
    logs: logLines.join("\n"),
    startLine: startLine || 0,
    lastLine,
    matchCount: returnedCount,
    remaining: matchCount - returnedCount,
    hasMore: matchCount > returnedCount,
  };
}

export function findErrors(
  logPath,
  {
    afterLine = null,
    beforeLine = null,
    startDate = null,
    endDate = null,
    runContext = null,
    maxErrors = 100,
  } = {},
) {
  const empty = { hasError: false, errorCount: 0, errors: [] };
  if (!existsSync(logPath)) return empty;

  const stateRanges = runContext ? buildGameStateIndex(logPath) : [];
  const errors = [];
  let totalErrors = 0;

  const content = readFileSync(logPath, { encoding: "utf-8" });
  const lines = content.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const lineNum = i + 1;
    if (afterLine !== null && lineNum <= afterLine) continue;
    if (beforeLine !== null && lineNum >= beforeLine) break;

    const line = lines[i].trim();
    if (!line) continue;

    const entry = parseLogLine(line, lineNum);
    if (!entry) continue;
    if (!isErrorLog(entry)) continue;
    if (shouldExclude(entry.message)) continue;
    if (startDate || endDate) {
      if (!isTimestampInRange(entry.timestamp, startDate, endDate)) continue;
    }

    let ctx = "unknown";
    if (stateRanges.length > 0) {
      ctx = getRunContextForLine(lineNum, stateRanges);
      if (runContext && ctx !== runContext) continue;
    }

    totalErrors++;
    if (errors.length < maxErrors) {
      errors.push({
        line: lineNum,
        timestamp: entry.timestamp,
        message: entry.message,
        category: entry.category,
        level: entry.level,
        context: ctx,
      });
    }
  }

  return { hasError: totalErrors > 0, errorCount: totalErrors, errors };
}

export function findLatestStudioLog() {
  if (!existsSync(LOG_DIR)) return null;
  const files = readdirSync(LOG_DIR)
    .filter((f) => f.includes("Studio") && f.endsWith(".log"))
    .map((f) => ({ name: f, mtime: statSync(join(LOG_DIR, f)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime);
  return files.length > 0 ? join(LOG_DIR, files[0].name) : null;
}

export function cleanOldLogs(days = 7) {
  if (!existsSync(LOG_DIR)) return 0;
  const threshold = days * 24 * 60 * 60 * 1000;
  const now = Date.now();
  let count = 0;
  for (const f of readdirSync(LOG_DIR)) {
    if (!f.endsWith(".log")) continue;
    const p = join(LOG_DIR, f);
    try {
      if (now - statSync(p).mtimeMs > threshold) {
        unlinkSync(p);
        count++;
      }
    } catch {}
  }
  return count;
}

export function getLogsByDate(
  logPath,
  {
    startDate = null,
    endDate = null,
    timestamps = true,
    categories = null,
    applyFilter = true,
    runContext = null,
    includeContext = false,
  } = {},
) {
  return getLogsFromLine(logPath, {
    afterLine: null,
    beforeLine: null,
    startDate,
    endDate,
    timestamps,
    categories,
    applyFilter,
    runContext,
    includeContext,
  });
}
