"""
Studio 会话管理

通过扫描进程命令行和日志文件自动查找 Studio 会话，
支持本地文件和云端 Place。

使用索引文件缓存日志命令行信息，减少 IO 操作。
"""

import os
import subprocess
import time
import glob
import json
from typing import Optional
from dataclasses import dataclass
from watchdog.observers import Observer
from watchdog.events import FileSystemEventHandler
import threading

from .windows_utils import get_studio_path, find_window_by_pid
from .log_utils import LOG_DIR


# 索引文件路径
LOG_INDEX_PATH = os.path.join(LOG_DIR, '.mcp_log_index.json')


@dataclass
class SessionInfo:
    """会话信息"""
    place_path: str
    log_path: str
    hwnd: int
    pid: Optional[int] = None


class LogFileWatcher(FileSystemEventHandler):
    """监听日志目录，捕获新创建的日志文件"""

    def __init__(self):
        self.new_log: Optional[str] = None
        self.event = threading.Event()

    def on_created(self, event):
        if not event.is_directory and "Studio" in event.src_path and event.src_path.endswith(".log"):
            self.new_log = event.src_path
            self.event.set()

    def wait_for_log(self, timeout: float = 10.0) -> Optional[str]:
        """等待新日志文件创建"""
        self.event.wait(timeout)
        return self.new_log


# ============ 索引管理 ============

def load_log_index() -> dict:
    """
    加载日志索引文件
    
    Returns:
        {log_filename: {"cmdline": str, "mtime": float}, ...}
    """
    if not os.path.exists(LOG_INDEX_PATH):
        return {}
    
    try:
        with open(LOG_INDEX_PATH, 'r', encoding='utf-8') as f:
            return json.load(f)
    except Exception:
        return {}


def save_log_index(index: dict) -> None:
    """保存日志索引文件"""
    try:
        with open(LOG_INDEX_PATH, 'w', encoding='utf-8') as f:
            json.dump(index, f, indent=2)
    except Exception:
        pass


def get_log_command_line_raw(log_path: str) -> Optional[str]:
    """
    从日志文件前 30 行中提取命令行（不使用缓存）
    
    Returns:
        命令行字符串，或 None
    """
    try:
        with open(log_path, 'r', encoding='utf-8', errors='ignore') as f:
            found_cmd = False
            for i, line in enumerate(f):
                if i > 30:
                    break
                line = line.strip()
                if 'Command line:' in line:
                    found_cmd = True
                    continue
                if found_cmd and 'RobloxStudioBeta.exe' in line:
                    return line
    except Exception:
        pass
    return None


def get_log_command_line(log_path: str, index: dict = None) -> Optional[str]:
    """
    从日志文件提取命令行（使用索引缓存）
    
    Args:
        log_path: 日志文件路径
        index: 索引字典（可选，用于批量操作时共享）
        
    Returns:
        命令行字符串，或 None
    """
    filename = os.path.basename(log_path)
    
    # 获取文件修改时间
    try:
        mtime = os.path.getmtime(log_path)
    except Exception:
        return None
    
    # 加载索引
    if index is None:
        index = load_log_index()
    
    # 检查缓存是否有效
    if filename in index:
        cached = index[filename]
        if cached.get('mtime') == mtime:
            return cached.get('cmdline')
    
    # 缓存无效，读取文件
    cmdline = get_log_command_line_raw(log_path)
    
    # 更新索引
    index[filename] = {
        'cmdline': cmdline,
        'mtime': mtime
    }
    
    return cmdline


def get_all_log_cmdlines(log_files: list[str]) -> dict[str, str]:
    """
    批量获取日志文件的命令行（使用索引缓存）
    
    Args:
        log_files: 日志文件路径列表
        
    Returns:
        {log_path: cmdline, ...}
    """
    index = load_log_index()
    result = {}
    updated = False
    
    for log_path in log_files:
        filename = os.path.basename(log_path)
        
        try:
            mtime = os.path.getmtime(log_path)
        except Exception:
            continue
        
        # 检查缓存
        if filename in index and index[filename].get('mtime') == mtime:
            cmdline = index[filename].get('cmdline')
        else:
            # 读取文件
            cmdline = get_log_command_line_raw(log_path)
            index[filename] = {'cmdline': cmdline, 'mtime': mtime}
            updated = True
        
        if cmdline:
            result[log_path] = cmdline
    
    # 保存更新的索引
    if updated:
        save_log_index(index)
    
    return result


# ============ 进程和日志查找 ============


def get_all_studio_processes() -> list[dict]:
    """
    获取所有运行中的 Studio 进程信息
    
    Returns:
        [{"pid": int, "cmdline": str}, ...]
    """
    result = subprocess.run(
        ['wmic', 'process', 'where', "name='RobloxStudioBeta.exe'", 'get', 'ProcessId,CommandLine', '/format:csv'],
        capture_output=True,
        text=True
    )
    
    processes = []
    for line in result.stdout.strip().split('\n'):
        line = line.strip()
        if not line or line.startswith('Node,CommandLine'):
            continue
        
        parts = line.split(',')
        if len(parts) >= 3:
            # CSV 格式: Node,CommandLine,ProcessId
            cmdline = ','.join(parts[1:-1])  # 命令行可能包含逗号
            try:
                pid = int(parts[-1])
                processes.append({"pid": pid, "cmdline": cmdline})
            except ValueError:
                pass
    
    return processes


def find_latest_studio_logs(limit: int = 10) -> list[str]:
    """
    获取最新的 Studio 日志文件列表
    
    Returns:
        日志文件路径列表（按修改时间倒序）
    """
    pattern = os.path.join(LOG_DIR, '*_Studio_*_last.log')
    files = glob.glob(pattern)
    
    # 按修改时间排序
    files.sort(key=lambda x: os.path.getmtime(x), reverse=True)
    
    return files[:limit]


def find_session_by_place_path(place_path: str) -> Optional[SessionInfo]:
    """
    通过本地文件路径查找 Studio 会话
    
    Args:
        place_path: .rbxl 文件路径
        
    Returns:
        SessionInfo 或 None
    """
    # 标准化路径
    place_path = os.path.normpath(place_path).replace('/', '\\')
    place_path_lower = place_path.lower()
    
    # 获取所有运行中的 Studio 进程
    processes = get_all_studio_processes()
    
    # 获取最新的日志文件及其命令行（使用索引缓存）
    log_files = find_latest_studio_logs(20)
    log_cmdlines = get_all_log_cmdlines(log_files)
    
    for log_path, cmdline in log_cmdlines.items():
        # 标准化命令行中的路径
        cmdline_normalized = cmdline.replace('/', '\\').lower()
        
        # 检查是否包含目标路径
        if place_path_lower not in cmdline_normalized:
            continue
        
        # 找到匹配的日志，现在找对应的进程
        for proc in processes:
            proc_cmdline = proc['cmdline'].replace('/', '\\').lower()
            if place_path_lower in proc_cmdline:
                # 找到匹配的进程
                pid = proc['pid']
                hwnd = find_window_by_pid(pid)
                if hwnd:
                    return SessionInfo(
                        place_path=place_path,
                        log_path=log_path,
                        hwnd=hwnd,
                        pid=pid
                    )
    
    return None


def find_session_by_place_id(place_id: int) -> Optional[SessionInfo]:
    """
    通过云端 Place ID 查找 Studio 会话
    
    Args:
        place_id: Roblox Place ID
        
    Returns:
        SessionInfo 或 None
    """
    place_id_str = str(place_id)
    pattern = f'-placeId {place_id_str}'
    
    # 获取所有运行中的 Studio 进程
    processes = get_all_studio_processes()
    
    # 获取最新的日志文件及其命令行（使用索引缓存）
    log_files = find_latest_studio_logs(20)
    log_cmdlines = get_all_log_cmdlines(log_files)
    
    for log_path, cmdline in log_cmdlines.items():
        # 检查是否包含目标 placeId
        if pattern not in cmdline:
            continue
        
        # 找到匹配的日志，现在找对应的进程
        for proc in processes:
            if pattern in proc['cmdline']:
                # 找到匹配的进程
                pid = proc['pid']
                hwnd = find_window_by_pid(pid)
                if hwnd:
                    return SessionInfo(
                        place_path=f"cloud:{place_id}",
                        log_path=log_path,
                        hwnd=hwnd,
                        pid=pid
                    )
    
    return None
    
    return None


def get_session_universal(
    place_path: str = None, 
    place_id: int = None
) -> tuple[bool, str, Optional[SessionInfo]]:
    """
    通用会话获取函数，支持本地文件和云端 Place
    
    Args:
        place_path: 本地 .rbxl 文件路径
        place_id: 云端 Place ID
        
    Returns:
        (success, message, session_info)
    """
    if place_path is None and place_id is None:
        return False, "必须指定 place_path 或 place_id", None
    
    if place_path is not None and place_id is not None:
        return False, "不能同时指定 place_path 和 place_id", None
    
    if place_path is not None:
        session = find_session_by_place_path(place_path)
        if session:
            return True, "找到本地 Place 会话", session
        return False, "Place 未被打开", None
    
    else:
        session = find_session_by_place_id(place_id)
        if session:
            return True, "找到云端 Place 会话", session
        return False, f"未找到 Place ID {place_id} 的会话", None


# ============ 启动/关闭 Studio ============

def open_place(place_path: str) -> tuple[bool, str]:
    """
    打开本地 Place 文件
    
    Args:
        place_path: .rbxl 文件路径
        
    Returns:
        (success, message)
    """
    if not os.path.exists(place_path):
        return False, f"Place 文件不存在: {place_path}"

    # 检查是否已打开
    session = find_session_by_place_path(place_path)
    if session:
        return False, f"Place 已被打开 (PID: {session.pid})"

    # 获取 Studio 路径
    studio_path = get_studio_path()
    if not studio_path:
        return False, "无法从注册表获取 Roblox Studio 路径"

    if not os.path.exists(studio_path):
        return False, f"Roblox Studio 不存在: {studio_path}"

    # 启动日志监听
    watcher = LogFileWatcher()
    observer = Observer()
    observer.schedule(watcher, LOG_DIR, recursive=False)
    observer.start()

    try:
        # 启动 Studio
        process = subprocess.Popen([studio_path, place_path])
        pid = process.pid

        # 等待日志文件创建
        log_path = watcher.wait_for_log(timeout=15.0)

        # 等待窗口出现
        hwnd = None
        start_time = time.time()
        timeout = 30.0
        while time.time() - start_time < timeout:
            hwnd = find_window_by_pid(pid)
            if hwnd:
                break
            if process.poll() is not None:
                return False, f"Studio 进程已退出 (exit code: {process.returncode})"
            time.sleep(1)

        if not hwnd:
            return False, f"Studio 已启动 (PID: {pid})，但未找到窗口"

        if not log_path:
            return False, f"Studio 已启动 (PID: {pid})，但未找到日志文件"

        return True, f"Studio 已启动 (PID: {pid}, HWND: {hwnd})"

    except Exception as e:
        return False, f"启动 Studio 失败: {e}"
    finally:
        observer.stop()
        observer.join(timeout=5.0)


def close_place(place_path: str = None, place_id: int = None) -> tuple[bool, str]:
    """
    关闭 Studio
    
    Args:
        place_path: 本地 .rbxl 文件路径
        place_id: 云端 Place ID
        
    Returns:
        (success, message)
    """
    success, msg, session = get_session_universal(place_path, place_id)
    if not success:
        return False, msg

    try:
        subprocess.run(
            ["taskkill", "/F", "/PID", str(session.pid)],
            capture_output=True,
            timeout=10.0
        )
        
        # 如果是本地文件，删除 .lock 文件
        if place_path and not place_path.startswith("cloud:"):
            lock_path = place_path + ".lock"
            for _ in range(3):
                time.sleep(0.2)
                if os.path.exists(lock_path):
                    try:
                        os.remove(lock_path)
                        break
                    except Exception:
                        pass
        
        return True, f"Studio 已关闭 (PID: {session.pid})"
    except Exception as e:
        return False, f"关闭 Studio 失败: {e}"


# 兼容旧接口
def get_session(place_path: str) -> tuple[bool, str, Optional[SessionInfo]]:
    """兼容旧接口，使用 get_session_universal"""
    return get_session_universal(place_path=place_path)
