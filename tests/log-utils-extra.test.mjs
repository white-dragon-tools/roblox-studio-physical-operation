import { describe, it, expect, beforeAll } from "vitest";
import { writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  getLogsFromLine,
  searchLogsFromLine,
  findErrors,
  getLogsByDate,
} from "../src/log-utils.mjs";

// Larger sample log for testing truncation and edge cases
const LINES = [];
for (let i = 0; i < 100; i++) {
  const ts = `2026-02-03T08:${String(Math.floor(i / 60)).padStart(2, "0")}:${String(i % 60).padStart(2, "0")}.000Z`;
  LINES.push(`${ts},${i}.000,1000,${i + 1} [FLog::Output] Message line ${i + 1}`);
}
// Add a play state transition in the middle
LINES[30] = '2026-02-03T08:00:30.000Z,30.000,1000,31 [FLog::AssetDataModelManager] Setting StudioGameStateType to StudioGameStateType_PlayServer';
// Add some error logs
LINES[40] = '2026-02-03T08:00:40.000Z,40.000,1000,41 [FLog::Error] Test error message';
LINES[41] = '2026-02-03T08:00:41.000Z,41.000,1000,42,Warning [FLog::Output] Test warning message';
// Back to edit
LINES[60] = '2026-02-03T08:01:00.000Z,60.000,1000,61 [FLog::AssetDataModelManager] Setting StudioGameStateType to StudioGameStateType_Edit';

const SAMPLE_LOG = LINES.join("\n");

let tmpLogPath;
let tmpDir;

beforeAll(() => {
  tmpDir = join(tmpdir(), "rspo-log-extra-test-" + Date.now());
  mkdirSync(tmpDir, { recursive: true });
  tmpLogPath = join(tmpDir, "test_studio.log");
  writeFileSync(tmpLogPath, SAMPLE_LOG, "utf-8");

  return () => {
    rmSync(tmpDir, { recursive: true, force: true });
  };
});

describe("getLogsFromLine - beforeLine option", () => {
  it("limits output to lines before given number", () => {
    const result = getLogsFromLine(tmpLogPath, { beforeLine: 10 });
    expect(result.lastLine).toBeLessThan(10);
    expect(result.logs).not.toContain("line 10");
  });
});

describe("getLogsFromLine - afterLine + beforeLine combined", () => {
  it("returns logs in the specified range", () => {
    const result = getLogsFromLine(tmpLogPath, { afterLine: 5, beforeLine: 15 });
    expect(result.startLine).toBeGreaterThan(5);
    expect(result.lastLine).toBeLessThan(15);
  });
});

describe("getLogsFromLine - MAX_BYTES truncation", () => {
  it("sets hasMore when logs exceed 32KB", () => {
    // Create a log with many long lines
    const bigLogPath = join(tmpDir, "big.log");
    const bigLines = [];
    for (let i = 0; i < 500; i++) {
      const ts = `2026-02-03T10:00:${String(i % 60).padStart(2, "0")}.000Z`;
      const longMsg = "A".repeat(200);
      bigLines.push(`${ts},${i}.000,1000,${i + 1} [FLog::Output] ${longMsg} line${i + 1}`);
    }
    writeFileSync(bigLogPath, bigLines.join("\n"), "utf-8");

    const result = getLogsFromLine(bigLogPath);
    expect(result.hasMore).toBe(true);
    expect(result.remaining).toBeGreaterThan(0);
  });
});

describe("getLogsFromLine - applyFilter option", () => {
  it("includes system logs when applyFilter is false", () => {
    const logPath = join(tmpDir, "nofilter.log");
    writeFileSync(logPath, [
      '2026-02-03T08:00:00.000Z,0.000,1000,1 [FLog::Output] Info: internal stuff',
      '2026-02-03T08:00:01.000Z,1.000,1000,2 [FLog::Output] Hello user',
    ].join("\n"), "utf-8");

    const filtered = getLogsFromLine(logPath, { applyFilter: true });
    expect(filtered.logs).not.toContain("Info:");

    const unfiltered = getLogsFromLine(logPath, { applyFilter: false });
    expect(unfiltered.logs).toContain("Info:");
  });
});

describe("getLogsFromLine - categories option", () => {
  it("filters by custom categories", () => {
    const logPath = join(tmpDir, "categories.log");
    writeFileSync(logPath, [
      '2026-02-03T08:00:00.000Z,0.000,1000,1 [FLog::Output] output msg',
      '2026-02-03T08:00:01.000Z,1.000,1000,2 [FLog::Warning] warn msg',
      '2026-02-03T08:00:02.000Z,2.000,1000,3 [FLog::Error] error msg',
    ].join("\n"), "utf-8");

    const result = getLogsFromLine(logPath, { categories: ["FLog::Error"] });
    expect(result.logs).toContain("error msg");
    expect(result.logs).not.toContain("output msg");
    expect(result.logs).not.toContain("warn msg");
  });
});

describe("searchLogsFromLine - additional cases", () => {
  it("returns empty for non-existent file", () => {
    const result = searchLogsFromLine("/nonexistent.log", "test");
    expect(result.matchCount).toBe(0);
    expect(result.logs).toBe("");
  });

  it("supports case-insensitive search", () => {
    const result = searchLogsFromLine(tmpLogPath, "MESSAGE LINE");
    expect(result.matchCount).toBeGreaterThan(0);
  });

  it("supports beforeLine", () => {
    const result = searchLogsFromLine(tmpLogPath, "Message line", { beforeLine: 5 });
    expect(result.matchCount).toBeLessThan(5);
  });

  it("supports afterLine", () => {
    const result = searchLogsFromLine(tmpLogPath, "Message line", { afterLine: 90 });
    // Only lines after 90 should match
    expect(result.matchCount).toBeLessThan(15);
  });

  it("includes line numbers in output", () => {
    const result = searchLogsFromLine(tmpLogPath, "Message line 1$");
    expect(result.logs).toMatch(/^\d+\|/);
  });

  it("supports timestamps option", () => {
    const result = searchLogsFromLine(tmpLogPath, "Message line 1$", { timestamps: true });
    expect(result.logs).toMatch(/\[\d{2}:\d{2}:\d{2}\]/);
  });

  it("supports includeContext option", () => {
    const result = searchLogsFromLine(tmpLogPath, "Message line 1$", { includeContext: true });
    expect(result.logs).toMatch(/\[E\]|\[P\]/);
  });

  it("supports runContext filter", () => {
    const result = searchLogsFromLine(tmpLogPath, "Message line", { runContext: "play" });
    // Should only match lines in PlayServer range
    expect(result.matchCount).toBeGreaterThan(0);
    expect(result.matchCount).toBeLessThan(100);
  });
});

describe("findErrors - additional cases", () => {
  it("supports runContext filter", () => {
    const result = findErrors(tmpLogPath, { runContext: "play" });
    // Error at line 41 is in play context
    expect(result.hasError).toBe(true);
    for (const err of result.errors) {
      expect(err.context).toBe("play");
    }
  });

  it("supports afterLine", () => {
    const result = findErrors(tmpLogPath, { afterLine: 50 });
    // Error at line 41 should be excluded
    for (const err of result.errors) {
      expect(err.line).toBeGreaterThan(50);
    }
  });

  it("supports beforeLine", () => {
    const result = findErrors(tmpLogPath, { beforeLine: 40 });
    // Error at line 41 should be excluded
    for (const err of result.errors) {
      expect(err.line).toBeLessThan(40);
    }
  });

  it("supports date range filter", () => {
    const result = findErrors(tmpLogPath, {
      startDate: "2026-02-03T08:00:40",
      endDate: "2026-02-03T08:00:41",
    });
    expect(result.hasError).toBe(true);
    expect(result.errorCount).toBeLessThanOrEqual(2);
  });
});

describe("getLogsByDate", () => {
  it("delegates to getLogsFromLine with date params", () => {
    const result = getLogsByDate(tmpLogPath, {
      startDate: "2026-02-03T08:00:00",
      endDate: "2026-02-03T08:00:10",
    });
    expect(result.logs).toBeDefined();
    // Should only have logs from first 10 seconds
    expect(result.logs).toContain("Message line");
  });

  it("supports timestamps option", () => {
    const result = getLogsByDate(tmpLogPath, {
      startDate: "2026-02-03T08:00:00",
      endDate: "2026-02-03T08:00:05",
      timestamps: true,
    });
    expect(result.logs).toMatch(/\[\d{2}:\d{2}:\d{2}\]/);
  });

  it("returns empty for non-existent file", () => {
    const result = getLogsByDate("/nonexistent.log");
    expect(result.logs).toBe("");
  });
});
