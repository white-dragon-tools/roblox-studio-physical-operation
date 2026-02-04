"""
MCP 服务器: 定义所有 MCP 工具 (无状态版本)

所有工具都需要传入 place_path 参数
"""

import os
from datetime import datetime
from mcp.server.fastmcp import FastMCP

from .studio_manager import open_place, close_place, get_session, get_session_universal
from .windows_utils import (
    send_key_to_window, send_key_combo_to_window,
    capture_window, capture_window_with_modals, find_all_windows_by_pid,
    get_modal_windows, close_all_modals,
    VK_F5, VK_F12, VK_SHIFT
)
from .log_utils import get_recent_logs, search_logs, clean_old_logs
from .toolbar_detector import detect_toolbar_state, detect_toolbar_state_with_debug

mcp = FastMCP("roblox-studio-physical-operation-mcp")

# 截图输出目录 (系统临时文件夹)
import tempfile
SCREENSHOT_DIR = os.path.join(tempfile.gettempdir(), "roblox_studio_mcp_screenshots")
README_PATH = os.path.join(os.path.dirname(__file__), "..", "README.md")


def _get_session(place_path: str = None, place_id: int = None):
    """
    辅助函数：获取会话，支持 place_path 或 place_id
    
    Returns:
        (success, message, session)
    """
    return get_session_universal(place_path=place_path, place_id=place_id)


# ============ 系统工具 ============

@mcp.tool()
def studio_help() -> str:
    """
    获取 Roblox Studio MCP 使用指南。
    
    返回 README.md 内容，包含 AI 使用最佳实践和工具列表。
    """
    try:
        with open(README_PATH, 'r', encoding='utf-8') as f:
            return f.read()
    except Exception as e:
        return f"无法读取帮助文档: {e}"


@mcp.tool()
def studio_list() -> list[dict]:
    """
    列出所有运行中的 Roblox Studio 实例。
    
    Returns:
        Studio 实例列表，每个包含:
        - pid: 进程 ID
        - hwnd: 窗口句柄
        - type: 类型 (local/cloud)
        - place_path: 本地文件路径（本地类型）
        - place_id: Place ID（云端类型）
    """
    from .studio_manager import get_all_studio_processes, find_latest_studio_logs, get_all_log_cmdlines
    from .windows_utils import find_window_by_pid
    import re
    
    processes = get_all_studio_processes()
    log_files = find_latest_studio_logs(20)
    log_cmdlines = get_all_log_cmdlines(log_files)
    
    instances = []
    
    for proc in processes:
        pid = proc['pid']
        cmdline = proc['cmdline']
        hwnd = find_window_by_pid(pid)
        
        # 判断类型
        place_id_match = re.search(r'-placeId\s+(\d+)', cmdline)
        if place_id_match:
            # 云端 Place
            instances.append({
                "pid": pid,
                "hwnd": hwnd,
                "type": "cloud",
                "place_id": int(place_id_match.group(1))
            })
        else:
            # 本地文件 - 提取 .rbxl 路径（在 exe 路径之后）
            # 命令行格式: "...exe" "path.rbxl" 或 ...exe path.rbxl
            rbxl_match = re.search(r'\.exe["\s]+(.+\.rbxl)', cmdline, re.IGNORECASE)
            place_path = rbxl_match.group(1).strip('"') if rbxl_match else None
            instances.append({
                "pid": pid,
                "hwnd": hwnd,
                "type": "local",
                "place_path": place_path
            })
    
    return instances


@mcp.tool()
def studio_open(place_path: str) -> str:
    """
    打开 Roblox Studio 并加载指定的 Place 文件。

    Args:
        place_path: rbxl 文件的完整路径

    Returns:
        操作结果信息
    """
    success, message = open_place(place_path)
    return message


@mcp.tool()
def studio_close(place_path: str) -> str:
    """
    关闭指定的 Roblox Studio。

    Args:
        place_path: rbxl 文件的完整路径

    Returns:
        操作结果信息
    """
    success, message = close_place(place_path)
    return message


@mcp.tool()
def studio_status(place_path: str = None, place_id: int = None) -> dict:
    """
    获取指定 Place 的 Studio 状态。

    Args:
        place_path: rbxl 文件的完整路径（本地文件）
        place_id: Roblox Place ID（云端 Place）

    Returns:
        包含状态信息的字典
    """
    success, message, session = _get_session(place_path, place_id)
    if not success:
        return {"active": False, "error": message}

    return {
        "active": True,
        "place_path": session.place_path,
        "pid": session.pid,
        "hwnd": session.hwnd,
        "log_path": session.log_path
    }


@mcp.tool()
def studio_query(place_path: str = None, place_id: int = None) -> dict:
    """
    综合查询 Studio 状态，包括运行状态、模态弹窗等信息。
    
    建议在启动 Studio 后调用此接口，获取完整状态用于后续判断。

    Args:
        place_path: rbxl 文件的完整路径（本地文件）
        place_id: Roblox Place ID（云端 Place）

    Returns:
        包含完整状态信息的 JSON 字典:
        - active: Studio 是否运行中
        - pid: 进程 ID
        - hwnd: 主窗口句柄
        - has_modal: 是否有模态弹窗
        - modals: 模态弹窗列表
        - ready: Studio 是否就绪（运行中且无模态弹窗）
    """
    success, message, session = _get_session(place_path, place_id)
    
    if not success:
        return {
            "active": False,
            "ready": False,
            "error": message,
            "has_modal": False,
            "modals": []
        }
    
    # 检测模态弹窗
    modals = get_modal_windows(session.hwnd, session.pid)
    has_modal = len(modals) > 0
    
    return {
        "active": True,
        "ready": not has_modal,  # 无模态弹窗时才算就绪
        "pid": session.pid,
        "hwnd": session.hwnd,
        "has_modal": has_modal,
        "modal_count": len(modals),
        "modals": [
            {
                "hwnd": m['hwnd'],
                "title": m['title'],
                "size": f"{m['width']}x{m['height']}"
            }
            for m in modals
        ]
    }


@mcp.tool()
def modal_detect(place_path: str = None, place_id: int = None) -> dict:
    """
    检测是否存在模态弹窗。

    Args:
        place_path: rbxl 文件的完整路径（本地文件）
        place_id: Roblox Place ID（云端 Place）

    Returns:
        包含模态弹窗信息的字典
    """
    success, message, session = _get_session(place_path, place_id)
    if not success:
        return {"error": message}

    modals = get_modal_windows(session.hwnd, session.pid)
    
    return {
        "has_modal": len(modals) > 0,
        "count": len(modals),
        "modals": [
            {
                "hwnd": m['hwnd'],
                "title": m['title'],
                "size": f"{m['width']}x{m['height']}"
            }
            for m in modals
        ]
    }


@mcp.tool()
def modal_close(place_path: str = None, place_id: int = None) -> dict:
    """
    关闭所有模态弹窗。

    Args:
        place_path: rbxl 文件的完整路径（本地文件）
        place_id: Roblox Place ID（云端 Place）

    Returns:
        关闭结果
    """
    success, message, session = _get_session(place_path, place_id)
    if not success:
        return {"error": message}

    count, titles = close_all_modals(session.hwnd, session.pid)
    
    return {
        "closed_count": count,
        "closed_titles": titles
    }


# ============ 游戏控制 ============

@mcp.tool()
def game_start(place_path: str = None, place_id: int = None) -> str:
    """
    开始游戏 (发送 F5)。
    注意: 会短暂将 Studio 窗口置于前台。

    Args:
        place_path: rbxl 文件的完整路径（本地文件）
        place_id: Roblox Place ID（云端 Place）

    Returns:
        操作结果信息
    """
    success, message, session = _get_session(place_path, place_id)
    if not success:
        return f"错误: {message}"

    result = send_key_to_window(session.hwnd, VK_F5)
    return "已发送 F5 (开始游戏)" if result else "发送按键失败"


@mcp.tool()
def game_stop(place_path: str = None, place_id: int = None) -> str:
    """
    停止游戏 (发送 Shift+F5)。
    注意: 会短暂将 Studio 窗口置于前台。

    Args:
        place_path: rbxl 文件的完整路径（本地文件）
        place_id: Roblox Place ID（云端 Place）

    Returns:
        操作结果信息
    """
    success, message, session = _get_session(place_path, place_id)
    if not success:
        return f"错误: {message}"

    result = send_key_combo_to_window(session.hwnd, [VK_SHIFT, VK_F5])
    return "已发送 Shift+F5 (停止游戏)" if result else "发送按键失败"


@mcp.tool()
def game_pause(place_path: str = None, place_id: int = None) -> str:
    """
    暂停/恢复游戏 (发送 F12)。
    注意: 会短暂将 Studio 窗口置于前台。

    Args:
        place_path: rbxl 文件的完整路径（本地文件）
        place_id: Roblox Place ID（云端 Place）

    Returns:
        操作结果信息
    """
    success, message, session = _get_session(place_path, place_id)
    if not success:
        return f"错误: {message}"

    result = send_key_to_window(session.hwnd, VK_F12)
    return "已发送 F12 (暂停/恢复)" if result else "发送按键失败"


# ============ 日志分析 ============

@mcp.tool()
def logs_get(
    place_path: str = None, 
    place_id: int = None,
    after_line: int = None, 
    before_line: int = None,
    timestamps: bool = False
) -> dict:
    """
    获取当前会话的日志 (仅 FLog::Output，已过滤 Studio 内部日志)。

    Args:
        place_path: rbxl 文件的完整路径（本地文件）
        place_id: Roblox Place ID（云端 Place）
        after_line: 从哪一行之后开始读取，None 表示从头开始
        before_line: 到哪一行之前结束，None 表示到末尾
        timestamps: 是否附加时间戳 [HH:MM:SS]，默认 False

    Returns:
        {
            "logs": "日志文本，每行一条",
            "start_line": 起始行号,
            "last_line": 最后行号（用于下次 after_line 参数）,
            "remaining": 剩余有效日志行数,
            "has_more": 是否还有更多未返回
        }
    """
    success, message, session = _get_session(place_path, place_id)
    if not success:
        return {"error": message}

    from .log_utils import get_logs_from_line
    return get_logs_from_line(
        session.log_path, 
        after_line=after_line, 
        before_line=before_line,
        timestamps=timestamps
    )


@mcp.tool()
def logs_search(
    place_path: str = None, 
    place_id: int = None,
    pattern: str = "",
    after_line: int = None,
    before_line: int = None,
    timestamps: bool = False
) -> dict:
    """
    在当前会话日志中搜索匹配的条目。

    Args:
        place_path: rbxl 文件的完整路径（本地文件）
        place_id: Roblox Place ID（云端 Place）
        pattern: 正则表达式模式
        after_line: 从哪一行之后开始搜索
        before_line: 到哪一行之前结束
        timestamps: 是否附加时间戳

    Returns:
        {
            "logs": "行号|日志内容",
            "start_line": 起始行号,
            "last_line": 最后行号,
            "match_count": 返回的匹配条数,
            "remaining": 剩余匹配数,
            "has_more": 是否还有更多
        }
    """
    success, message, session = _get_session(place_path, place_id)
    if not success:
        return {"error": message}

    from .log_utils import search_logs_from_line
    return search_logs_from_line(
        session.log_path, 
        pattern,
        after_line=after_line,
        before_line=before_line,
        timestamps=timestamps
    )


@mcp.tool()
def logs_clean(days: int = 7) -> str:
    """
    清理超过指定天数的旧日志文件。

    Args:
        days: 保留最近多少天的日志，默认 7 天

    Returns:
        清理结果信息
    """
    count = clean_old_logs(days)
    return f"已清理 {count} 个旧日志文件"


# ============ 视觉捕获 ============

# ============ 状态检测 ============

@mcp.tool()
def toolbar_state(place_path: str = None, place_id: int = None) -> dict:
    """
    检测 Roblox Studio 工具栏按钮状态。
    
    通过分析工具栏截图，识别播放、暂停、停止、设备选择按钮的状态。
    按钮状态通过灰度判断：灰色=不可用，彩色=可用/激活。
    
    Args:
        place_path: rbxl 文件的完整路径（本地文件）
        place_id: Roblox Place ID（云端 Place）
        
    Returns:
        包含按钮状态的字典:
        - play: 播放按钮状态 (disabled/enabled/active)
        - pause: 暂停按钮状态
        - stop: 停止按钮状态  
        - device: 设备选择按钮状态
        - game_state: 推断的游戏状态 (stopped/running/paused)
    """
    success, message, session = _get_session(place_path, place_id)
    if not success:
        return {"error": message}
    
    state = detect_toolbar_state(session.hwnd)
    if state is None:
        return {"error": "无法检测工具栏状态"}
    
    return state.to_dict()


@mcp.tool()
def toolbar_state_debug(place_path: str = None, place_id: int = None, save_debug_image: bool = True) -> dict:
    """
    检测工具栏状态（带调试信息）。
    
    除了返回按钮状态外，还返回详细的调试信息，包括：
    - 按钮区域坐标
    - 每个按钮的饱和度和亮度值
    - 可选保存标注了按钮位置的调试图像
    
    Args:
        place_path: rbxl 文件的完整路径（本地文件）
        place_id: Roblox Place ID（云端 Place）
        save_debug_image: 是否保存调试图像，默认 True
        
    Returns:
        包含状态和调试信息的字典
    """
    success, message, session = _get_session(place_path, place_id)
    if not success:
        return {"error": message}
    
    debug_output = None
    if save_debug_image:
        os.makedirs(SCREENSHOT_DIR, exist_ok=True)
        debug_output = os.path.join(
            SCREENSHOT_DIR, 
            f"toolbar_debug_{datetime.now().strftime('%Y%m%d_%H%M%S')}.png"
        )
    
    state, debug_info = detect_toolbar_state_with_debug(session.hwnd, debug_output)
    
    result = {"debug": debug_info}
    if state:
        result["state"] = state.to_dict()
    
    return result


@mcp.tool()
def screenshot(place_path: str = None, place_id: int = None, filename: str = None) -> str:
    """
    截取当前 Studio 窗口的截图。

    Args:
        place_path: rbxl 文件的完整路径（本地文件）
        place_id: Roblox Place ID（云端 Place）
        filename: 保存的文件名 (不含路径)，默认使用时间戳

    Returns:
        截图文件的完整路径，或错误信息
    """
    success, message, session = _get_session(place_path, place_id)
    if not success:
        return f"错误: {message}"

    # 确保目录存在
    os.makedirs(SCREENSHOT_DIR, exist_ok=True)

    # 生成文件名
    if not filename:
        filename = f"screenshot_{datetime.now().strftime('%Y%m%d_%H%M%S')}.png"

    output_path = os.path.join(SCREENSHOT_DIR, filename)

    result = capture_window(session.hwnd, output_path)
    if result:
        return output_path
    else:
        return "错误: 截图失败"


@mcp.tool()
def screenshot_full(place_path: str = None, place_id: int = None, filename: str = None) -> dict:
    """
    截取 Studio 窗口及所有模态弹窗的完整截图。
    
    此工具会查找同一进程的所有窗口（包括模态对话框），
    计算它们的包围盒，然后截取整个屏幕区域。
    适用于需要捕获登录框、确认框等模态弹窗的场景。

    Args:
        place_path: rbxl 文件的完整路径（本地文件）
        place_id: Roblox Place ID（云端 Place）
        filename: 保存的文件名 (不含路径)，默认使用时间戳

    Returns:
        包含截图路径和窗口信息的字典
    """
    success, message, session = _get_session(place_path, place_id)
    if not success:
        return {"error": message}

    # 确保目录存在
    os.makedirs(SCREENSHOT_DIR, exist_ok=True)

    # 生成文件名
    if not filename:
        filename = f"screenshot_full_{datetime.now().strftime('%Y%m%d_%H%M%S')}.png"

    output_path = os.path.join(SCREENSHOT_DIR, filename)

    # 使用新的截图函数
    result, windows_info = capture_window_with_modals(session.hwnd, session.pid, output_path)
    
    if result:
        return {
            "success": True,
            "path": output_path,
            "windows_count": len(windows_info),
            "windows": [
                {
                    "hwnd": w.get('hwnd'),
                    "title": w.get('title', ''),
                    "size": f"{w.get('width', 0)}x{w.get('height', 0)}"
                }
                for w in windows_info if 'hwnd' in w
            ]
        }
    else:
        return {"error": "截图失败", "details": windows_info}


def main():
    """启动 MCP 服务器"""
    mcp.run()


if __name__ == "__main__":
    main()
