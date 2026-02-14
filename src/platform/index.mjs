import { platform } from "node:os";

let platformModule;

if (platform() === "win32") {
  platformModule = await import("./windows.mjs");
} else if (platform() === "darwin") {
  platformModule = await import("./macos.mjs");
} else {
  throw new Error(`Unsupported platform: ${platform()}`);
}

export const {
  getStudioPath,
  isWindowValid,
  findWindowByTitle,
  findWindowByPid,
  sendKey,
  sendKeyCombo,
  sendKeyToWindow,
  sendKeyComboToWindow,
  captureWindow,
  captureWindowToBuffer,
  captureViewport,
  activateWindow,
  hideWindow,
  clickAt,
  rightClickAt,
  doubleClickAt,
  findAllWindowsByPid,
  captureWindowWithModals,
  getModalWindows,
  closeModalWindow,
  closeAllModals,
  closeStudio,
  VK_F5,
  VK_F12,
  VK_SHIFT,
  VK_CONTROL,
  VK_S,
} = platformModule;
