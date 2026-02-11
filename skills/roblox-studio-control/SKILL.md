---
name: Roblox Studio Control
description: This skill should be used when the user asks to "control Roblox Studio", "start/stop game in Studio", "get Studio logs", "detect toolbar state", "take Studio screenshot", "close modal dialogs", or needs to automate Roblox Studio operations via CLI.
version: 0.4.0
---

# Roblox Studio Physical Operation

Node.js CLI tool for controlling Roblox Studio - toolbar detection, game control, log analysis.

Cross-platform: Windows + macOS.

## CLI Usage

```bash
rspo <command> [place_path] [options]
```

All commands output JSON to stdout. Use `-h` or `--help` for help.

## Command Reference

### Studio Management

| Command | Description | Arguments |
|---------|-------------|-----------|
| `studio_help` | Show help documentation | - |
| `studio_list` | List all running Studio instances | - |
| `open` | Open Studio with a .rbxl file | `<place_path>` |
| `close` | Close Studio instance | `<place_path>` |
| `studio_status` | Get basic status | `<place_path>` |
| `studio_query` | Query full status (process, window, modals) | `<place_path>` |

### Modal Dialog Control

| Command | Description | Arguments |
|---------|-------------|-----------|
| `modal_detect` | Detect modal dialogs | `<place_path>` |
| `modal_close` | Close all modal dialogs | `<place_path>` |

### Game Control

| Command | Description | Arguments |
|---------|-------------|-----------|
| `game_start` | Start game (sends F5) | `<place_path>` |
| `game_stop` | Stop game (sends Shift+F5) | `<place_path>` |
| `game_pause` | Pause/resume game (sends F12) | `<place_path>` |

### Log Analysis

| Command | Description | Arguments |
|---------|-------------|-----------|
| `logs_get` | Get filtered logs (user script output only) | `<place_path> [options]` |
| `logs_search` | Search logs with pattern | `<place_path> <pattern> [options]` |
| `logs_clean` | Clean old log files | `[days]` (default: 7) |
| `logs_has_error` | Detect errors in logs | `<place_path> [options]` |
| `logs_by_date` | Get logs by date range | `<place_path> [options]` |

Log options: `--after-line`, `--before-line`, `--start-date`, `--end-date`, `--timestamps`, `--context`

### Toolbar Detection

| Command | Description | Arguments |
|---------|-------------|-----------|
| `toolbar_state` | Detect toolbar button state via template matching | `<place_path>` |
| `toolbar_state_debug` | Toolbar detection with debug image | `<place_path>` |

### Screenshot

| Command | Description | Arguments |
|---------|-------------|-----------|
| `screenshot` | Capture Studio window | `<place_path> [filename]` |
| `screenshot_full` | Capture window with all modal dialogs | `<place_path> [filename]` |

## Output Examples

### studio_query

```json
{
  "active": true,
  "ready": true,
  "pid": 12345,
  "hwnd": 67890,
  "has_modal": false,
  "modal_count": 0,
  "modals": []
}
```

### toolbar_state

```json
{
  "play": "enabled",
  "pause": "disabled",
  "stop": "disabled",
  "game_state": "stopped"
}
```

`game_state` values: `stopped`, `running`, `paused`

### logs_get

```json
{
  "logs": "[P] Hello world!\n[P] Score: 100",
  "startLine": 100,
  "lastLine": 2330,
  "remaining": 0,
  "hasMore": false
}
```

Log context labels: `[P]` = Play (game running), `[E]` = Edit mode

## Common Workflows

### Start Game and Monitor Logs

```bash
# 1. Query status first
rspo studio_query "D:/project/game.rbxl"

# 2. Close any modal dialogs
rspo modal_close "D:/project/game.rbxl"

# 3. Start game
rspo game_start "D:/project/game.rbxl"

# 4. Wait and check toolbar state
rspo toolbar_state "D:/project/game.rbxl"

# 5. Get logs
rspo logs_get "D:/project/game.rbxl"

# 6. Check for errors
rspo logs_has_error "D:/project/game.rbxl"

# 7. Stop game
rspo game_stop "D:/project/game.rbxl"
```

### Debug Toolbar Detection

```bash
# Get debug image for troubleshooting
rspo toolbar_state_debug "D:/project/game.rbxl"
```

## Platform Notes

### Windows
- Process finding: PowerShell `Get-Process`
- Window management: Win32 API via koffi
- Log directory: `%LOCALAPPDATA%\Roblox\logs`

### macOS
- Process finding: `pgrep` + `ps`
- Window management: AppleScript + Quartz
- Log directory: `~/Library/Logs/Roblox`
- Requires: Screen Recording + Accessibility permissions

## As a Library

```js
import { getLogsFromLine, findErrors } from "@white-dragon-tools/roblox-studio-physical-operation/log-utils";
import { detectToolbarStateFromFile } from "@white-dragon-tools/roblox-studio-physical-operation/toolbar-detector";

// Parse logs
const result = getLogsFromLine("/path/to/studio.log", {
  timestamps: true,
  includeContext: true,
  runContext: "play",
});

// Detect toolbar state
const state = await detectToolbarStateFromFile("screenshot.png");
console.log(state.gameState); // "running" or "stopped"
```
