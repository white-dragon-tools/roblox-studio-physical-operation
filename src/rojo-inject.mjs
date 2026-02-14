// rojo build --merge 的 Node.js 封装
// 调用本地编译的 rojo-injectable 二进制，将 project.json 合并注入到已有 .rbxl 中

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * 定位 rojo 二进制路径。
 * 优先级：环境变量 ROJO_PATH > bin/ 目录下的平台二进制
 */
export function getRojoBinaryPath() {
  if (process.env.ROJO_PATH) {
    const envPath = process.env.ROJO_PATH;
    if (existsSync(envPath)) return envPath;
  }

  const binDir = join(__dirname, "..", "bin");
  const name = process.platform === "win32" ? "rojo-windows.exe" : "rojo-macos";
  const binPath = join(binDir, name);
  if (existsSync(binPath)) return binPath;

  return null;
}

/**
 * 将 project.json 定义的树合并注入到已有的 .rbxl 文件中。
 * 直接修改原文件（幂等操作，多次执行结果一致）。
 *
 * @param {string} placePath - 目标 .rbxl 文件的绝对路径
 * @param {string} projectJsonPath - Rojo project.json 的绝对路径
 * @returns {Promise<{success: boolean, message: string}>}
 */
export async function injectIntoPlace(placePath, projectJsonPath) {
  placePath = resolve(placePath);
  projectJsonPath = resolve(projectJsonPath);

  if (!existsSync(placePath)) {
    return { success: false, message: `Place 文件不存在: ${placePath}` };
  }
  if (!existsSync(projectJsonPath)) {
    return { success: false, message: `Project JSON 不存在: ${projectJsonPath}` };
  }

  const rojoBin = getRojoBinaryPath();
  if (!rojoBin) {
    return { success: false, message: "找不到 rojo 二进制，请设置 ROJO_PATH 环境变量或将二进制放入 bin/ 目录" };
  }

  // rojo build <project.json> --merge <place.rbxl> -o <place.rbxl>
  const args = ["build", projectJsonPath, "--merge", placePath, "-o", placePath];

  return new Promise((resolvePromise) => {
    const child = spawn(rojoBin, args, {
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 30000,
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (data) => { stdout += data.toString(); });
    child.stderr.on("data", (data) => { stderr += data.toString(); });

    child.on("close", (code) => {
      if (code === 0) {
        resolvePromise({ success: true, message: stdout.trim() || "注入完成" });
      } else {
        resolvePromise({
          success: false,
          message: `rojo build 失败 (exit ${code}): ${stderr.trim() || stdout.trim()}`,
        });
      }
    });

    child.on("error", (err) => {
      resolvePromise({ success: false, message: `无法启动 rojo: ${err.message}` });
    });
  });
}
