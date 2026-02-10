import { describe, it, expect, beforeAll } from "vitest";
import { writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  parseLogLine,
  parseTimestamp,
  isTimestampInRange,
  isErrorLog,
  buildGameStateIndex,
  getRunContextForLine,
  getLogsFromLine,
  searchLogsFromLine,
  findErrors,
} from "../src/log-utils.mjs";

// Sample log content for testing
const SAMPLE_LOG = [
  '2026-02-03T08:52:00.000Z,0.000,1000,1 [FLog::AssetDataModelManager] Setting StudioGameStateType to StudioGameStateType_Edit',
  '2026-02-03T08:52:01.000Z,1.000,1000,2 [FLog::Output] Info: internal stuff',
  '2026-02-03T08:52:02.095Z,2.095,1996c,3 [FLog::Output] Hello world',
  '2026-02-03T08:52:03.000Z,3.000,1000,4 [FLog::Output] Flag SomeFlag referenced from Lua',
  '2026-02-03T08:52:04.244Z,4.244,12f4,5,Warning [FLog::Output] Warning message from user',
  '2026-02-03T08:52:05.000Z,5.000,1000,6 [FLog::Warning] Some warning category log',
  '2026-02-03T08:52:06.000Z,6.000,1000,7 [FLog::AssetDataModelManager] Setting StudioGameStateType to StudioGameStateType_PlayServer',
  '2026-02-03T08:52:07.000Z,7.000,1000,8 [FLog::Output] [TEST] server print',
  '2026-02-03T08:52:08.000Z,8.000,1000,9 [FLog::Error] Runtime error in script',
  '2026-02-03T08:52:09.000Z,9.000,1000,10 [FLog::Output] [TEST] another server print',
  '2026-02-03T08:52:10.000Z,10.000,1000,11 [FLog::AssetDataModelManager] Setting StudioGameStateType to StudioGameStateType_PlayClient',
  '2026-02-03T08:52:11.000Z,11.000,1000,12 [FLog::Output] [TEST] client print',
  '2026-02-03T08:52:12.000Z,12.000,1000,13 [FLog::AssetDataModelManager] Setting StudioGameStateType to StudioGameStateType_Edit',
  '2026-02-03T08:52:13.000Z,13.000,1000,14 [FLog::Output] Back in edit mode',
].join("\n");

let tmpLogPath;

beforeAll(() => {
  const tmpDir = join(tmpdir(), "roblox-studio-tools-test");
  mkdirSync(tmpDir, { recursive: true });
  tmpLogPath = join(tmpDir, "test_studio.log");
  writeFileSync(tmpLogPath, SAMPLE_LOG, "utf-8");

  return () => {
    rmSync(tmpDir, { recursive: true, force: true });
  };
});

describe("parseLogLine", () => {
  it("parses standard format", () => {
    const entry = parseLogLine(
      "2026-02-03T08:52:02.095Z,128.095795,1996c,12 [FLog::Output] Hello world",
      100,
    );
    expect(entry).not.toBeNull();
    expect(entry.timestamp).toBe("2026-02-03T08:52:02.095Z");
    expect(entry.category).toBe("FLog::Output");
    expect(entry.message).toBe("Hello world");
    expect(entry.lineNum).toBe(100);
    expect(entry.level).toBe("Info");
  });

  it("parses format with level", () => {
    const entry = parseLogLine(
      "2026-02-03T08:52:04.244Z,130.244095,12f4,6,Warning [FLog::Output] Warning message",
      200,
    );
    expect(entry).not.toBeNull();
    expect(entry.level).toBe("Warning");
    expect(entry.message).toBe("Warning message");
  });

  it("returns null for invalid format", () => {
    expect(parseLogLine("Invalid log line")).toBeNull();
    expect(parseLogLine("")).toBeNull();
  });
});

describe("parseTimestamp", () => {
  it("parses ISO with milliseconds", () => {
    const ts = parseTimestamp("2026-02-03T08:52:02.095Z");
    expect(ts).not.toBeNull();
    expect(ts.getUTCFullYear()).toBe(2026);
    expect(ts.getUTCMonth()).toBe(1); // 0-indexed
    expect(ts.getUTCDate()).toBe(3);
  });

  it("parses ISO without milliseconds", () => {
    const ts = parseTimestamp("2026-02-03T08:52:02Z");
    expect(ts).not.toBeNull();
  });

  it("parses datetime without Z", () => {
    const ts = parseTimestamp("2026-02-03T08:52:02");
    expect(ts).not.toBeNull();
  });

  it("parses date only", () => {
    const ts = parseTimestamp("2026-02-03");
    expect(ts).not.toBeNull();
    expect(ts.getUTCHours()).toBe(0);
  });

  it("returns null for invalid", () => {
    expect(parseTimestamp("invalid")).toBeNull();
    expect(parseTimestamp(null)).toBeNull();
    expect(parseTimestamp("")).toBeNull();
  });
});

describe("isTimestampInRange", () => {
  const ts = "2026-02-03T12:30:00.000Z";

  it("returns true with no range", () => {
    expect(isTimestampInRange(ts)).toBe(true);
  });

  it("returns true when in range", () => {
    expect(isTimestampInRange(ts, "2026-02-03")).toBe(true);
    expect(isTimestampInRange(ts, null, "2026-02-03")).toBe(true);
    expect(isTimestampInRange(ts, "2026-02-01", "2026-02-05")).toBe(true);
  });

  it("returns false when out of range", () => {
    expect(isTimestampInRange(ts, "2026-02-04")).toBe(false);
    expect(isTimestampInRange(ts, null, "2026-02-02")).toBe(false);
  });

  it("handles precise time ranges", () => {
    expect(isTimestampInRange(ts, "2026-02-03T12:00:00", "2026-02-03T13:00:00")).toBe(true);
    expect(isTimestampInRange(ts, "2026-02-03T13:00:00")).toBe(false);
  });
});

describe("isErrorLog", () => {
  it("detects Warning level", () => {
    expect(isErrorLog({ level: "Warning", category: "FLog::Output" })).toBe(true);
  });

  it("detects Error level", () => {
    expect(isErrorLog({ level: "Error", category: "FLog::Output" })).toBe(true);
  });

  it("detects FLog::Warning category", () => {
    expect(isErrorLog({ level: "Info", category: "FLog::Warning" })).toBe(true);
  });

  it("detects FLog::Error category", () => {
    expect(isErrorLog({ level: "Info", category: "FLog::Error" })).toBe(true);
  });

  it("returns false for normal log", () => {
    expect(isErrorLog({ level: "Info", category: "FLog::Output" })).toBe(false);
  });
});

describe("buildGameStateIndex", () => {
  it("builds state ranges from log file", () => {
    const ranges = buildGameStateIndex(tmpLogPath);
    // Initial implicit Edit, then Edit(explicit), PlayServer, PlayClient, Edit
    expect(ranges.length).toBeGreaterThanOrEqual(4);
    const states = ranges.map((r) => r.state);
    expect(states).toContain("Edit");
    expect(states).toContain("PlayServer");
    expect(states).toContain("PlayClient");
  });

  it("returns empty for non-existent file", () => {
    expect(buildGameStateIndex("/nonexistent/file.log")).toEqual([]);
  });
});

describe("getRunContextForLine", () => {
  it("returns correct context", () => {
    const ranges = buildGameStateIndex(tmpLogPath);
    // Line 3 is in Edit range
    expect(getRunContextForLine(3, ranges)).toBe("edit");
    // Line 8 is in PlayServer range
    expect(getRunContextForLine(8, ranges)).toBe("play");
    // Line 12 is in PlayClient range
    expect(getRunContextForLine(12, ranges)).toBe("play");
    // Line 14 is in Edit range
    expect(getRunContextForLine(14, ranges)).toBe("edit");
  });
});

describe("getLogsFromLine", () => {
  it("returns filtered logs", () => {
    const result = getLogsFromLine(tmpLogPath);
    expect(result.logs).toContain("Hello world");
    // "Info: internal stuff" should be filtered by shouldExclude
    expect(result.logs).not.toContain("Info: internal stuff");
    // "Flag SomeFlag referenced from Lua" should be filtered
    expect(result.logs).not.toContain("Flag SomeFlag");
  });

  it("supports afterLine", () => {
    const result = getLogsFromLine(tmpLogPath, { afterLine: 10 });
    expect(result.logs).not.toContain("Hello world");
    expect(result.logs).toContain("client print");
  });

  it("supports date filtering", () => {
    const result = getLogsFromLine(tmpLogPath, {
      startDate: "2026-02-03T08:52:07",
      endDate: "2026-02-03T08:52:10",
    });
    expect(result.logs).toContain("[TEST] server print");
    expect(result.logs).not.toContain("Hello world");
  });

  it("supports context filtering", () => {
    const result = getLogsFromLine(tmpLogPath, { runContext: "play" });
    expect(result.logs).toContain("[TEST] server print");
    expect(result.logs).toContain("[TEST] client print");
    expect(result.logs).not.toContain("Hello world");
    expect(result.logs).not.toContain("Back in edit mode");
  });

  it("supports includeContext labels", () => {
    const result = getLogsFromLine(tmpLogPath, { includeContext: true });
    expect(result.logs).toContain("[P]");
    expect(result.logs).toContain("[E]");
  });

  it("supports timestamps", () => {
    const result = getLogsFromLine(tmpLogPath, { timestamps: true });
    expect(result.logs).toMatch(/\[\d{2}:\d{2}:\d{2}\]/);
  });

  it("returns empty for non-existent file", () => {
    const result = getLogsFromLine("/nonexistent.log");
    expect(result.logs).toBe("");
    expect(result.hasMore).toBe(false);
  });
});

describe("searchLogsFromLine", () => {
  it("searches by regex pattern", () => {
    const result = searchLogsFromLine(tmpLogPath, "\\[TEST\\]");
    expect(result.matchCount).toBeGreaterThan(0);
    expect(result.logs).toContain("[TEST]");
  });

  it("returns error for invalid regex", () => {
    const result = searchLogsFromLine(tmpLogPath, "[invalid");
    expect(result.error).toBeDefined();
  });
});

describe("findErrors", () => {
  it("finds error logs", () => {
    const result = findErrors(tmpLogPath);
    expect(result.hasError).toBe(true);
    expect(result.errorCount).toBeGreaterThan(0);
    // Should find the FLog::Error and FLog::Warning entries
    const categories = result.errors.map((e) => e.category);
    expect(categories).toContain("FLog::Error");
  });

  it("respects maxErrors", () => {
    const result = findErrors(tmpLogPath, { maxErrors: 1 });
    expect(result.errors.length).toBeLessThanOrEqual(1);
  });

  it("returns empty for non-existent file", () => {
    const result = findErrors("/nonexistent.log");
    expect(result.hasError).toBe(false);
    expect(result.errors).toEqual([]);
  });
});
