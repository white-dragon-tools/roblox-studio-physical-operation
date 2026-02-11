import { describe, it, expect } from "vitest";
import { readdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  detectToolbarStateFromFile,
  inferGameState,
  rgbToHsv,
} from "../src/toolbar-detector.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const RUNNING_DIR = join(__dirname, "toolbar_stats", "running");
const STOPPED_DIR = join(__dirname, "toolbar_stats", "stopped");

describe("rgbToHsv", () => {
  it("converts pure red", () => {
    const [h, s, v] = rgbToHsv(255, 0, 0);
    expect(h).toBeCloseTo(0, 0);
    expect(s).toBeCloseTo(100, 0);
    expect(v).toBeCloseTo(100, 0);
  });

  it("converts pure green", () => {
    const [h, s, v] = rgbToHsv(0, 255, 0);
    expect(h).toBeCloseTo(120, 0);
    expect(s).toBeCloseTo(100, 0);
  });

  it("converts gray", () => {
    const [h, s, v] = rgbToHsv(128, 128, 128);
    expect(s).toBeCloseTo(0, 0);
  });
});

describe("inferGameState", () => {
  it("pause enabled -> running", () => {
    expect(inferGameState("unknown", "enabled", "unknown", null, null)).toBe("running");
  });

  it("pause disabled -> stopped", () => {
    expect(inferGameState("unknown", "disabled", "unknown", null, null)).toBe("stopped");
  });

  it("stop red -> running", () => {
    expect(inferGameState("unknown", "unknown", "enabled", null, "red")).toBe("running");
  });

  it("stop disabled -> stopped", () => {
    expect(inferGameState("unknown", "unknown", "disabled", null, null)).toBe("stopped");
  });

  it("play green -> stopped", () => {
    expect(inferGameState("enabled", "unknown", "unknown", "green", null)).toBe("stopped");
  });

  it("play red -> running", () => {
    expect(inferGameState("enabled", "unknown", "unknown", "red", null)).toBe("running");
  });
});

// Skip screenshot tests in CI - opencv-wasm template matching has cross-platform differences
const isCI = process.env.CI === "true";

describe.skipIf(isCI)("toolbar detection from screenshots", () => {
  const runningFiles = existsSync(RUNNING_DIR)
    ? readdirSync(RUNNING_DIR).filter((f) => f.endsWith(".png"))
    : [];
  const stoppedFiles = existsSync(STOPPED_DIR)
    ? readdirSync(STOPPED_DIR).filter((f) => f.endsWith(".png"))
    : [];

  if (runningFiles.length === 0 && stoppedFiles.length === 0) {
    it.skip("no test screenshots found", () => {});
    return;
  }

  for (const file of runningFiles) {
    it(`running: ${file}`, async () => {
      const result = await detectToolbarStateFromFile(join(RUNNING_DIR, file));
      expect(result).not.toBeNull();
      expect(result.gameState).toBe("running");
    }, 15000);
  }

  for (const file of stoppedFiles) {
    it(`stopped: ${file}`, async () => {
      const result = await detectToolbarStateFromFile(join(STOPPED_DIR, file));
      expect(result).not.toBeNull();
      expect(result.gameState).toBe("stopped");
    }, 15000);
  }
});
