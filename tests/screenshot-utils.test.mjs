import { describe, it, expect } from "vitest";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { getSessionScreenshotDir } from "../src/screenshot-utils.mjs";

const BASE = join(tmpdir(), "roblox_studio_mcp_screenshots");

describe("getSessionScreenshotDir", () => {
  it("本地路径 .rbxl → parentDir_placeName", () => {
    const result = getSessionScreenshotDir("/Users/kk/projects/Place1.rbxl");
    expect(result).toBe(join(BASE, "projects_Place1"));
  });

  it("本地路径 .rbxlx → 去掉扩展名", () => {
    const result = getSessionScreenshotDir("/Users/kk/demo/MyGame.rbxlx");
    expect(result).toBe(join(BASE, "demo_MyGame"));
  });

  it("cloud place → cloud_id", () => {
    const result = getSessionScreenshotDir("cloud:12345678");
    expect(result).toBe(join(BASE, "cloud_12345678"));
  });

  it("null → unknown", () => {
    const result = getSessionScreenshotDir(null);
    expect(result).toBe(join(BASE, "unknown"));
  });

  it("undefined → unknown", () => {
    const result = getSessionScreenshotDir(undefined);
    expect(result).toBe(join(BASE, "unknown"));
  });

  it("特殊字符替换为 _", () => {
    const result = getSessionScreenshotDir("/Users/kk/my projects/Game (v2).rbxl");
    expect(result).toBe(join(BASE, "my_projects_Game__v2_"));
  });

  it("路径中含有多级目录", () => {
    const result = getSessionScreenshotDir("/home/user/games/TestPlace.rbxl");
    expect(result).toBe(join(BASE, "games_TestPlace"));
  });
});
