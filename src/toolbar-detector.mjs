import { existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEMPLATE_DIR = join(__dirname, "..", "templates");
const THEME_DIRS = ["dark", "light"]; // 优先尝试 dark 主题

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
  // 尝试从各主题目录加载模板，返回所有找到的模板
  const templates = [];
  
  for (const theme of THEME_DIRS) {
    const p = join(TEMPLATE_DIR, theme, `${name}.png`);
    if (!existsSync(p)) continue;
    const { data, info } = await sharp(p).grayscale().raw().toBuffer({ resolveWithObject: true });
    templates.push({ data, width: info.width, height: info.height, theme });
  }
  
  // 兼容旧目录结构（直接在 templates/ 下）
  const legacyPath = join(TEMPLATE_DIR, `${name}.png`);
  if (existsSync(legacyPath)) {
    const { data, info } = await sharp(legacyPath).grayscale().raw().toBuffer({ resolveWithObject: true });
    templates.push({ data, width: info.width, height: info.height, theme: "legacy" });
  }
  
  return templates.length > 0 ? templates : null;
}

function bufferToMat(data, width, height, channels) {
  const type = channels === 1 ? cv.CV_8UC1 : cv.CV_8UC3;
  const mat = new cv.Mat(height, width, type);
  mat.data.set(data);
  return mat;
}

function findButtonByTemplate(screenshotGray, template, threshold = 0.6) {
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

// 从多个模板中找到最佳匹配
function findBestMatch(screenshotGray, templates, threshold = 0.55) {
  if (!templates || templates.length === 0) return null;
  
  let bestMatch = null;
  let bestTemplate = null;
  
  for (const tpl of templates) {
    const tplMat = bufferToMat(tpl.data, tpl.width, tpl.height, 1);
    const match = findButtonByTemplate(screenshotGray, tplMat, threshold);
    tplMat.delete();
    
    if (match && (!bestMatch || match.confidence > bestMatch.confidence)) {
      bestMatch = match;
      bestTemplate = tpl;
    }
  }
  
  return bestMatch ? { match: bestMatch, template: bestTemplate } : null;
}

function analyzeButtonColor(rgbData, imgWidth, x, y, w, h, buttonType = null) {
  const COLOR_THRESHOLD = 50;
  let redCount = 0, greenCount = 0, blueCount = 0;
  let darkPixelCount = 0, totalDarkBrightness = 0;
  let brightPixelCount = 0;
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
      if (brightness > 120) {
        brightPixelCount++;
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
    const brightRatio = brightPixelCount / total;
    // Windows light theme: stopped avgDark ~154, running avgDark ~53
    if (avgDark > 120) return ["disabled", "light"];
    // Mac dark theme: running brightRatio ~0.275, stopped ~0.167
    if (brightRatio > 0.22) return ["enabled", "dark"];
    // Low brightRatio + low avgDark = dark theme disabled
    return ["disabled", "dark"];
  }

  const minRatio = 0.03;
  if (redCount > total * minRatio) {
    // For stop button in Mac dark theme, distinguish bright red (enabled) from dim red (disabled)
    if (buttonType === "stop" && darkPixelCount > 0) {
      const avgDark = totalDarkBrightness / darkPixelCount;
      if (avgDark < 50) return ["disabled", "red"];
    }
    return ["enabled", "red"];
  }
  if (greenCount > total * minRatio) return ["enabled", "green"];
  if (blueCount > total * minRatio) return ["enabled", "blue"];
  return ["disabled", "gray"];
}

function inferGameState(play, pause, stop, playColor, stopColor) {
  if (pause === "enabled") return "running";
  if (pause === "disabled") return "stopped";
  // play 红色优先判断 running（比 stop disabled 更可靠）
  if (play === "enabled" && playColor === "red") return "running";
  if (play === "enabled" && playColor === "green") return "stopped";
  if (stop === "enabled" && stopColor === "red") return "running";
  if (stop === "disabled") return "stopped";
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

  const playTpls = await loadTemplateGray("play");
  const pauseTpls = await loadTemplateGray("pause");
  const stopTpls = await loadTemplateGray("stop");

  // 按主题分组匹配，选择最佳主题
  const themeResults = {};
  
  for (const theme of [...THEME_DIRS, "legacy"]) {
    const buttons = [];
    
    for (const [name, tpls, type] of [
      ["play", playTpls, null],
      ["pause", pauseTpls, "pause"],
      ["stop", stopTpls, null],
    ]) {
      if (!tpls) continue;
      
      // 只使用当前主题的模板
      const themeTpls = tpls.filter(t => t.theme === theme);
      if (themeTpls.length === 0) continue;
      
      const result = findBestMatch(grayMat, themeTpls);
      if (result) {
        const { match, template } = result;
        const [state, color] = analyzeButtonColor(
          rgbData, width, match.x, match.y, template.width, template.height, type,
        );
        buttons.push({
          type: name,
          x: match.x, y: match.y,
          width: template.width, height: template.height,
          state, colorType: color, confidence: match.confidence,
          theme: template.theme,
        });
      }
    }
    
    if (buttons.length > 0) {
      // 计算主题得分：匹配数量 + 平均置信度 + 位置一致性
      const avgConfidence = buttons.reduce((s, b) => s + b.confidence, 0) / buttons.length;
      const yValues = buttons.map(b => b.y);
      const yConsistency = yValues.length > 1 ? 
        (Math.max(...yValues) - Math.min(...yValues) < 50 ? 0.2 : 0) : 0.1;
      
      themeResults[theme] = {
        buttons,
        score: buttons.length * 0.3 + avgConfidence + yConsistency,
      };
    }
  }

  grayMat.delete();

  // 选择得分最高的主题
  let bestTheme = null;
  let bestScore = 0;
  for (const [theme, result] of Object.entries(themeResults)) {
    if (result.score > bestScore) {
      bestScore = result.score;
      bestTheme = theme;
    }
  }

  if (!bestTheme) {
    return {
      play: "unknown",
      pause: "unknown",
      stop: "unknown",
      gameState: "stopped",
      buttons: [],
      theme: null,
    };
  }

  const buttons = themeResults[bestTheme].buttons;
  let playState = "unknown", pauseState = "unknown", stopState = "unknown";
  let playColor = null, stopColor = null;

  for (const btn of buttons) {
    if (btn.type === "play") { playState = btn.state; playColor = btn.colorType; }
    if (btn.type === "pause") { pauseState = btn.state; }
    if (btn.type === "stop") { stopState = btn.state; stopColor = btn.colorType; }
  }

  const gameState = inferGameState(playState, pauseState, stopState, playColor, stopColor);

  return {
    play: playState,
    pause: pauseState,
    stop: stopState,
    gameState,
    buttons,
    theme: bestTheme,
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
