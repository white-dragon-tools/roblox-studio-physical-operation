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
| `list` | List all running Studio instances (local + cloud) |
| `open <place_path>` | Open Studio with a .rbxl file |
| `close <place_path>` | Close Studio (Stop-Process/kill -9) |
| `status <place_path>` | Get full status (process, window, modals, log path) |

#### Modal Dialog Control

| Command | Description |
|---------|-------------|
| `modal <place_path>` | Detect modal dialogs |
| `modal <place_path> --close` | Close all modal dialogs |

#### Place Operations

| Command | Description |
|---------|-------------|
| `save <place_path>` | Save current place (Ctrl+S / Cmd+S) |

#### Game Control

| Command | Description |
|---------|-------------|
| `game start <place_path>` | Start game (F5) |
| `game stop <place_path>` | Stop game (Shift+F5) |
| `game pause <place_path>` | Pause/resume game (F12) |

#### Log Analysis

| Command | Description |
|---------|-------------|
| `log <place_path>` | Get filtered logs (user script output only) |
| `log <place_path> --errors` | Detect errors in logs |

Log options: `--after-line`, `--before-line`, `--start-date`, `--end-date`, `--timestamps`, `--context`

#### Toolbar Detection

| Command | Description |
|---------|-------------|
| `toolbar <place_path>` | Detect toolbar button state via template matching |
| `toolbar <place_path> --debug` | Toolbar detection with debug image |

#### Screenshot & Recording

| Command | Description |
|---------|-------------|
| `screenshot <place_path>` | Capture game viewport (default) |
| `screenshot <place_path> --normal` | Capture Studio window |
| `screenshot <place_path> --full` | Capture window with all modal dialogs |
| `record <place_path>` | Record viewport frames (default 3s, 3fps) |
| `record <place_path> --duration 5 --fps 2` | Custom duration and fps |

### Examples

```bash
# List all running instances
rspo list

# Get full Studio status
rspo status "D:/project/game.rbxl"

# Start game
rspo game start "D:/project/game.rbxl"

# Get logs
rspo log "D:/project/game.rbxl"

# Get logs with options
rspo log "D:/project/game.rbxl" --after-line 100 --timestamps

# Get logs filtered by run context (play/edit)
rspo log "D:/project/game.rbxl" --context play

# Search logs (pipe to grep/jq)
rspo log "D:/project/game.rbxl" | jq -r .logs | grep "Score:"

# Detect toolbar state (running/stopped)
rspo toolbar "D:/project/game.rbxl"

# Save place
rspo save "D:/project/game.rbxl"

# Capture game viewport screenshot (default)
rspo screenshot "D:/project/game.rbxl"

# Capture normal window screenshot
rspo screenshot "D:/project/game.rbxl" --normal

# Record viewport (each frame saved as separate file)
rspo record "D:/project/game.rbxl" --duration 5 --fps 2

# Get command help
rspo log -h
```

### Output Examples

**status:**
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

**toolbar:**
```json
{
  "play": "enabled",
  "pause": "disabled",
  "stop": "disabled",
  "game_state": "stopped"
}
```

`game_state`: `stopped` or `running`.

**log:**
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

**record:**
```json
{
  "success": true,
  "dir": "/tmp/roblox_studio_mcp_screenshots/project_game/record_1770989155354",
  "frames": 6,
  "frame_size": "1920x1080",
  "files": [
    ".../record_1770989155354/frame_001.png",
    ".../record_1770989155354/frame_002.png",
    ".../record_1770989155354/frame_003.png",
    ".../record_1770989155354/frame_004.png",
    ".../record_1770989155354/frame_005.png",
    ".../record_1770989155354/frame_006.png"
  ],
  "duration": 3,
  "fps": 2
}
```

**list:**
```json
[
  { "pid": 12345, "hwnd": 67890, "type": "local", "place_path": "D:/project/game.rbxl" },
  { "pid": 12346, "hwnd": 67891, "type": "cloud", "place_id": 123456789 }
]
```

## Claude Code Plugin

This tool can be used as a [Claude Code plugin](https://docs.anthropic.com/en/docs/claude-code), giving Claude direct control over Roblox Studio via MCP tools.

### Install

Clone or symlink this repo into your project's `.claude/plugins/` directory, or use `--plugin-dir`:

```bash
# Project-level plugin
cp -r . /path/to/your-project/.claude/plugins/roblox-studio

# Or test locally
claude --plugin-dir .claude-plugin
```

### MCP Tools

| Tool | Description |
|------|-------------|
| `list_studios` | List all running Studio instances |
| `open_place` | Open Studio with a .rbxl file (waits up to 30s) |
| `close_place` | Close a Studio instance (force kill) |
| `get_status` | Get full status: process, window, modals, log path, last line |
| `manage_modals` | Detect or close modal dialogs |
| `game_control` | Start (F5) / Stop (Shift+F5) / Pause (F12) |
| `get_logs` | Get filtered logs with play/edit context, incremental reading |
| `save_place` | Save current place (Ctrl+S / Cmd+S) |
| `screenshot` | Capture screenshot (default: viewport, also normal / full) |
| `record` | Record viewport frames, each saved as separate PNG |
| `detect_toolbar` | Detect toolbar button state via template matching |

### Example Usage in Claude Code

```
> Use get_status to check if my game.rbxl is open, then start the game and get the logs
```

Claude will call `get_status`, `game_control`, and `get_logs` tools automatically.

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
  cli.mjs                  # CLI entry point (11 commands), option parsing and routing
  mcp-server.mjs           # MCP server entry point (11 tools for Claude Code plugin)
  screenshot-utils.mjs     # Screenshot directory management, viewport recording
  log-filter.mjs           # Log exclusion rules (Studio internal log prefixes/substrings)
  log-utils.mjs            # Log parsing, date filtering, search, error detection
  studio-manager.mjs       # Process finding, PID-log mapping, session management
  toolbar-detector.mjs     # OpenCV WASM multi-theme template matching + color analysis
  platform/
    index.mjs              # Auto-select Windows or macOS backend
    windows.mjs            # Win32 API via koffi (EnumWindows, SendInput, PrintWindow)
    macos.mjs              # CoreGraphics + Accessibility API via koffi, AppleScript
.claude-plugin/
  plugin.json              # Plugin manifest
.mcp.json                  # MCP server configuration (stdio transport, at plugin root)
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

- **@modelcontextprotocol/sdk** -- MCP server for Claude Code plugin integration
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
