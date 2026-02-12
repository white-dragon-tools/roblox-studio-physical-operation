import { describe, it, expect } from "vitest";
import {
  rgbToHsv,
  analyzeButtonColor,
  inferGameState,
} from "../src/toolbar-detector.mjs";

// Helper: create an RGB buffer filled with a single color
function makeColorBlock(r, g, b, width, height) {
  const data = Buffer.alloc(width * height * 3);
  for (let i = 0; i < width * height; i++) {
    data[i * 3] = r;
    data[i * 3 + 1] = g;
    data[i * 3 + 2] = b;
  }
  return data;
}

describe("rgbToHsv edge cases", () => {
  it("converts black", () => {
    const [h, s, v] = rgbToHsv(0, 0, 0);
    expect(v).toBeCloseTo(0, 0);
    expect(s).toBeCloseTo(0, 0);
  });

  it("converts white", () => {
    const [h, s, v] = rgbToHsv(255, 255, 255);
    expect(v).toBeCloseTo(100, 0);
    expect(s).toBeCloseTo(0, 0);
  });

  it("converts pure blue", () => {
    const [h, s, v] = rgbToHsv(0, 0, 255);
    expect(h).toBeCloseTo(240, 0);
    expect(s).toBeCloseTo(100, 0);
    expect(v).toBeCloseTo(100, 0);
  });

  it("converts yellow (255,255,0)", () => {
    const [h, s, v] = rgbToHsv(255, 255, 0);
    expect(h).toBeCloseTo(60, 0);
    expect(s).toBeCloseTo(100, 0);
  });

  it("converts cyan (0,255,255)", () => {
    const [h, s, v] = rgbToHsv(0, 255, 255);
    expect(h).toBeCloseTo(180, 0);
  });

  it("converts magenta (255,0,255)", () => {
    const [h, s, v] = rgbToHsv(255, 0, 255);
    expect(h).toBeCloseTo(300, 0);
  });
});

describe("analyzeButtonColor", () => {
  const W = 20, H = 20;

  it("detects red → enabled/red", () => {
    const data = makeColorBlock(220, 30, 30, W, H);
    const [state, color] = analyzeButtonColor(data, W, 0, 0, W, H);
    expect(state).toBe("enabled");
    expect(color).toBe("red");
  });

  it("detects green → enabled/green", () => {
    const data = makeColorBlock(30, 200, 30, W, H);
    const [state, color] = analyzeButtonColor(data, W, 0, 0, W, H);
    expect(state).toBe("enabled");
    expect(color).toBe("green");
  });

  it("detects blue → enabled/blue", () => {
    const data = makeColorBlock(30, 30, 220, W, H);
    const [state, color] = analyzeButtonColor(data, W, 0, 0, W, H);
    expect(state).toBe("enabled");
    expect(color).toBe("blue");
  });

  it("detects gray → disabled/gray", () => {
    const data = makeColorBlock(128, 128, 128, W, H);
    const [state, color] = analyzeButtonColor(data, W, 0, 0, W, H);
    expect(state).toBe("disabled");
    expect(color).toBe("gray");
  });

  it("handles empty region (all out of bounds)", () => {
    const data = makeColorBlock(128, 128, 128, 5, 5);
    // x,y far outside the image
    const [state, color] = analyzeButtonColor(data, 5, 100, 100, 10, 10);
    expect(state).toBe("unknown");
    expect(color).toBe("unknown");
  });

  it("pause button: high brightness dark avg → disabled/light", () => {
    // Light theme disabled pause: bright gray pixels
    const data = makeColorBlock(160, 160, 160, W, H);
    const [state, color] = analyzeButtonColor(data, W, 0, 0, W, H, "pause");
    expect(state).toBe("disabled");
    expect(color).toBe("light");
  });

  it("pause button: low avg dark + high bright ratio → enabled/dark", () => {
    // Dark theme enabled pause: mix of dark and bright pixels
    const data = Buffer.alloc(W * H * 3);
    for (let i = 0; i < W * H; i++) {
      if (i < W * H * 0.3) {
        // 30% bright pixels
        data[i * 3] = 180; data[i * 3 + 1] = 180; data[i * 3 + 2] = 180;
      } else {
        // 70% dark pixels
        data[i * 3] = 40; data[i * 3 + 1] = 40; data[i * 3 + 2] = 40;
      }
    }
    const [state, color] = analyzeButtonColor(data, W, 0, 0, W, H, "pause");
    expect(state).toBe("enabled");
    expect(color).toBe("dark");
  });

  it("pause button: low bright ratio + low avg dark → disabled/dark", () => {
    // Dark theme disabled pause: mostly dark pixels, few bright
    const data = Buffer.alloc(W * H * 3);
    for (let i = 0; i < W * H; i++) {
      if (i < W * H * 0.1) {
        data[i * 3] = 140; data[i * 3 + 1] = 140; data[i * 3 + 2] = 140;
      } else {
        data[i * 3] = 40; data[i * 3 + 1] = 40; data[i * 3 + 2] = 40;
      }
    }
    const [state, color] = analyzeButtonColor(data, W, 0, 0, W, H, "pause");
    expect(state).toBe("disabled");
    expect(color).toBe("dark");
  });

  it("stop button: dark red → disabled/red (Mac dark theme)", () => {
    // Dim red pixels (val > 30 threshold to be recognized as colored)
    const data = makeColorBlock(90, 15, 15, W, H);
    const [state, color] = analyzeButtonColor(data, W, 0, 0, W, H, "stop");
    expect(state).toBe("disabled");
    expect(color).toBe("red");
  });

  it("stop button: bright red → enabled/red", () => {
    const data = makeColorBlock(220, 30, 30, W, H);
    const [state, color] = analyzeButtonColor(data, W, 0, 0, W, H, "stop");
    expect(state).toBe("enabled");
    expect(color).toBe("red");
  });

  it("handles sub-region of larger image", () => {
    const fullW = 100, fullH = 100;
    const data = makeColorBlock(128, 128, 128, fullW, fullH);
    // Paint a red region at (10,10) 20x20
    for (let dy = 0; dy < 20; dy++) {
      for (let dx = 0; dx < 20; dx++) {
        const idx = ((10 + dy) * fullW + (10 + dx)) * 3;
        data[idx] = 220; data[idx + 1] = 20; data[idx + 2] = 20;
      }
    }
    const [state, color] = analyzeButtonColor(data, fullW, 10, 10, 20, 20);
    expect(state).toBe("enabled");
    expect(color).toBe("red");
  });
});

describe("inferGameState (additional cases)", () => {
  it("defaults to stopped for all unknown", () => {
    expect(inferGameState("unknown", "unknown", "unknown", null, null)).toBe("stopped");
  });

  it("play enabled + green → stopped (ready to play)", () => {
    expect(inferGameState("enabled", "unknown", "unknown", "green", null)).toBe("stopped");
  });

  it("play disabled with no other info → stopped", () => {
    expect(inferGameState("disabled", "unknown", "unknown", null, null)).toBe("stopped");
  });

  it("pause takes priority over stop", () => {
    // pause=enabled + stop=disabled → running (pause wins)
    expect(inferGameState("unknown", "enabled", "disabled", null, null)).toBe("running");
  });

  it("pause=disabled takes priority over stop=enabled/red", () => {
    // pause=disabled overrides stop=enabled/red
    expect(inferGameState("unknown", "disabled", "enabled", null, "red")).toBe("stopped");
  });
});
