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
| `studio_list` | List all running Studio instances (local + cloud) |
| `open` | Open Studio with a .rbxl file |
| `close` | Close Studio (Stop-Process/kill -9) |
| `studio_status` | Get basic status (pid, hwnd, log path) |
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
| `logs_search` | Search logs with regex pattern |
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
| `screenshot_viewport` | Capture game viewport only (macOS only) |

### Examples

```bash
# List all running instances
rspo studio_list

# Query Studio status
rspo studio_query "D:/project/game.rbxl"

# Start game
rspo game_start "D:/project/game.rbxl"

# Get logs
rspo logs_get "D:/project/game.rbxl"

# Get logs with options
rspo logs_get "D:/project/game.rbxl" --after-line 100 --timestamps

# Get logs filtered by run context (play/edit)
rspo logs_get "D:/project/game.rbxl" --context play

# Search logs with regex
rspo logs_search "D:/project/game.rbxl" "Score:"

# Detect toolbar state (running/stopped)
rspo toolbar_state "D:/project/game.rbxl"

# Capture game viewport screenshot (macOS)
rspo screenshot_viewport "D:/project/game.rbxl"

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

`game_state`: `stopped` or `running`.

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

**studio_list:**
```json
[
  { "pid": 12345, "hwnd": 67890, "type": "local", "place_path": "D:/project/game.rbxl" },
  { "pid": 12346, "hwnd": 67891, "type": "cloud", "place_id": 123456789 }
]
```

## As a Library

```js
import { getLogsFromLine, findErrors } from "@white-dragon-tools/roblox-studio-physical-operation/log-utils";
import { detectToolbarStateFromFile } from "@white-dragon-tools/roblox-studio-physical-operation/toolbar-detector";
import { getSession, openPlace, closePlace } from "@white-dragon-tools/roblox-studio-physical-operation/studio-manager";

// Parse logs from a file
const result = getLogsFromLine("/path/to/studio.log", {
  timestamps: true,
  includeContext: true,
  runContext: "play",
});

// Detect toolbar state from a screenshot
const state = await detectToolbarStateFromFile("screenshot.png");
console.log(state.gameState); // "running" or "stopped"
console.log(state.theme);     // "dark", "light", or "legacy"

// Session management
const [ok, msg, session] = await getSession("/path/to/game.rbxl");
if (ok) console.log(session.pid, session.hwnd, session.logPath);
```

## Architecture

```
src/
  index.mjs                # Library entry point (re-exports all modules)
  cli.mjs                  # CLI entry point, command routing and option parsing
  log-filter.mjs           # Log exclusion rules (Studio internal log prefixes/substrings)
  log-utils.mjs            # Log parsing, date filtering, search, error detection
  studio-manager.mjs       # Process finding, PID-log mapping, session management
  toolbar-detector.mjs     # OpenCV WASM multi-theme template matching + color analysis
  platform/
    index.mjs              # Auto-select Windows or macOS backend
    windows.mjs            # Win32 API via koffi (EnumWindows, SendInput, PrintWindow)
    macos.mjs              # CoreGraphics + Accessibility API via koffi, AppleScript
templates/
  dark/                    # Dark theme toolbar button templates
    play.png, pause.png, stop.png
  play.png, pause.png, stop.png   # Legacy/light theme toolbar button templates
tests/
  log-filter.test.mjs
  log-utils.test.mjs
  toolbar-detector.test.mjs  # Screenshot regression tests (running/stopped samples)
```

## Dependencies

- **koffi** -- Native FFI: Win32 API on Windows, CoreGraphics/CoreFoundation/Accessibility API on macOS
- **opencv-wasm** -- Template matching for toolbar detection (cross-platform, no native compilation)
- **sharp** -- Image processing: screenshot capture, grayscale conversion, cropping

## Platform Details

### Windows
- Process finding: PowerShell `Get-Process`
- Window management: Win32 API via koffi (EnumWindows, SendInput, PrintWindow)
- Modal detection: Window enumeration by PID, filtering by size
- Screenshot: `PrintWindow` with `PW_RENDERFULLCONTENT`, BGRA→RGB conversion
- Session matching: Log file command line parsing → place path matching
- Studio path: Registry `HKCR\roblox-studio\shell\open\command`
- Log directory: `%LOCALAPPDATA%\Roblox\logs`
- DPI aware: `SetProcessDpiAwareness` / `SetProcessDPIAware` fallback

### macOS
- Process finding: `pgrep` + `ps`
- Window management: CoreGraphics `CGWindowListCopyWindowInfo` via koffi
- Modal detection: Accessibility API (`AXUIElement`, `AXModal`, `AXDialog`)
- Keyboard input: CoreGraphics `CGEventCreateKeyboardEvent` / `CGEventPost`
- Screenshot: `screencapture -l <windowId>`
- Viewport capture: Accessibility API tree traversal to find game viewport rect, then crop
- Session matching: CrashHandler `--studioPid` + `--attachment` parsing, `lsof` fallback
- Studio path: `/Applications/RobloxStudio.app`, `~/Applications/`, or Spotlight (`mdfind`)
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
