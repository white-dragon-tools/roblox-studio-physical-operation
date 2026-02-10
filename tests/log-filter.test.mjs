import { describe, it, expect } from "vitest";
import { shouldExclude, filterLogs } from "../src/log-filter.mjs";

describe("shouldExclude", () => {
  it("excludes empty/whitespace messages", () => {
    expect(shouldExclude("")).toBe(true);
    expect(shouldExclude("   ")).toBe(true);
    expect(shouldExclude(null)).toBe(true);
    expect(shouldExclude(undefined)).toBe(true);
  });

  it("excludes messages with known prefixes", () => {
    expect(shouldExclude("Info: something")).toBe(true);
    expect(shouldExclude("RobloxGitHash: abc123")).toBe(true);
    expect(shouldExclude("Studio Version: 1.0")).toBe(true);
    expect(shouldExclude("Flag SomeFlag referenced")).toBe(true);
    expect(shouldExclude("Player Player1 joined")).toBe(true);
    expect(shouldExclude("Action SomeAction is not handled")).toBe(true);
    expect(shouldExclude("UpdateManager:: checking")).toBe(true);
    expect(shouldExclude("Warning: Failed to apply StyleRule")).toBe(true);
    expect(shouldExclude("已创建自动恢复文件")).toBe(true);
    expect(shouldExclude("Auto-recovery file created")).toBe(true);
  });

  it("excludes messages containing known substrings", () => {
    expect(shouldExclude("SomeFlag referenced from Lua")).toBe(true);
    expect(shouldExclude("Redundant Flag ID: xxx")).toBe(true);
    expect(shouldExclude("Asset (Image) xxx load failed")).toBe(true);
    expect(shouldExclude("Something load failed: reason")).toBe(true);
  });

  it("keeps user script output", () => {
    expect(shouldExclude("Hello world")).toBe(false);
    expect(shouldExclude("[TEST] print message")).toBe(false);
    expect(shouldExclude("Error: something went wrong")).toBe(false);
    expect(shouldExclude("Score: 100")).toBe(false);
  });
});

describe("filterLogs", () => {
  it("filters out system logs and keeps user output", () => {
    const messages = [
      "Hello world",
      "Info: internal stuff",
      "[TEST] user message",
      "Flag SomeFlag referenced from Lua isn't defined",
      "Score: 42",
      "",
    ];
    const result = filterLogs(messages);
    expect(result).toEqual(["Hello world", "[TEST] user message", "Score: 42"]);
  });

  it("returns empty array for all-system messages", () => {
    const messages = [
      "Info: a",
      "RobloxGitHash: b",
      "",
    ];
    expect(filterLogs(messages)).toEqual([]);
  });

  it("returns all messages when none are system", () => {
    const messages = ["Hello", "World"];
    expect(filterLogs(messages)).toEqual(["Hello", "World"]);
  });
});
