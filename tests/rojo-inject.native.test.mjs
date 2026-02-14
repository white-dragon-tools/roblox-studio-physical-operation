// 原生集成测试：需要真实的 rojo-injectable 二进制
// 通过 ROJO_PATH 环境变量指向编译好的二进制
// 运行: ROJO_PATH=/tmp/rojo-injectable/target/release/rojo npm run test:native

import { describe, it, expect, beforeAll } from "vitest";
import { existsSync, readFileSync, copyFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { execSync } from "node:child_process";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROJO_BIN = process.env.ROJO_PATH;

// 如果没有 rojo 二进制，跳过所有测试
const describeIfRojo = ROJO_BIN && existsSync(ROJO_BIN) ? describe : describe.skip;

// 测试工作目录
const WORK_DIR = join(tmpdir(), "rspo-inject-test-" + Date.now());

// 最小的 project.json 用于生成 base.rbxl
const BASE_PROJECT = {
  name: "BasePlace",
  tree: {
    $className: "DataModel",
    Workspace: { $className: "Workspace" },
    ReplicatedStorage: { $className: "ReplicatedStorage" },
  },
};

// 注入配置
const INJECT_PROJECT = {
  name: "InjectConfig",
  tree: {
    $className: "DataModel",
    Workspace: {
      $className: "Workspace",
      $properties: { Gravity: 50 },
      TestFolder: {
        $className: "Folder",
      },
    },
  },
};

describeIfRojo("rojo-inject 原生集成测试", () => {
  let basePath;
  let injectProjectPath;

  beforeAll(() => {
    mkdirSync(WORK_DIR, { recursive: true });

    // 生成 base.rbxl
    const baseProjectPath = join(WORK_DIR, "base.project.json");
    writeFileSync(baseProjectPath, JSON.stringify(BASE_PROJECT, null, 2));
    basePath = join(WORK_DIR, "game.rbxl");
    execSync(`"${ROJO_BIN}" build "${baseProjectPath}" -o "${basePath}"`, { timeout: 15000 });

    // 写入注入配置
    injectProjectPath = join(WORK_DIR, "inject.project.json");
    writeFileSync(injectProjectPath, JSON.stringify(INJECT_PROJECT, null, 2));
  });

  it("base.rbxl 生成成功", () => {
    expect(existsSync(basePath)).toBe(true);
    expect(readFileSync(basePath).length).toBeGreaterThan(0);
  });

  it("inject 成功修改 .rbxl", async () => {
    const workPath = join(WORK_DIR, "test_inject.rbxl");
    copyFileSync(basePath, workPath);
    const beforeSize = readFileSync(workPath).length;

    const { injectIntoPlace } = await import("../src/rojo-inject.mjs");
    const result = await injectIntoPlace(workPath, injectProjectPath);

    expect(result.success).toBe(true);
    // 注入后文件应该变大（加了 TestFolder 等内容）
    const afterSize = readFileSync(workPath).length;
    expect(afterSize).toBeGreaterThan(beforeSize);
  });

  it("多次 inject 同一配置，二进制完全一致（幂等性）", async () => {
    const workPath = join(WORK_DIR, "test_idempotent.rbxl");
    copyFileSync(basePath, workPath);

    const { injectIntoPlace } = await import("../src/rojo-inject.mjs");

    // 第 1 次
    await injectIntoPlace(workPath, injectProjectPath);
    const first = readFileSync(workPath);

    // 第 2 次
    await injectIntoPlace(workPath, injectProjectPath);
    const second = readFileSync(workPath);

    // 第 3 次
    await injectIntoPlace(workPath, injectProjectPath);
    const third = readFileSync(workPath);

    expect(Buffer.compare(first, second)).toBe(0);
    expect(Buffer.compare(second, third)).toBe(0);
  });

  it("inject 两次不会创建重复实例（文件大小一致）", async () => {
    const oncePath = join(WORK_DIR, "test_once.rbxl");
    const twicePath = join(WORK_DIR, "test_twice.rbxl");
    copyFileSync(basePath, oncePath);
    copyFileSync(basePath, twicePath);

    const { injectIntoPlace } = await import("../src/rojo-inject.mjs");

    // 一次
    await injectIntoPlace(oncePath, injectProjectPath);

    // 两次
    await injectIntoPlace(twicePath, injectProjectPath);
    await injectIntoPlace(twicePath, injectProjectPath);

    const onceSize = readFileSync(oncePath).length;
    const twiceSize = readFileSync(twicePath).length;
    expect(twiceSize).toBe(onceSize);
  });

  it("CLI inject 命令", () => {
    const workPath = join(WORK_DIR, "test_cli.rbxl");
    copyFileSync(basePath, workPath);

    const cliPath = join(__dirname, "..", "src", "cli.mjs");
    const stdout = execSync(
      `ROJO_PATH="${ROJO_BIN}" node "${cliPath}" inject "${workPath}" "${injectProjectPath}"`,
      { encoding: "utf-8", timeout: 15000 },
    );
    const result = JSON.parse(stdout.trim());
    expect(result.success).toBe(true);
  });
});
