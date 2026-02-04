"""
Roblox Studio MCP 服务

提供以下功能:
- 游戏控制: start_game, stop_game, pause_resume_game
- 日志分析: get_recent_logs, search_logs_by_pattern
- 视觉捕获: capture_screenshot, start_recording, stop_recording
- 系统工具: get_studio_status, clean_logs, open_place, close_place
"""

from .server import mcp, main

__all__ = ["mcp", "main"]
