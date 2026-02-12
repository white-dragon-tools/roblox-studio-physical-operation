import { execSync, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import koffi from "koffi";

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

// --- koffi bindings for CoreGraphics & CoreFoundation ---

const cg = koffi.load("/System/Library/Frameworks/CoreGraphics.framework/CoreGraphics");
const cf = koffi.load("/System/Library/Frameworks/CoreFoundation.framework/CoreFoundation");

// CoreFoundation
const CFRelease = cf.func("void CFRelease(void* cf)");
const CFArrayGetCount = cf.func("long CFArrayGetCount(void* theArray)");
const CFArrayGetValueAtIndex = cf.func("void* CFArrayGetValueAtIndex(void* theArray, long idx)");
const CFDictionaryGetValue = cf.func("void* CFDictionaryGetValue(void* theDict, void* key)");
const CFStringCreateWithCString = cf.func("void* CFStringCreateWithCString(void* alloc, const char* cStr, uint32_t encoding)");
const CFNumberGetValue = cf.func("bool CFNumberGetValue(void* number, int theType, _Out_ int64_t* valuePtr)");
const CFStringGetCString = cf.func("bool CFStringGetCString(void* theString, _Out_ uint8_t* buffer, long bufferSize, uint32_t encoding)");

// CoreGraphics - window list
const CGWindowListCopyWindowInfo = cg.func("void* CGWindowListCopyWindowInfo(uint32_t option, uint32_t relativeToWindow)");
const CGRectMakeWithDictionaryRepresentation = cg.func("bool CGRectMakeWithDictionaryRepresentation(void* dict, _Out_ double* rect)");

// CoreGraphics - keyboard events
const CGEventCreateKeyboardEvent = cg.func("void* CGEventCreateKeyboardEvent(void* source, uint16_t virtualKey, bool keyDown)");
const CGEventPost = cg.func("void CGEventPost(uint32_t tap, void* event)");
const CGEventSetFlags = cg.func("void CGEventSetFlags(void* event, uint64_t flags)");

// Constants
const kCFStringEncodingUTF8 = 0x08000100;
const kCFNumberSInt32Type = 3;
const kCGWindowListOptionOnScreenOnly = 1;
const kCGWindowListExcludeDesktopElements = 16;
const kCGNullWindowID = 0;
const kCGHIDEventTap = 0;
const kCGEventFlagMaskShift = BigInt(0x00020000);

// Pre-create CF key strings
const cfKeys = {
  pid: CFStringCreateWithCString(null, "kCGWindowOwnerPID", kCFStringEncodingUTF8),
  wid: CFStringCreateWithCString(null, "kCGWindowNumber", kCFStringEncodingUTF8),
  name: CFStringCreateWithCString(null, "kCGWindowName", kCFStringEncodingUTF8),
  bounds: CFStringCreateWithCString(null, "kCGWindowBounds", kCFStringEncodingUTF8),
};

function cfGetNumber(dict, key) {
  const val = CFDictionaryGetValue(dict, key);
  if (!val) return 0;
  const buf = new BigInt64Array(1);
  CFNumberGetValue(val, kCFNumberSInt32Type, buf);
  return Number(buf[0]);
}

function cfGetString(dict, key) {
  const val = CFDictionaryGetValue(dict, key);
  if (!val) return "";
  const buf = Buffer.alloc(512);
  const ok = CFStringGetCString(val, buf, 512, kCFStringEncodingUTF8);
  if (!ok) return "";
  const nullIdx = buf.indexOf(0);
  return buf.subarray(0, nullIdx).toString("utf-8");
}

function cfGetRect(dict, key) {
  const val = CFDictionaryGetValue(dict, key);
  if (!val) return null;
  const rect = new Float64Array(4);
  const ok = CGRectMakeWithDictionaryRepresentation(val, rect);
  if (!ok) return null;
  return { x: rect[0], y: rect[1], w: rect[2], h: rect[3] };
}

// --- Public API ---

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

const kCGWindowListOptionAll = 0;

function getWindowList(onScreenOnly = false) {
  try {
    const option = onScreenOnly
      ? (kCGWindowListOptionOnScreenOnly | kCGWindowListExcludeDesktopElements)
      : kCGWindowListOptionAll;
    const windowList = CGWindowListCopyWindowInfo(option, kCGNullWindowID);
    if (!windowList) return [];

    const count = CFArrayGetCount(windowList);
    const out = [];
    for (let i = 0; i < count; i++) {
      const dict = CFArrayGetValueAtIndex(windowList, i);
      const pid = cfGetNumber(dict, cfKeys.pid);
      const wid = cfGetNumber(dict, cfKeys.wid);
      const name = cfGetString(dict, cfKeys.name);
      const bounds = cfGetRect(dict, cfKeys.bounds);
      out.push({
        pid,
        wid,
        name,
        x: bounds ? bounds.x : 0,
        y: bounds ? bounds.y : 0,
        w: bounds ? bounds.w : 0,
        h: bounds ? bounds.h : 0,
      });
    }
    CFRelease(windowList);
    return out;
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
  let best = null;
  let bestArea = 0;
  for (const w of windows) {
    if (w.pid !== pid) continue;
    const area = w.w * w.h;
    if (w.name && w.name.includes("Roblox Studio") && area > bestArea) {
      bestArea = area;
      best = w.wid;
    }
  }
  if (best) return best;
  // Fallback: largest window for this PID
  for (const w of windows) {
    if (w.pid !== pid) continue;
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
  try {
    const eDown = CGEventCreateKeyboardEvent(null, macKeycode, true);
    const eUp = CGEventCreateKeyboardEvent(null, macKeycode, false);
    if (!eDown || !eUp) return false;

    if (modifiers.includes(0x10)) {
      CGEventSetFlags(eDown, kCGEventFlagMaskShift);
      CGEventSetFlags(eUp, kCGEventFlagMaskShift);
    }

    CGEventPost(kCGHIDEventTap, eDown);
    // Small delay between key down and up
    const end = Date.now() + 50;
    while (Date.now() < end) {}
    CGEventPost(kCGHIDEventTap, eUp);

    CFRelease(eDown);
    CFRelease(eUp);
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
  const tmpPath = path.join(os.tmpdir(), `roblox_capture_${Date.now()}.png`);
  if (!captureWindow(windowId, tmpPath)) return null;
  try {
    const sharp = (await import("sharp")).default;
    const { data, info } = await sharp(tmpPath).removeAlpha().raw().toBuffer({ resolveWithObject: true });
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

export function closeModalWindow(_windowId) {
  // macOS: send Escape key as fallback
  return sendKey(0x1b); // VK_ESCAPE
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
