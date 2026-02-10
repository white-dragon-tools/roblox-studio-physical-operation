const EXCLUDE_PREFIXES = [
  "Info:",
  "RobloxGitHash:",
  "Studio Version:",
  "Studio Architecture:",
  "Server RobloxGitHash:",
  "Server Prefix:",
  "*******",
  "Creating PolicyContext",
  "BaseUrl:",
  "settingsUrl:",
  "Session GUID",
  "Machine GUID",
  "Studio Launch Intent",
  "Is Studio Configured",
  "Reflection::load",
  "setAssetFolder",
  "setExtraAssetFolder",
  "isSupportedInstallLocation",
  "preferredLocale",
  "systemLocale",
  "Studio D3D",
  "ESGamePerfMonitor",
  "ABTestFramework",
  "Loading Lua Ribbon",
  "TeamCreateWidget",
  "Web returned cloud plugins",
  "The MCP Studio plugin",
  "Flag ",
  "Evaluating deferred",
  "已创建自动恢复文件",
  "Auto-recovery file",
  "Started network server",
  "New connection from",
  "Disconnect from",
  "Connecting to",
  "Joining game",
  "! Joining game",
  "Player ",
  "sendMLCodeCompletionHttpRequest",
  "UpdateManager::",
  "Warning: Failed to apply StyleRule",
  "On child added called",
  "On child removed called",
  "Action ",
];

const EXCLUDE_CONTAINS = [
  "referenced from Lua",
  "Redundant Flag ID",
  "Asset (Image)",
  "load failed:",
];

export function shouldExclude(message) {
  if (!message || !message.trim()) return true;

  for (const prefix of EXCLUDE_PREFIXES) {
    if (message.startsWith(prefix)) return true;
  }

  for (const substr of EXCLUDE_CONTAINS) {
    if (message.includes(substr)) return true;
  }

  return false;
}

export function filterLogs(messages) {
  return messages.filter((msg) => !shouldExclude(msg));
}
