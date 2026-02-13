import koffi from "koffi";

const user32 = koffi.load("user32.dll");
const kernel32 = koffi.load("kernel32.dll");
const gdi32 = koffi.load("gdi32.dll");

// Constants
export const VK_F5 = 0x74;
export const VK_F12 = 0x7b;
export const VK_SHIFT = 0x10;
export const VK_CONTROL = 0x11;
export const VK_S = 0x53;

const INPUT_KEYBOARD = 1;
const KEYEVENTF_KEYUP = 0x0002;
const WM_CLOSE = 0x0010;
const WM_KEYDOWN = 0x0100;
const WM_KEYUP = 0x0101;
const SW_RESTORE = 9;
const PW_RENDERFULLCONTENT = 2;

// DPI awareness
try {
  const shcore = koffi.load("shcore.dll");
  const SetProcessDpiAwareness = shcore.func("long SetProcessDpiAwareness(int)");
  SetProcessDpiAwareness(2);
} catch {
  try {
    const SetProcessDPIAware = user32.func("int SetProcessDPIAware()");
    SetProcessDPIAware();
  } catch {}
}

// Win32 function declarations
const EnumWindowsCallback = koffi.proto("bool __stdcall EnumWindowsCallback(long hwnd, long lparam)");
const EnumWindows = user32.func("bool __stdcall EnumWindows(EnumWindowsCallback* cb, long lparam)");
const IsWindowVisible = user32.func("bool __stdcall IsWindowVisible(long hwnd)");
const IsWindow = user32.func("bool __stdcall IsWindow(long hwnd)");
const IsIconic = user32.func("bool __stdcall IsIconic(long hwnd)");
const ShowWindow = user32.func("bool __stdcall ShowWindow(long hwnd, int nCmdShow)");
const GetWindowTextW = user32.func("int __stdcall GetWindowTextW(long hwnd, uint16_t* buf, int maxCount)");
const GetWindowTextLengthW = user32.func("int __stdcall GetWindowTextLengthW(long hwnd)");
const GetWindowThreadProcessId = user32.func("long __stdcall GetWindowThreadProcessId(long hwnd, _Out_ uint32_t* pid)");
const SetForegroundWindow = user32.func("bool __stdcall SetForegroundWindow(long hwnd)");
const GetForegroundWindow = user32.func("long __stdcall GetForegroundWindow()");
const PostMessageW = user32.func("bool __stdcall PostMessageW(long hwnd, uint32_t msg, long wParam, long lParam)");
const keybd_event = user32.func("void __stdcall keybd_event(uint8_t bVk, uint8_t bScan, uint32_t dwFlags, long dwExtraInfo)");
const GetWindowRect = user32.func("bool __stdcall GetWindowRect(long hwnd, _Out_ int32_t* rect)");
const GetWindowDC = user32.func("long __stdcall GetWindowDC(long hwnd)");
const ReleaseDC = user32.func("int __stdcall ReleaseDC(long hwnd, long hdc)");
const PrintWindow = user32.func("bool __stdcall PrintWindow(long hwnd, long hdc, uint32_t flags)");

const CreateCompatibleDC = gdi32.func("long __stdcall CreateCompatibleDC(long hdc)");
const CreateCompatibleBitmap = gdi32.func("long __stdcall CreateCompatibleBitmap(long hdc, int w, int h)");
const SelectObject = gdi32.func("long __stdcall SelectObject(long hdc, long obj)");
const DeleteDC = gdi32.func("bool __stdcall DeleteDC(long hdc)");
const DeleteObject = gdi32.func("bool __stdcall DeleteObject(long obj)");
const GetDIBits = gdi32.func("int __stdcall GetDIBits(long hdc, long hbmp, uint32_t start, uint32_t lines, _Out_ uint8_t* bits, _Inout_ uint8_t* bmi, uint32_t usage)");

// SendInput structures (64-bit Windows)
const KEYBDINPUT_TYPE = koffi.struct("KEYBDINPUT", {
  wVk: "uint16_t",
  wScan: "uint16_t",
  dwFlags: "uint32_t",
  time: "uint32_t",
  dwExtraInfo: "uint64_t",
  _pad: "uint64_t", // padding to make union 32 bytes
});

const INPUT_TYPE = koffi.struct("INPUT", {
  type: "uint32_t",
  _pad: "uint32_t", // alignment for 64-bit
  ki: KEYBDINPUT_TYPE,
});

const SendInput = user32.func("uint32_t __stdcall SendInput(uint32_t nInputs, INPUT* pInputs, int cbSize)");

// Registry
import { execSync } from "node:child_process";

export function getStudioPath() {
  try {
    const result = execSync(
      'reg query "HKCR\\roblox-studio\\shell\\open\\command" /ve',
      { encoding: "utf-8", timeout: 5000 },
    );
    const match = result.match(/"([^"]+RobloxStudioBeta\.exe)"/i);
    if (match) return match[1];
    const match2 = result.match(/REG_SZ\s+(.+\.exe)/i);
    if (match2) return match2[1].trim();
  } catch {}
  return null;
}

function getWindowTitle(hwnd) {
  const len = GetWindowTextLengthW(hwnd);
  if (len <= 0) return "";
  const buf = Buffer.alloc((len + 1) * 2);
  GetWindowTextW(hwnd, buf, len + 1);
  return buf.toString("utf16le").replace(/\0+$/, "");
}

function getWindowPid(hwnd) {
  const pidBuf = Buffer.alloc(4);
  GetWindowThreadProcessId(hwnd, pidBuf);
  return pidBuf.readUInt32LE(0);
}

export function isWindowValid(hwnd) {
  return IsWindow(hwnd);
}

export function findWindowByTitle(titleContains) {
  let result = null;
  const cb = koffi.register((hwnd, _) => {
    if (IsWindowVisible(hwnd)) {
      const title = getWindowTitle(hwnd);
      if (title && title.includes(titleContains)) {
        result = hwnd;
        return false;
      }
    }
    return true;
  }, koffi.pointer(EnumWindowsCallback));
  EnumWindows(cb, 0);
  koffi.unregister(cb);
  return result;
}

export function findWindowByPid(pid) {
  let result = null;
  const cb = koffi.register((hwnd, _) => {
    if (IsWindowVisible(hwnd)) {
      const wPid = getWindowPid(hwnd);
      if (wPid === pid) {
        const title = getWindowTitle(hwnd);
        if (title && title.includes("Roblox Studio")) {
          result = hwnd;
          return false;
        }
      }
    }
    return true;
  }, koffi.pointer(EnumWindowsCallback));
  EnumWindows(cb, 0);
  koffi.unregister(cb);
  return result;
}

function ensureForeground(hwnd) {
  SetForegroundWindow(hwnd);
  sleep(100);
  if (GetForegroundWindow() !== hwnd) {
    keybd_event(0x12, 0, 0, 0); // Alt down
    SetForegroundWindow(hwnd);
    keybd_event(0x12, 0, 2, 0); // Alt up
    sleep(100);
  }
}

function sleep(ms) {
  const end = Date.now() + ms;
  while (Date.now() < end) {}
}

export function sendKey(vkCode) {
  const inputs = [
    { type: INPUT_KEYBOARD, _pad: 0, ki: { wVk: vkCode, wScan: 0, dwFlags: 0, time: 0, dwExtraInfo: 0, _pad: 0 } },
    { type: INPUT_KEYBOARD, _pad: 0, ki: { wVk: vkCode, wScan: 0, dwFlags: KEYEVENTF_KEYUP, time: 0, dwExtraInfo: 0, _pad: 0 } },
  ];
  return SendInput(2, inputs, koffi.sizeof(INPUT_TYPE)) === 2;
}

export function sendKeyCombo(vkCodes) {
  const inputs = [];
  for (const vk of vkCodes) {
    inputs.push({ type: INPUT_KEYBOARD, _pad: 0, ki: { wVk: vk, wScan: 0, dwFlags: 0, time: 0, dwExtraInfo: 0, _pad: 0 } });
  }
  for (const vk of [...vkCodes].reverse()) {
    inputs.push({ type: INPUT_KEYBOARD, _pad: 0, ki: { wVk: vk, wScan: 0, dwFlags: KEYEVENTF_KEYUP, time: 0, dwExtraInfo: 0, _pad: 0 } });
  }
  return SendInput(inputs.length, inputs, koffi.sizeof(INPUT_TYPE)) === inputs.length;
}

export function sendKeyToWindow(hwnd, vkCode) {
  const original = GetForegroundWindow();
  ensureForeground(hwnd);
  const ok = sendKey(vkCode);
  sleep(200);
  if (original && original !== hwnd) SetForegroundWindow(original);
  return ok;
}

export function sendKeyComboToWindow(hwnd, vkCodes) {
  const original = GetForegroundWindow();
  ensureForeground(hwnd);
  const ok = sendKeyCombo(vkCodes);
  sleep(200);
  if (original && original !== hwnd) SetForegroundWindow(original);
  return ok;
}

export async function captureWindow(hwnd, outputPath) {
  try {
    const buf = captureWindowToBuffer(hwnd);
    if (!buf) return false;
    const sharp = (await import("sharp")).default;
    await sharp(buf.data, { raw: { width: buf.width, height: buf.height, channels: 3 } })
      .png()
      .toFile(outputPath);
    return true;
  } catch {
    return false;
  }
}

export function captureWindowToBuffer(hwnd) {
  if (IsIconic(hwnd)) {
    ShowWindow(hwnd, SW_RESTORE);
    sleep(300);
  }

  const rect = [0, 0, 0, 0];
  GetWindowRect(hwnd, rect);
  const width = rect[2] - rect[0];
  const height = rect[3] - rect[1];
  if (width <= 0 || height <= 0) return null;

  const hdcWindow = GetWindowDC(hwnd);
  if (!hdcWindow) return null;

  const hdcMem = CreateCompatibleDC(hdcWindow);
  const hBitmap = CreateCompatibleBitmap(hdcWindow, width, height);
  SelectObject(hdcMem, hBitmap);

  PrintWindow(hwnd, hdcMem, PW_RENDERFULLCONTENT);

  // BITMAPINFOHEADER (40 bytes)
  const bmi = Buffer.alloc(40);
  bmi.writeInt32LE(40, 0);       // biSize
  bmi.writeInt32LE(width, 4);    // biWidth
  bmi.writeInt32LE(-height, 8);  // biHeight (negative = top-down)
  bmi.writeInt16LE(1, 12);       // biPlanes
  bmi.writeInt16LE(32, 14);      // biBitCount (BGRA)
  bmi.writeInt32LE(0, 16);       // biCompression = BI_RGB

  const pixelData = Buffer.alloc(width * height * 4);
  GetDIBits(hdcMem, hBitmap, 0, height, pixelData, bmi, 0);

  DeleteObject(hBitmap);
  DeleteDC(hdcMem);
  ReleaseDC(hwnd, hdcWindow);

  // Convert BGRA to RGB
  const rgb = Buffer.alloc(width * height * 3);
  for (let i = 0, j = 0; i < pixelData.length; i += 4, j += 3) {
    rgb[j] = pixelData[i + 2];     // R
    rgb[j + 1] = pixelData[i + 1]; // G
    rgb[j + 2] = pixelData[i];     // B
  }

  return { data: rgb, width, height };
}

export function clickAt(hwnd, x, y, restoreFocus = true) {
  // Implemented via SendInput mouse events - simplified for now
  return false; // TODO: implement with mouse_event
}

export function rightClickAt(hwnd, x, y, restoreFocus = true) {
  return false; // TODO
}

export function doubleClickAt(hwnd, x, y, restoreFocus = true) {
  return false; // TODO
}

// TODO: implement viewport capture for Windows
export async function captureViewport(_windowId, _pid, _placePath) {
  return null;
}

export function findAllWindowsByPid(pid) {
  const windows = [];
  const cb = koffi.register((hwnd, _) => {
    if (IsWindowVisible(hwnd)) {
      const wPid = getWindowPid(hwnd);
      if (wPid === pid) {
        const title = getWindowTitle(hwnd);
        const rect = [0, 0, 0, 0];
        GetWindowRect(hwnd, rect);
        const w = rect[2] - rect[0];
        const h = rect[3] - rect[1];
        if (w > 0 && h > 0) {
          windows.push({ hwnd, title, rect, width: w, height: h });
        }
      }
    }
    return true;
  }, koffi.pointer(EnumWindowsCallback));
  EnumWindows(cb, 0);
  koffi.unregister(cb);
  return windows;
}

export function captureWindowWithModals(hwnd, pid, outputPath) {
  const allWindows = findAllWindowsByPid(pid);
  if (!allWindows.length) {
    const ok = captureWindow(hwnd, outputPath);
    return [ok, []];
  }
  const modals = allWindows.filter((w) => w.hwnd !== hwnd);
  const target = modals.length > 0 ? modals[0].hwnd : hwnd;
  const ok = captureWindow(target, outputPath);
  return [ok, allWindows];
}

export function getModalWindows(hwnd, pid) {
  const all = findAllWindowsByPid(pid);
  return all.filter((w) => w.hwnd !== hwnd && w.width > 50 && w.height > 50);
}

export function closeModalWindow(modalHwnd) {
  try {
    PostMessageW(modalHwnd, WM_CLOSE, 0, 0);
    return true;
  } catch {
    return false;
  }
}

export function closeAllModals(hwnd, pid) {
  const modals = getModalWindows(hwnd, pid);
  const closedTitles = [];
  for (const m of modals) {
    if (closeModalWindow(m.hwnd)) {
      closedTitles.push(m.title || `(hwnd: ${m.hwnd})`);
    }
  }
  return [closedTitles.length, closedTitles];
}
