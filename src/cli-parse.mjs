export function parseOptions(args) {
  const options = {};
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--after-line" && args[i + 1]) {
      options.after_line = parseInt(args[++i], 10);
    } else if (arg === "--before-line" && args[i + 1]) {
      options.before_line = parseInt(args[++i], 10);
    } else if (arg === "--start-date" && args[i + 1]) {
      options.start_date = args[++i];
    } else if (arg === "--end-date" && args[i + 1]) {
      options.end_date = args[++i];
    } else if (arg === "--timestamps") {
      options.timestamps = true;
    } else if (arg === "--context" && args[i + 1]) {
      options.context = args[++i];
    } else if (arg === "--max-errors" && args[i + 1]) {
      options.max_errors = parseInt(args[++i], 10);
    } else if (arg === "--close") {
      options.close = true;
    } else if (arg === "--debug") {
      options.debug = true;
    } else if (arg === "--no-save") {
      options.save = false;
    } else if (arg === "--full") {
      options.full = true;
    } else if (arg === "--viewport") {
      options.viewport = true;
    } else if (arg === "--errors") {
      options.errors = true;
    } else if (arg === "--duration" && args[i + 1]) {
      options.duration = parseInt(args[++i], 10);
    } else if (arg === "--fps" && args[i + 1]) {
      options.fps = parseInt(args[++i], 10);
    } else if (arg === "--normal") {
      options.normal = true;
    }
  }
  return options;
}

export function getCommandExamples(command) {
  const p = '"D:/project/game.rbxl"';
  const exampleMap = {
    list: "  rspo list",
    open: `  rspo open ${p}`,
    activate: `  rspo activate ${p}`,
    hide: `  rspo hide ${p}`,
    close: `  rspo close ${p}`,
    status: `  rspo status ${p}\n\n  Output: { "active": true, "ready": true, "pid": 12345, "hwnd": 67890, "has_modal": false, "log_path": "..." }`,
    modal: `  rspo modal ${p}\n  rspo modal ${p} --close`,
    game: `  rspo game start ${p}\n  rspo game stop ${p}\n  rspo game pause ${p}`,
    log: `  rspo log ${p}\n  rspo log ${p} --after-line 100 --timestamps\n  rspo log ${p} --errors`,
    screenshot: `  rspo screenshot ${p}\n  rspo screenshot ${p} my_screenshot.png\n  rspo screenshot ${p} --normal\n  rspo screenshot ${p} --full`,
    toolbar: `  rspo toolbar ${p}\n\n  Output: { "play": "enabled", "pause": "disabled", "stop": "disabled", "game_state": "stopped" }\n\n  rspo toolbar ${p} --debug`,
    save: `  rspo save ${p}`,
    record: `  rspo record ${p}\n  rspo record ${p} --duration 5 --fps 2\n  rspo record ${p} --duration 3 --fps 3`,
  };
  return exampleMap[command] || null;
}
