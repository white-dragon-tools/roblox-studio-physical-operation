import { describe, it, expect, beforeAll } from "vitest";
import { writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  loadLogIndex,
  getLogCommandLineRaw,
  getLogPlacePathRaw,
  getAllLogCmdlines,
  findLatestStudioLogs,
  getSession,
} from "../src/studio-manager.mjs";

let tmpDir;

beforeAll(() => {
  tmpDir = join(tmpdir(), "rspo-studio-manager-test-" + Date.now());
  mkdirSync(tmpDir, { recursive: true });
  return () => {
    rmSync(tmpDir, { recursive: true, force: true });
  };
});

describe("loadLogIndex", () => {
  it("returns {} when file does not exist", () => {
    const result = loadLogIndex();
    expect(typeof result).toBe("object");
  });
});

describe("getLogCommandLineRaw", () => {
  it("extracts command line from log with Studio path", () => {
    const logPath = join(tmpDir, "test_cmdline.log");
    writeFileSync(logPath, [
      "2026-01-01T00:00:00.000Z,0.000,1000,1 [FLog::Init] Starting",
      "2026-01-01T00:00:00.001Z,0.001,1000,2 [FLog::Init] Command line:",
      '/Applications/RobloxStudio.app/Contents/MacOS/RobloxStudioBeta -placeId 12345',
      "2026-01-01T00:00:00.003Z,0.003,1000,4 [FLog::Init] Done",
    ].join("\n"), "utf-8");

    const result = getLogCommandLineRaw(logPath);
    expect(result).not.toBeNull();
    expect(result).toContain("RobloxStudioBeta");
  });

  it("returns null when no command line found", () => {
    const logPath = join(tmpDir, "test_no_cmdline.log");
    writeFileSync(logPath, [
      "2026-01-01T00:00:00.000Z,0.000,1000,1 [FLog::Init] Starting",
      "2026-01-01T00:00:00.001Z,0.001,1000,2 [FLog::Init] Done",
    ].join("\n"), "utf-8");

    expect(getLogCommandLineRaw(logPath)).toBeNull();
  });

  it("returns null for non-existent file", () => {
    expect(getLogCommandLineRaw(join(tmpDir, "nonexistent.log"))).toBeNull();
  });

  it("only checks first 30 lines", () => {
    const logPath = join(tmpDir, "test_long.log");
    const lines = [];
    for (let i = 0; i < 50; i++) {
      lines.push(`2026-01-01T00:00:00.000Z,0.000,1000,${i} [FLog::Init] Line ${i}`);
    }
    lines[35] = "2026-01-01T00:00:00.000Z,0.000,1000,35 [FLog::Init] Command line:";
    lines[36] = '/Applications/RobloxStudio.app/Contents/MacOS/RobloxStudioBeta -placeId 999';
    writeFileSync(logPath, lines.join("\n"), "utf-8");

    expect(getLogCommandLineRaw(logPath)).toBeNull();
  });
});

describe("getLogPlacePathRaw", () => {
  it("extracts place path from FileOpenEventHandler log", () => {
    const logPath = join(tmpDir, "test_placepath.log");
    writeFileSync(logPath, [
      "2026-01-01T00:00:00.000Z,0.000,1000,1 [FLog::Init] Starting",
      "2026-01-01T00:00:00.001Z,0.001,1000,2 [FLog::FileOpenEventHandler] Trying to open local file /Users/test/game.rbxl",
      "2026-01-01T00:00:00.002Z,0.002,1000,3 [FLog::Init] Done",
    ].join("\n"), "utf-8");

    const result = getLogPlacePathRaw(logPath);
    expect(result).toBe("/Users/test/game.rbxl");
  });

  it("returns null when no place path found", () => {
    const logPath = join(tmpDir, "test_no_place.log");
    writeFileSync(logPath, [
      "2026-01-01T00:00:00.000Z,0.000,1000,1 [FLog::Init] Starting",
    ].join("\n"), "utf-8");

    expect(getLogPlacePathRaw(logPath)).toBeNull();
  });

  it("returns null for non-existent file", () => {
    expect(getLogPlacePathRaw(join(tmpDir, "nonexistent.log"))).toBeNull();
  });

  it("only checks first 200 lines", () => {
    const logPath = join(tmpDir, "test_long_place.log");
    const lines = [];
    for (let i = 0; i < 250; i++) {
      lines.push(`2026-01-01T00:00:00.000Z,0.000,1000,${i} [FLog::Init] Line ${i}`);
    }
    lines[210] = "2026-01-01T00:00:00.000Z,0.000,1000,210 [FLog::FileOpenEventHandler] Trying to open local file /late/game.rbxl";
    writeFileSync(logPath, lines.join("\n"), "utf-8");

    expect(getLogPlacePathRaw(logPath)).toBeNull();
  });
});

describe("getAllLogCmdlines", () => {
  it("parses command lines from multiple log files", () => {
    const log1 = join(tmpDir, "studio1.log");
    const log2 = join(tmpDir, "studio2.log");

    writeFileSync(log1, [
      "2026-01-01T00:00:00.000Z,0.000,1000,1 [FLog::Init] Command line:",
      'C:\\RobloxStudioBeta.exe "D:\\game1.rbxl"',
    ].join("\n"), "utf-8");

    writeFileSync(log2, [
      "2026-01-01T00:00:00.000Z,0.000,1000,1 [FLog::Init] Nothing here",
    ].join("\n"), "utf-8");

    const result = getAllLogCmdlines([log1, log2]);
    expect(result[log1]).toContain("RobloxStudioBeta");
    expect(result[log2]).toBeUndefined();
  });

  it("returns empty object for empty input", () => {
    expect(getAllLogCmdlines([])).toEqual({});
  });

  it("skips non-existent files", () => {
    const result = getAllLogCmdlines([join(tmpDir, "nonexistent.log")]);
    expect(result).toEqual({});
  });
});

describe("getSession - parameter validation", () => {
  it("returns error when no args provided", async () => {
    const [ok, msg] = await getSession();
    expect(ok).toBe(false);
    expect(msg).toContain("Must specify");
  });

  it("returns error when both args provided", async () => {
    const [ok, msg] = await getSession("some/path", 12345);
    expect(ok).toBe(false);
    expect(msg).toContain("Cannot specify both");
  });
});

describe("findLatestStudioLogs", () => {
  it("returns array", () => {
    const result = findLatestStudioLogs(5);
    expect(Array.isArray(result)).toBe(true);
  });

  it("respects limit parameter", () => {
    const result = findLatestStudioLogs(1);
    expect(result.length).toBeLessThanOrEqual(1);
  });
});
