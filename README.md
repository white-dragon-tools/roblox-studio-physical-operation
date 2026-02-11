# Roblox Studio Physical Operation Tools

Node.js CLI tool for controlling Roblox Studio -- toolbar detection, game control, log analysis, local file identification.

Cross-platform: Windows + macOS + Linux.

## Install

```bash
npm install @white-dragon-tools/roblox-studio-physical-operation-tools
```

## Usage

```bash
rspo <command> <place_path> [options]
```

All commands output JSON to stdout.

### Commands

| Command | Description |
|---------|-------------|
| `open [--inject]` | Open Studio with a .rbxl file (--inject: inject LocalPlacePath attribute) |
| `close` | Close Studio (taskkill/kill) |
| `modal_close` | Close all modal dialogs |
| `game_start` | Start game (F5) |
| `game_stop` | Stop game (Shift+F5) |
| `logs_get` | Get filtered logs (user script output only) |
| `toolbar_state` | Detect toolbar button state via template matching |
| `studio_query` | Query Studio status (process, window, modals) |
| `inject` | Inject LocalPlacePath attribute to temp file |

### Examples

```bash
# Query Studio status
rspo studio_query "D:/project/game.rbxl"

# Open with LocalPlacePath injection (for CI identification)
rspo open "D:/project/game.rbxl" --inject

# Inject LocalPlacePath to temp file (without opening)
rspo inject "D:/project/game.rbxl"

# Start game
rspo game_start "D:/project/game.rbxl"

# Get logs
rspo logs_get "D:/project/game.rbxl"

# Detect toolbar state (running/stopped)
rspo toolbar_state "D:/project/game.rbxl"
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

**open --inject:**
```json
{
  "success": true,
  "message": "Studio started (PID: 12345, HWND: 67890)",
  "pid": 12345,
  "injected_path": "C:\\Users\\...\\Temp\\rspo_places\\game_1234567890.rbxl",
  "original_path": "D:/project/game.rbxl"
}
```

**inject:**
```json
{
  "success": true,
  "original_path": "D:/project/game.rbxl",
  "output_path": "C:\\Users\\...\\Temp\\rspo_places\\game_1234567890.rbxl"
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

## LocalPlacePath Injection

The `--inject` flag (or `inject` command) adds a `LocalPlacePath` attribute to the Workspace, allowing Studio plugins to identify which local file is open:

```lua
-- In Studio plugin
local path = workspace:GetAttribute("LocalPlacePath")
print("Opened from:", path) -- e.g., "D:/project/game.rbxl"
```

This is useful for CI pipelines that need to identify which Studio instance corresponds to which file.

The injected file is saved to a temp directory (`%TEMP%/rspo_places/` on Windows), preserving the original file.

## As a Library

```js
import { getLogsFromLine, findErrors } from "./src/log-utils.mjs";
import { detectToolbarStateFromFile } from "./src/toolbar-detector.mjs";
import { ensureLune, injectLocalPath } from "./src/lune-manager.mjs";

// Parse logs from a file
const result = getLogsFromLine("/path/to/studio.log", {
  timestamps: true,
  includeContext: true,
  runContext: "play",
});

// Detect toolbar state from a screenshot
const state = await detectToolbarStateFromFile("screenshot.png");
console.log(state.gameState); // "running" or "stopped"

// Inject LocalPlacePath to temp file
const tempPath = await injectLocalPath("/path/to/game.rbxl");
```

## Architecture

```
src/
  cli.mjs                  # CLI entry point
  log-filter.mjs           # Log exclusion rules (Studio internal logs)
  log-utils.mjs            # Log parsing, date filtering, error detection
  studio-manager.mjs       # Process finding, session management
  toolbar-detector.mjs     # OpenCV WASM template matching
  lune-manager.mjs         # Lune download/management, LocalPlacePath injection
  platform/
    index.mjs              # Auto-select Windows or macOS backend
    windows.mjs            # Win32 API via koffi
    macos.mjs              # AppleScript + Quartz via Python bridge
templates/
  play.png, pause.png, stop.png   # Toolbar button templates
  inject_local_path.luau          # Luau script for attribute injection
tests/
  log-filter.test.mjs     # 7 tests
  log-utils.test.mjs      # 32 tests
  toolbar-detector.test.mjs # 20 tests (screenshot regression)
```

## Dependencies

- **koffi** -- Win32 FFI (Windows only, loaded conditionally)
- **opencv-wasm** -- Template matching (cross-platform, no native compilation)
- **sharp** -- Image processing (cross-platform)
- **adm-zip** -- Zip extraction for Lune download

### Auto-managed Dependencies

- **lune** -- Luau runtime for .rbxl/.rbxlx manipulation (auto-downloaded to `~/.rspo/lune/`, ~5MB)

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

### Linux
- Lune binary available for x86_64 and aarch64

## Development

```bash
npm install
npm test          # Run all tests (vitest)
npm run test:watch # Watch mode
```

## License

MIT
