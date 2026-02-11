# Roblox Studio Physical Operation Tools

Node.js CLI tool for controlling Roblox Studio -- toolbar detection, game control, log analysis.

Cross-platform: Windows + macOS.

## Install

```bash
npm install @white-dragon-tools/roblox-studio-physical-operation
```

## Usage

```bash
rspo <command> [place_path] [options]
rspo <command> -h    # Show command help
```

All commands output JSON to stdout.

### Commands

#### Studio Management

| Command | Description |
|---------|-------------|
| `studio_help` | Show help documentation |
| `studio_list` | List all running Studio instances |
| `open` | Open Studio with a .rbxl file |
| `close` | Close Studio (taskkill/kill) |
| `studio_status` | Get basic status |
| `studio_query` | Query Studio status (process, window, modals) |

#### Modal Dialog Control

| Command | Description |
|---------|-------------|
| `modal_detect` | Detect modal dialogs |
| `modal_close` | Close all modal dialogs |

#### Game Control

| Command | Description |
|---------|-------------|
| `game_start` | Start game (F5) |
| `game_stop` | Stop game (Shift+F5) |
| `game_pause` | Pause/resume game (F12) |

#### Log Analysis

| Command | Description |
|---------|-------------|
| `logs_get` | Get filtered logs (user script output only) |
| `logs_search` | Search logs with pattern |
| `logs_clean` | Clean old log files (default: 7 days) |
| `logs_has_error` | Detect errors in logs |
| `logs_by_date` | Get logs by date range |

Log options: `--after-line`, `--before-line`, `--start-date`, `--end-date`, `--timestamps`, `--context`

#### Toolbar Detection

| Command | Description |
|---------|-------------|
| `toolbar_state` | Detect toolbar button state via template matching |
| `toolbar_state_debug` | Toolbar detection with debug image |

#### Screenshot

| Command | Description |
|---------|-------------|
| `screenshot` | Capture Studio window |
| `screenshot_full` | Capture window with all modal dialogs |

### Examples

```bash
# Query Studio status
rspo studio_query "D:/project/game.rbxl"

# Start game
rspo game_start "D:/project/game.rbxl"

# Get logs
rspo logs_get "D:/project/game.rbxl"

# Get logs with options
rspo logs_get "D:/project/game.rbxl" --after-line 100 --timestamps

# Search logs
rspo logs_search "D:/project/game.rbxl" "error"

# Detect toolbar state (running/stopped)
rspo toolbar_state "D:/project/game.rbxl"

# Get command help
rspo logs_get -h
```

### Output Examples

**studio_query:**
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

**toolbar_state:**
```json
{
  "play": "enabled",
  "pause": "disabled",
  "stop": "disabled",
  "game_state": "stopped"
}
```

`game_state`: `stopped`, `running`, or `paused`.

**logs_get:**
```json
{
  "logs": "[P] Hello world!\n[P] Score: 100",
  "startLine": 100,
  "lastLine": 2330,
  "remaining": 0,
  "hasMore": false
}
```

Log context labels: `[P]` = Play (game running), `[E]` = Edit mode.

## As a Library

```js
import { getLogsFromLine, findErrors } from "./src/log-utils.mjs";
import { detectToolbarStateFromFile } from "./src/toolbar-detector.mjs";

// Parse logs from a file
const result = getLogsFromLine("/path/to/studio.log", {
  timestamps: true,
  includeContext: true,
  runContext: "play",
});

// Detect toolbar state from a screenshot
const state = await detectToolbarStateFromFile("screenshot.png");
console.log(state.gameState); // "running" or "stopped"
```

## Architecture

```
src/
  cli.mjs                  # CLI entry point
  log-filter.mjs           # Log exclusion rules (Studio internal logs)
  log-utils.mjs            # Log parsing, date filtering, error detection
  studio-manager.mjs       # Process finding, session management
  toolbar-detector.mjs     # OpenCV WASM template matching
  platform/
    index.mjs              # Auto-select Windows or macOS backend
    windows.mjs            # Win32 API via koffi
    macos.mjs              # AppleScript + Quartz via Python bridge
templates/
  play.png, pause.png, stop.png   # Toolbar button templates
tests/
  log-filter.test.mjs     # 7 tests
  log-utils.test.mjs      # 32 tests
  toolbar-detector.test.mjs # 20 tests (screenshot regression)
```

## Dependencies

- **koffi** -- Win32 FFI (Windows only, loaded conditionally)
- **opencv-wasm** -- Template matching (cross-platform, no native compilation)
- **sharp** -- Image processing (cross-platform)

## Platform Details

### Windows
- Process finding: `tasklist` + `Get-CimInstance` (no wmic)
- Window management: Win32 API via koffi (EnumWindows, SendInput, PrintWindow)
- Studio path: Registry `HKCR\roblox-studio\shell\open\command`
- Log directory: `%LOCALAPPDATA%\Roblox\logs`

### macOS
- Process finding: `pgrep` + `ps`
- Window management: AppleScript + Quartz CGEvent
- Screenshot: `screencapture -l <windowId>`
- Studio path: `/Applications/RobloxStudio.app` or Spotlight
- Log directory: `~/Library/Logs/Roblox`
- Requires: Screen Recording + Accessibility permissions

## Development

```bash
npm install
npm test          # Run all tests (vitest)
npm run test:watch # Watch mode
```

## License

MIT
