import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CLI_PATH = join(__dirname, "..", "src", "cli.mjs");

function run(args, expectFail = false) {
  try {
    const stdout = execFileSync("node", [CLI_PATH, ...args], {
      encoding: "utf-8",
      timeout: 15000,
    });
    return { code: 0, stdout };
  } catch (e) {
    if (expectFail) {
      return { code: e.status || 1, stdout: e.stdout || "", stderr: e.stderr || "" };
    }
    throw e;
  }
}

describe("CLI help", () => {
  it("shows usage with --help", () => {
    const { code, stdout } = run(["--help"]);
    expect(code).toBe(0);
    expect(stdout).toContain("Usage");
    expect(stdout).toContain("Commands");
  });

  it("shows usage with -h", () => {
    const { code, stdout } = run(["-h"]);
    expect(code).toBe(0);
    expect(stdout).toContain("Usage");
  });

  it("shows usage with no args", () => {
    const { code, stdout } = run([]);
    expect(code).toBe(0);
    expect(stdout).toContain("Usage");
  });
});

describe("CLI command help", () => {
  it("shows help for status -h", () => {
    const { code, stdout } = run(["status", "-h"]);
    expect(code).toBe(0);
    expect(stdout).toContain("status");
  });

  it("shows help for log -h", () => {
    const { code, stdout } = run(["log", "-h"]);
    expect(code).toBe(0);
    expect(stdout).toContain("log");
    expect(stdout).toContain("Options");
  });

  it("shows help for game -h", () => {
    const { code, stdout } = run(["game", "-h"]);
    expect(code).toBe(0);
    expect(stdout).toContain("game");
  });
});

describe("CLI unknown command", () => {
  it("exits with error for unknown command", () => {
    const { code, stdout } = run(["nonexistent-command"], true);
    expect(code).not.toBe(0);
    const parsed = JSON.parse(stdout.trim());
    expect(parsed.error).toContain("未知命令");
  });
});

describe("CLI missing arguments", () => {
  it("open without path exits with error", () => {
    const { code, stdout } = run(["open"], true);
    expect(code).not.toBe(0);
    const parsed = JSON.parse(stdout.trim());
    expect(parsed.error).toContain("place_path");
  });

  it("close without path exits with error", () => {
    const { code, stdout } = run(["close"], true);
    expect(code).not.toBe(0);
    const parsed = JSON.parse(stdout.trim());
    expect(parsed.error).toContain("place_path");
  });

  it("status without path exits with error", () => {
    const { code, stdout } = run(["status"], true);
    expect(code).not.toBe(0);
  });

  it("game without action exits with error", () => {
    const { code, stdout } = run(["game"], true);
    expect(code).not.toBe(0);
  });

  it("game with invalid action exits with error", () => {
    const { code, stdout } = run(["game", "invalid"], true);
    expect(code).not.toBe(0);
  });

  it("log without path exits with error", () => {
    const { code, stdout } = run(["log"], true);
    expect(code).not.toBe(0);
  });

  it("screenshot without path exits with error", () => {
    const { code, stdout } = run(["screenshot"], true);
    expect(code).not.toBe(0);
  });

  it("toolbar without path exits with error", () => {
    const { code, stdout } = run(["toolbar"], true);
    expect(code).not.toBe(0);
  });
});

describe("CLI list command", () => {
  it("returns valid JSON", () => {
    const { code, stdout } = run(["list"]);
    expect(code).toBe(0);
    const parsed = JSON.parse(stdout.trim());
    expect(Array.isArray(parsed)).toBe(true);
  });
});
