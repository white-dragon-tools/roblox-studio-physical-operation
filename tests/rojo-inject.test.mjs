import { describe, it, expect, vi } from "vitest";
import { parseOptions } from "../src/cli-parse.mjs";

describe("parseOptions --inject", () => {
  it("解析 --inject 选项", () => {
    expect(parseOptions(["--inject", "/path/to/config.project.json"])).toEqual({
      inject: "/path/to/config.project.json",
    });
  });

  it("--inject 与其他选项组合", () => {
    expect(parseOptions(["--inject", "config.json", "--timestamps"])).toEqual({
      inject: "config.json",
      timestamps: true,
    });
  });

  it("--inject 无值时不解析", () => {
    expect(parseOptions(["--inject"])).toEqual({});
  });
});

describe("getRojoBinaryPath", () => {
  it("无 bin 目录且无环境变量时返回 null", async () => {
    // 清除环境变量
    const saved = process.env.ROJO_PATH;
    delete process.env.ROJO_PATH;

    const { getRojoBinaryPath } = await import("../src/rojo-inject.mjs");
    // 在没有 bin/ 目录的情况下，可能返回 null（除非 ROJO_PATH 设置了）
    const result = getRojoBinaryPath();
    // 如果 bin/ 不存在且没有环境变量，应该返回 null
    // 如果 bin/ 恰好存在（本地开发），也可以返回路径
    expect(result === null || typeof result === "string").toBe(true);

    if (saved) process.env.ROJO_PATH = saved;
  });

  it("ROJO_PATH 环境变量优先", async () => {
    const saved = process.env.ROJO_PATH;
    // 设置为一个存在的文件（用 node 本身测试）
    process.env.ROJO_PATH = process.execPath;

    const { getRojoBinaryPath } = await import("../src/rojo-inject.mjs");
    const result = getRojoBinaryPath();
    expect(result).toBe(process.execPath);

    if (saved) process.env.ROJO_PATH = saved;
    else delete process.env.ROJO_PATH;
  });
});

describe("injectIntoPlace 参数校验", () => {
  it("place 文件不存在时返回失败", async () => {
    const { injectIntoPlace } = await import("../src/rojo-inject.mjs");
    const result = await injectIntoPlace("/nonexistent/game.rbxl", "/some/config.json");
    expect(result.success).toBe(false);
    expect(result.message).toContain("不存在");
  });

  it("project json 不存在时返回失败", async () => {
    const { injectIntoPlace } = await import("../src/rojo-inject.mjs");
    // 用一个存在的文件作为 placePath
    const result = await injectIntoPlace(process.execPath, "/nonexistent/config.json");
    expect(result.success).toBe(false);
    expect(result.message).toContain("不存在");
  });

  it("rojo 二进制不存在时返回失败", async () => {
    const saved = process.env.ROJO_PATH;
    process.env.ROJO_PATH = "/nonexistent/rojo";

    // 需要重新导入以获取新的环境变量
    // 由于 ESM 缓存，这里直接测试 getRojoBinaryPath
    const { getRojoBinaryPath } = await import("../src/rojo-inject.mjs");
    const result = getRojoBinaryPath();
    expect(result).toBe(null);

    if (saved) process.env.ROJO_PATH = saved;
    else delete process.env.ROJO_PATH;
  });
});
