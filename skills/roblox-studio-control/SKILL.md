---
name: Roblox Studio Control
description: This skill should be used when the user asks to "control Roblox Studio", "start/stop game in Studio", "get Studio logs", "detect toolbar state", "take Studio screenshot", "close modal dialogs", or needs to automate Roblox Studio operations via CLI.
version: 0.5.0
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
| `list` | List all running Studio instances | - |
| `open` | Open Studio with a .rbxl file | `<place_path>` |
| `close` | Close Studio instance | `<place_path>` |
| `status` | Get full status (process, window, modals, log path) | `<place_path>` |

### Modal Dialog Control

| Command | Description | Arguments |
|---------|-------------|-----------|
| `modal` | Detect modal dialogs | `<place_path>` |
| `modal --close` | Close all modal dialogs | `<place_path>` |

### Game Control

| Command | Description | Arguments |
|---------|-------------|-----------|
| `game start` | Start game (sends F5) | `<place_path>` |
| `game stop` | Stop game (sends Shift+F5) | `<place_path>` |
| `game pause` | Pause/resume game (sends F12) | `<place_path>` |

### Log Analysis

| Command | Description | Arguments |
|---------|-------------|-----------|
| `log` | Get filtered logs (user script output only) | `<place_path> [options]` |
| `log --errors` | Detect errors in logs | `<place_path> [options]` |

Log options: `--after-line`, `--before-line`, `--start-date`, `--end-date`, `--timestamps`, `--context`

### Toolbar Detection

| Command | Description | Arguments |
|---------|-------------|-----------|
| `toolbar` | Detect toolbar button state via template matching | `<place_path>` |
| `toolbar --debug` | Toolbar detection with debug image | `<place_path>` |

### Screenshot

| Command | Description | Arguments |
|---------|-------------|-----------|
| `screenshot` | Capture Studio window | `<place_path> [filename]` |
| `screenshot --full` | Capture window with all modal dialogs | `<place_path> [filename]` |
| `screenshot --viewport` | Capture game viewport only (macOS only) | `<place_path>` |

## Output Examples

### status

```json
{
  "active": true,
  "ready": true,
  "pid": 12345,
  "hwnd": 67890,
  "log_path": "/path/to/studio.log",
  "log_last_line": 2330,
  "has_modal": false,
  "modal_count": 0,
  "modals": []
}
```

### toolbar

```json
{
  "play": "enabled",
  "pause": "disabled",
  "stop": "disabled",
  "game_state": "stopped"
}
```

`game_state` values: `stopped`, `running`, `paused`

### log

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
rspo status "D:/project/game.rbxl"

# 2. Close any modal dialogs
rspo modal "D:/project/game.rbxl" --close

# 3. Start game
rspo game start "D:/project/game.rbxl"

# 4. Wait and check toolbar state
rspo toolbar "D:/project/game.rbxl"

# 5. Get logs
rspo log "D:/project/game.rbxl"

# 6. Check for errors
rspo log "D:/project/game.rbxl" --errors

# 7. Stop game
rspo game stop "D:/project/game.rbxl"
```

### Debug Toolbar Detection

```bash
# Get debug image for troubleshooting
rspo toolbar "D:/project/game.rbxl" --debug
```

## Platform Notes

### Windows
- Process finding: PowerShell `Get-Process`
- Window management: Win32 API via koffi
- Log directory: `%LOCALAPPDATA%\Roblox\logs`

### macOS
- Process finding: `pgrep` + `ps`
- Window management: CoreGraphics + Accessibility API via koffi
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
