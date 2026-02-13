import { mkdirSync } from "node:fs";
import { join, basename, dirname } from "node:path";
import { tmpdir } from "node:os";

const SCREENSHOT_BASE = join(tmpdir(), "roblox_studio_mcp_screenshots");

/**
 * 根据 placePath 计算 session 截图子目录名
 * @param {string|null|undefined} placePath
 * @returns {string} 子目录名（已净化）
 */
export function getSessionScreenshotDir(placePath) {
  let dirName;

  if (!placePath) {
    dirName = "unknown";
  } else if (placePath.startsWith("cloud:")) {
    dirName = "cloud_" + placePath.slice(6);
  } else {
    const parent = basename(dirname(placePath));
    const file = basename(placePath).replace(/\.rbxlx?$/i, "");
    dirName = parent + "_" + file;
  }

  // 净化：非 [a-zA-Z0-9_\-\.] 字符替换为 _
  return join(SCREENSHOT_BASE, dirName.replace(/[^a-zA-Z0-9_\-.]/g, "_"));
}

/**
 * 创建并返回 session 截图目录路径
 * @param {string|null|undefined} placePath
 * @returns {string} 绝对路径
 */
export function ensureScreenshotDir(placePath) {
  const dir = getSessionScreenshotDir(placePath);
  mkdirSync(dir, { recursive: true });
  return dir;
}

/**
 * 录制 viewport 帧，每帧保存为独立文件
 * @param {object} opts
 * @param {number} opts.windowId - 窗口句柄 (hwnd)
 * @param {number} opts.pid - 进程 PID
 * @param {string} opts.placePath - place 文件路径
 * @param {number} [opts.duration=3] - 录制时长（秒）
 * @param {number} [opts.fps=3] - 每秒帧数
 * @returns {Promise<object>} 结果对象
 */
export async function recordViewport({ windowId, pid, placePath, duration = 3, fps = 3 }) {
  const platform = await import("./platform/index.mjs");

  if (typeof platform.captureViewport !== "function") {
    return { success: false, error: "当前平台不支持 viewport 截图" };
  }

  const sharp = (await import("sharp")).default;

  const dir = ensureScreenshotDir(placePath);
  const recordDir = join(dir, `record_${Date.now()}`);
  mkdirSync(recordDir, { recursive: true });

  const interval = 1000 / fps;
  const totalFrames = Math.round(duration * fps);
  const savedFrames = [];
  let frameSize = null;

  for (let i = 0; i < totalFrames; i++) {
    const start = Date.now();
    try {
      const buf = await platform.captureViewport(windowId, pid, placePath);
      if (buf) {
        if (!frameSize) frameSize = `${buf.width}x${buf.height}`;
        const framePath = join(recordDir, `frame_${String(i + 1).padStart(3, "0")}.png`);
        await sharp(buf.data, { raw: { width: buf.width, height: buf.height, channels: 3 } })
          .png()
          .toFile(framePath);
        savedFrames.push(framePath);
      }
    } catch {
      // 跳过失败帧
    }
    const elapsed = Date.now() - start;
    if (i < totalFrames - 1 && elapsed < interval) {
      await new Promise((r) => setTimeout(r, interval - elapsed));
    }
  }

  if (savedFrames.length === 0) {
    return { success: false, error: "未能捕获任何帧" };
  }

  return {
    success: true,
    dir: recordDir,
    frames: savedFrames.length,
    frame_size: frameSize,
    files: savedFrames,
    duration,
    fps,
  };
}
