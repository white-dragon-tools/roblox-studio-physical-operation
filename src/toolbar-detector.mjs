import { existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEMPLATE_DIR = join(__dirname, "..", "templates");

const { cv } = await import("opencv-wasm");

function rgbToHsv(r, g, b) {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const diff = max - min;
  const v = max * 100;
  const s = max === 0 ? 0 : (diff / max) * 100;
  let h = 0;
  if (diff !== 0) {
    if (max === r) h = 60 * (((g - b) / diff) % 6);
    else if (max === g) h = 60 * ((b - r) / diff + 2);
    else h = 60 * ((r - g) / diff + 4);
  }
  if (h < 0) h += 360;
  return [h, s, v];
}

async function loadTemplateGray(name) {
  const p = join(TEMPLATE_DIR, `${name}.png`);
  if (!existsSync(p)) return null;
  const { data, info } = await sharp(p).grayscale().raw().toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height };
}

function bufferToMat(data, width, height, channels) {
  const type = channels === 1 ? cv.CV_8UC1 : cv.CV_8UC3;
  const mat = new cv.Mat(height, width, type);
  mat.data.set(data);
  return mat;
}

function findButtonByTemplate(screenshotGray, template, threshold = 0.7) {
  if (!template) return null;
  const result = new cv.Mat();
  cv.matchTemplate(screenshotGray, template, result, cv.TM_CCOEFF_NORMED);
  const minMax = cv.minMaxLoc(result);
  result.delete();
  if (minMax.maxVal >= threshold) {
    return { x: minMax.maxLoc.x, y: minMax.maxLoc.y, confidence: minMax.maxVal };
  }
  return null;
}

function analyzeButtonColor(rgbData, imgWidth, x, y, w, h, buttonType = null) {
  const COLOR_THRESHOLD = 50;
  let redCount = 0, greenCount = 0, blueCount = 0;
  let darkPixelCount = 0, totalDarkBrightness = 0;
  let total = 0;

  for (let dy = 0; dy < h; dy++) {
    for (let dx = 0; dx < w; dx++) {
      const px = x + dx;
      const py = y + dy;
      if (px < 0 || py < 0 || px >= imgWidth) continue;
      const idx = (py * imgWidth + px) * 3;
      const r = rgbData[idx], g = rgbData[idx + 1], b = rgbData[idx + 2];
      if (r === undefined) continue;
      const [hue, sat, val] = rgbToHsv(r, g, b);
      const brightness = (r + g + b) / 3;
      total++;

      if (brightness < 200) {
        darkPixelCount++;
        totalDarkBrightness += brightness;
      }

      if (sat > COLOR_THRESHOLD && val > 30) {
        if (hue <= 30 || hue >= 330) redCount++;
        else if (hue >= 80 && hue <= 160) greenCount++;
        else if (hue >= 180 && hue <= 250) blueCount++;
      }
    }
  }

  if (total === 0) return ["unknown", "unknown"];

  if (buttonType === "pause" && darkPixelCount > 0) {
    const avgDark = totalDarkBrightness / darkPixelCount;
    return avgDark < 120 ? ["enabled", "dark"] : ["disabled", "light"];
  }

  const minRatio = 0.03;
  if (redCount > total * minRatio) return ["enabled", "red"];
  if (greenCount > total * minRatio) return ["enabled", "green"];
  if (blueCount > total * minRatio) return ["enabled", "blue"];
  return ["disabled", "gray"];
}

function inferGameState(play, pause, stop, playColor, stopColor) {
  if (pause === "enabled") return "running";
  if (pause === "disabled") return "stopped";
  if (stop === "enabled" && stopColor === "red") return "running";
  if (stop === "disabled") return "stopped";
  if (play === "enabled" && playColor === "green") return "stopped";
  if (play === "enabled" && playColor === "red") return "running";
  return "stopped";
}

export async function detectToolbarState(captureResult) {
  if (!captureResult) return null;

  const { data: rgbData, width, height } = captureResult;

  const grayBuf = await sharp(rgbData, { raw: { width, height, channels: 3 } })
    .grayscale()
    .raw()
    .toBuffer();

  const grayMat = bufferToMat(grayBuf, width, height, 1);

  const playTpl = await loadTemplateGray("play");
  const pauseTpl = await loadTemplateGray("pause");
  const stopTpl = await loadTemplateGray("stop");

  const buttons = [];
  let playState = "unknown", pauseState = "unknown", stopState = "unknown";
  let playColor = null, stopColor = null;

  for (const [name, tpl, type] of [
    ["play", playTpl, null],
    ["pause", pauseTpl, "pause"],
    ["stop", stopTpl, null],
  ]) {
    if (!tpl) continue;
    const tplMat = bufferToMat(tpl.data, tpl.width, tpl.height, 1);
    const match = findButtonByTemplate(grayMat, tplMat);
    tplMat.delete();

    if (match) {
      const [state, color] = analyzeButtonColor(
        rgbData, width, match.x, match.y, tpl.width, tpl.height, type,
      );
      buttons.push({
        type: name,
        x: match.x, y: match.y,
        width: tpl.width, height: tpl.height,
        state, colorType: color, confidence: match.confidence,
      });
      if (name === "play") { playState = state; playColor = color; }
      if (name === "pause") { pauseState = state; }
      if (name === "stop") { stopState = state; stopColor = color; }
    }
  }

  grayMat.delete();

  const gameState = inferGameState(playState, pauseState, stopState, playColor, stopColor);

  return {
    play: playState,
    pause: pauseState,
    stop: stopState,
    gameState,
    buttons,
  };
}

export async function detectToolbarStateFromFile(imagePath) {
  const { data, info } = await sharp(imagePath)
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return detectToolbarState({ data, width: info.width, height: info.height });
}

export { rgbToHsv, analyzeButtonColor, inferGameState };
