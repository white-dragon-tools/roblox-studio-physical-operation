import { execSync, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";

// Constants (Windows VK codes, kept for API compat)
export const VK_F5 = 0x74;
export const VK_F12 = 0x7b;
export const VK_SHIFT = 0x10;

// macOS keycode mapping
const VK_TO_MAC = {
  0x74: 96,  // VK_F5 -> kVK_F5
  0x7b: 111, // VK_F12 -> kVK_F12
  0x10: 56,  // VK_SHIFT -> kVK_Shift
  0x0d: 36,  // VK_RETURN -> kVK_Return
  0x1b: 53,  // VK_ESCAPE -> kVK_Escape
};

const MODIFIER_VKS = new Set([0x10]); // VK_SHIFT

export function getStudioPath() {
  const candidates = [
    "/Applications/RobloxStudio.app",
    path.join(os.homedir(), "Applications", "RobloxStudio.app"),
  ];
  for (const p of candidates) {
    if (existsSync(p)) return p;
  }
  try {
    const result = execSync(
      "mdfind \"kMDItemCFBundleIdentifier == 'com.roblox.RobloxStudio'\"",
      { encoding: "utf-8", timeout: 5000 },
    );
    for (const line of result.trim().split("\n")) {
      if (line && existsSync(line)) return line;
    }
  } catch {}
  return null;
}

function runOsascript(script) {
  try {
    return execSync(`osascript -e '${script}'`, { encoding: "utf-8", timeout: 5000 }).trim();
  } catch {
    return null;
  }
}

function getWindowList() {
  // Use CGWindowListCopyWindowInfo via Python bridge (lightweight, no deps)
  try {
    const result = execSync(
      `python3 -c "
import json, Quartz
wl = Quartz.CGWindowListCopyWindowInfo(Quartz.kCGWindowListOptionOnScreenOnly | Quartz.kCGWindowListExcludeDesktopElements, Quartz.kCGNullWindowID)
out = []
for w in (wl or []):
    b = w.get('kCGWindowBounds', {})
    out.append({'pid': w.get('kCGWindowOwnerPID',0), 'wid': w.get('kCGWindowNumber',0), 'name': w.get('kCGWindowName',''), 'x': b.get('X',0), 'y': b.get('Y',0), 'w': b.get('Width',0), 'h': b.get('Height',0)})
print(json.dumps(out))
"`,
      { encoding: "utf-8", timeout: 5000 },
    );
    return JSON.parse(result);
  } catch {
    return [];
  }
}

export function isWindowValid(windowId) {
  const windows = getWindowList();
  return windows.some((w) => w.wid === windowId);
}

export function findWindowByTitle(titleContains) {
  const windows = getWindowList();
  const w = windows.find((w) => w.name && w.name.includes(titleContains));
  return w ? w.wid : null;
}

export function findWindowByPid(pid) {
  const windows = getWindowList();
  // Prefer window with "Roblox Studio" in title
  let best = null;
  let bestArea = 0;
  for (const w of windows) {
    if (w.pid !== pid) continue;
    if (w.name && w.name.includes("Roblox Studio")) return w.wid;
    const area = w.w * w.h;
    if (area > bestArea) {
      bestArea = area;
      best = w.wid;
    }
  }
  return best;
}

function activateApp(pid) {
  runOsascript(`
    tell application "System Events"
      set frontmost of (first process whose unix id is ${pid}) to true
    end tell
  `);
}

function sendKeyEvent(macKeycode, modifiers = []) {
  // Use CGEvent via Python bridge
  const modFlag = modifiers.includes(0x10) ? "Quartz.kCGEventFlagMaskShift" : "0";
  try {
    execSync(
      `python3 -c "
import Quartz, time
e_down = Quartz.CGEventCreateKeyboardEvent(None, ${macKeycode}, True)
e_up = Quartz.CGEventCreateKeyboardEvent(None, ${macKeycode}, False)
if ${modFlag}:
    Quartz.CGEventSetFlags(e_down, ${modFlag})
    Quartz.CGEventSetFlags(e_up, ${modFlag})
Quartz.CGEventPost(Quartz.kCGHIDEventTap, e_down)
time.sleep(0.05)
Quartz.CGEventPost(Quartz.kCGHIDEventTap, e_up)
"`,
      { timeout: 5000 },
    );
    return true;
  } catch {
    return false;
  }
}

export function sendKey(vkCode) {
  const mac = VK_TO_MAC[vkCode];
  if (mac === undefined) return false;
  return sendKeyEvent(mac);
}

export function sendKeyCombo(vkCodes) {
  const modifiers = vkCodes.filter((vk) => MODIFIER_VKS.has(vk));
  const mainKey = vkCodes.find((vk) => !MODIFIER_VKS.has(vk));
  if (mainKey === undefined) return false;
  const mac = VK_TO_MAC[mainKey];
  if (mac === undefined) return false;
  return sendKeyEvent(mac, modifiers);
}

export function sendKeyToWindow(windowId, vkCode) {
  const windows = getWindowList();
  const w = windows.find((w) => w.wid === windowId);
  if (w) activateApp(w.pid);
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  // Sync sleep
  const end = Date.now() + 200;
  while (Date.now() < end) {}
  return sendKey(vkCode);
}

export function sendKeyComboToWindow(windowId, vkCodes) {
  const windows = getWindowList();
  const w = windows.find((w) => w.wid === windowId);
  if (w) activateApp(w.pid);
  const end = Date.now() + 200;
  while (Date.now() < end) {}
  return sendKeyCombo(vkCodes);
}

export function captureWindow(windowId, outputPath) {
  try {
    const result = spawnSync("screencapture", ["-l", String(windowId), "-o", "-x", outputPath], {
      timeout: 10000,
    });
    return result.status === 0 && existsSync(outputPath);
  } catch {
    return false;
  }
}

export async function captureWindowToBuffer(windowId) {
  // Capture to temp file, then read with sharp
  const tmpPath = path.join(os.tmpdir(), `roblox_capture_${Date.now()}.png`);
  if (!captureWindow(windowId, tmpPath)) return null;
  try {
    const sharp = (await import("sharp")).default;
    const { data, info } = await sharp(tmpPath).raw().toBuffer({ resolveWithObject: true });
    const { unlinkSync } = await import("node:fs");
    unlinkSync(tmpPath);
    return { data, width: info.width, height: info.height };
  } catch {
    return null;
  }
}

export function clickAt() { return false; }
export function rightClickAt() { return false; }
export function doubleClickAt() { return false; }

export function findAllWindowsByPid(pid) {
  const windows = getWindowList();
  return windows
    .filter((w) => w.pid === pid && w.w > 0 && w.h > 0)
    .map((w) => ({
      hwnd: w.wid,
      title: w.name || "",
      rect: [w.x, w.y, w.x + w.w, w.y + w.h],
      width: w.w,
      height: w.h,
    }));
}

export function captureWindowWithModals(mainWindowId, pid, outputPath) {
  const allWindows = findAllWindowsByPid(pid);
  if (!allWindows.length) {
    const ok = captureWindow(mainWindowId, outputPath);
    return [ok, []];
  }
  const modals = allWindows.filter((w) => w.hwnd !== mainWindowId);
  const target = modals.length > 0 ? modals[0].hwnd : mainWindowId;
  const ok = captureWindow(target, outputPath);
  return [ok, allWindows];
}

export function getModalWindows(mainWindowId, pid) {
  const all = findAllWindowsByPid(pid);
  return all.filter((w) => w.hwnd !== mainWindowId && w.width > 50 && w.height > 50);
}

export function closeModalWindow(windowId) {
  // Use AppleScript to close window
  try {
    execSync(
      `python3 -c "
import Quartz
Quartz.CGWindowListCopyWindowInfo(0,0)  # just to verify import
# macOS doesn't have WM_CLOSE equivalent for arbitrary windows
# Use accessibility API or AppleScript
"`,
      { timeout: 5000 },
    );
    // Fallback: send Escape key
    return sendKey(0x1b); // VK_ESCAPE
  } catch {
    return false;
  }
}

export function closeAllModals(mainWindowId, pid) {
  const modals = getModalWindows(mainWindowId, pid);
  const closedTitles = [];
  for (const m of modals) {
    if (closeModalWindow(m.hwnd)) {
      closedTitles.push(m.title || `(wid: ${m.hwnd})`);
    }
  }
  return [closedTitles.length, closedTitles];
}
