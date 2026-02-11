// Lune 下载和管理模块
import { existsSync, mkdirSync, createWriteStream, chmodSync } from "node:fs";
import { unlink } from "node:fs/promises";
import { join, basename, dirname, extname } from "node:path";
import { homedir, platform, arch, tmpdir } from "node:os";
import { spawn } from "node:child_process";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const LUNE_VERSION = "0.10.4";
const LUNE_DIR = join(homedir(), ".rspo", "lune");
const RSPO_TEMP_DIR = join(tmpdir(), "rspo_places");
const INJECT_SCRIPT_PATH = join(__dirname, "..", "templates", "inject_local_path.luau");

// 平台映射
function getPlatformInfo() {
  const p = platform();
  const a = arch();

  let os;
  if (p === "win32") os = "windows";
  else if (p === "darwin") os = "macos";
  else if (p === "linux") os = "linux";
  else throw new Error(`Unsupported platform: ${p}`);

  let cpu;
  if (a === "x64") cpu = "x86_64";
  else if (a === "arm64") cpu = "aarch64";
  else throw new Error(`Unsupported architecture: ${a}`);

  return { os, cpu };
}

function getLuneDownloadUrl() {
  const { os, cpu } = getPlatformInfo();
  return `https://github.com/lune-org/lune/releases/download/v${LUNE_VERSION}/lune-${LUNE_VERSION}-${os}-${cpu}.zip`;
}

function getLuneExecutablePath() {
  const ext = platform() === "win32" ? ".exe" : "";
  return join(LUNE_DIR, LUNE_VERSION, `lune${ext}`);
}

async function downloadFile(url, destPath) {
  const https = await import("node:https");
  const http = await import("node:http");

  return new Promise((resolve, reject) => {
    const get = url.startsWith("https") ? https.get : http.get;

    get(url, (response) => {
      // 处理重定向
      if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        downloadFile(response.headers.location, destPath).then(resolve).catch(reject);
        return;
      }

      if (response.statusCode !== 200) {
        reject(new Error(`Download failed: ${response.statusCode}`));
        return;
      }

      const file = createWriteStream(destPath);
      pipeline(response, file).then(resolve).catch(reject);
    }).on("error", reject);
  });
}

async function extractZip(zipPath, destDir) {
  const AdmZip = (await import("adm-zip")).default;
  const zip = new AdmZip(zipPath);
  zip.extractAllTo(destDir, true);
}

export async function ensureLune() {
  const execPath = getLuneExecutablePath();

  if (existsSync(execPath)) {
    return execPath;
  }

  const versionDir = join(LUNE_DIR, LUNE_VERSION);
  mkdirSync(versionDir, { recursive: true });

  const zipPath = join(versionDir, "lune.zip");
  const url = getLuneDownloadUrl();

  console.log(`Downloading lune ${LUNE_VERSION}...`);
  await downloadFile(url, zipPath);

  console.log("Extracting...");
  await extractZip(zipPath, versionDir);

  // 删除 zip 文件
  await unlink(zipPath);

  // Unix 系统设置可执行权限
  if (platform() !== "win32") {
    chmodSync(execPath, 0o755);
  }

  console.log(`Lune installed at: ${execPath}`);
  return execPath;
}

export async function runLuneScript(scriptPath, args = []) {
  const lunePath = await ensureLune();

  return new Promise((resolve, reject) => {
    const proc = spawn(lunePath, ["run", scriptPath, ...args], {
      stdio: ["inherit", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    proc.stdout.on("data", (data) => {
      stdout += data.toString();
    });

    proc.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    proc.on("close", (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
      } else {
        reject(new Error(`Lune exited with code ${code}: ${stderr}`));
      }
    });

    proc.on("error", reject);
  });
}

export { LUNE_VERSION, getLuneExecutablePath };

/**
 * 为场景文件注入 LocalPlacePath 属性，保存到临时目录
 * @param {string} placePath - 原始场景文件路径
 * @returns {Promise<string>} - 注入后的临时文件路径
 */
export async function injectLocalPath(placePath) {
  mkdirSync(RSPO_TEMP_DIR, { recursive: true });

  // 生成临时文件名: 原文件名_时间戳.扩展名
  const ext = extname(placePath);
  const base = basename(placePath, ext);
  const tempFileName = `${base}_${Date.now()}${ext}`;
  const tempPath = join(RSPO_TEMP_DIR, tempFileName);

  const { resolve } = await import("node:path");
  const absolutePlacePath = resolve(placePath);

  const { stdout } = await runLuneScript(INJECT_SCRIPT_PATH, [absolutePlacePath, tempPath]);
  const outputPath = stdout.trim();

  if (!existsSync(outputPath)) {
    throw new Error(`Failed to create injected file: ${outputPath}`);
  }

  return outputPath;
}

export { RSPO_TEMP_DIR };
