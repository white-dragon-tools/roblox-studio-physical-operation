"""
日志工具模块: 日志读取、搜索等

优化:
- 从文件末尾倒序读取，适合大文件
- 支持过滤特定类别 (如 FLog::Output)
"""

import os
import re
from typing import Optional, Generator
from dataclasses import dataclass

LOG_DIR = os.path.expandvars(r"%LOCALAPPDATA%\Roblox\logs")

# 默认只读取这些类别的日志
DEFAULT_CATEGORIES = ["FLog::Output"]


@dataclass
class LogEntry:
    timestamp: str
    level: str
    category: str
    message: str
    raw: str


def parse_log_line(line: str) -> Optional[LogEntry]:
    """解析单行日志"""
    # 格式: 2026-02-03T08:52:02.095Z,128.095795,1996c,12 [DFLog::HttpTraceError] message
    # 或: 2026-02-03T08:52:04.244Z,130.244095,12f4,6,Info [FLog::...] message
    match = re.match(
        r'^(\d{4}-\d{2}-\d{2}T[\d:.]+Z),[\d.]+,[a-f0-9]+,\d+(?:,(\w+))?\s*\[([^\]]+)\]\s*(.*)$',
        line
    )
    if match:
        return LogEntry(
            timestamp=match.group(1),
            level=match.group(2) or "Info",
            category=match.group(3),
            message=match.group(4),
            raw=line
        )
    return None


def read_file_reverse(file_path: str, chunk_size: int = 8192) -> Generator[str, None, None]:
    """
    从文件末尾倒序读取行

    对于大文件，这比读取整个文件再 reverse 更高效
    """
    with open(file_path, 'rb') as f:
        # 移动到文件末尾
        f.seek(0, 2)
        file_size = f.tell()

        buffer = b''
        position = file_size

        while position > 0:
            # 计算读取位置
            read_size = min(chunk_size, position)
            position -= read_size
            f.seek(position)

            # 读取并拼接
            chunk = f.read(read_size)
            buffer = chunk + buffer

            # 按行分割
            lines = buffer.split(b'\n')

            # 最后一个可能不完整，保留到下次
            buffer = lines[0]

            # 倒序返回完整的行
            for line in reversed(lines[1:]):
                line_str = line.decode('utf-8', errors='ignore').strip()
                if line_str:
                    yield line_str

        # 处理剩余的 buffer
        if buffer:
            line_str = buffer.decode('utf-8', errors='ignore').strip()
            if line_str:
                yield line_str


from .log_filter import should_exclude


def get_logs_from_line(
    log_path: str,
    after_line: int = None,
    before_line: int = None,
    timestamps: bool = False,
    categories: list[str] = None,
    apply_filter: bool = True
) -> dict:
    """
    从指定行范围读取日志
    
    Args:
        log_path: 日志文件路径
        after_line: 从哪一行之后开始读取，None 表示从头开始
        before_line: 到哪一行之前结束，None 表示到末尾
        timestamps: 是否附加时间戳
        categories: 只返回这些类别的日志，默认 ["FLog::Output"]
        apply_filter: 是否应用过滤规则排除 Studio 内部日志
        
    Returns:
        {
            "logs": "日志文本",
            "start_line": 起始行号,
            "last_line": 最后行号,
            "remaining": 剩余有效日志行数,
            "has_more": 是否还有更多
        }
    """
    MAX_BYTES = 32000
    
    if not os.path.exists(log_path):
        return {"logs": "", "start_line": 0, "last_line": 0, "remaining": 0, "has_more": False}
    
    if categories is None:
        categories = DEFAULT_CATEGORIES
    
    start_line = None
    last_line = 0
    current_bytes = 0
    log_lines = []
    remaining = 0
    bytes_exceeded = False
    
    try:
        with open(log_path, 'r', encoding='utf-8', errors='ignore') as f:
            for line_num, line in enumerate(f, 1):
                # 跳过 after_line 之前的行
                if after_line is not None and line_num <= after_line:
                    continue
                
                # 停止在 before_line
                if before_line is not None and line_num >= before_line:
                    break
                
                line = line.strip()
                if not line:
                    continue
                
                entry = parse_log_line(line)
                if not entry:
                    continue
                
                # 类别过滤
                if categories and entry.category not in categories:
                    continue
                
                # 应用排除规则
                if apply_filter and should_exclude(entry.message):
                    continue
                
                # 这是一条有效日志
                remaining += 1
                
                # 如果已超过字节限制，只统计不添加
                if bytes_exceeded:
                    continue
                
                # 格式化输出
                if timestamps:
                    time_part = entry.timestamp[11:19]
                    output_line = f"[{time_part}] {entry.message}"
                else:
                    output_line = entry.message
                
                line_bytes = len(output_line.encode('utf-8')) + 1
                
                # 检查是否超过字节限制
                if current_bytes + line_bytes > MAX_BYTES and log_lines:
                    bytes_exceeded = True
                    continue
                
                if start_line is None:
                    start_line = line_num
                
                log_lines.append(output_line)
                last_line = line_num
                current_bytes += line_bytes
                
    except Exception:
        pass
    
    returned_count = len(log_lines)
    return {
        "logs": "\n".join(log_lines),
        "start_line": start_line or 0,
        "last_line": last_line,
        "remaining": remaining - returned_count,
        "has_more": remaining > returned_count
    }


def get_recent_logs(
    log_path: str,
    limit: int = 100,
    categories: list[str] = None,
    min_level: Optional[str] = None,
    apply_filter: bool = True
) -> list[LogEntry]:
    """
    从日志文件末尾读取最近的日志

    Args:
        log_path: 日志文件路径
        limit: 返回的最大条数
        categories: 只返回这些类别的日志，默认 ["FLog::Output"]
        min_level: 最低日志级别过滤
        apply_filter: 是否应用过滤规则排除 Studio 内部日志，默认 True

    Returns:
        日志条目列表 (按时间正序)
    """
    if not os.path.exists(log_path):
        return []

    if categories is None:
        categories = DEFAULT_CATEGORIES

    entries = []
    try:
        for line in read_file_reverse(log_path):
            entry = parse_log_line(line)
            if not entry:
                continue

            # 类别过滤
            if categories and entry.category not in categories:
                continue

            # 级别过滤
            if min_level and entry.level.lower() != min_level.lower():
                continue

            # 应用排除规则
            if apply_filter and should_exclude(entry.message):
                continue

            entries.append(entry)
            if len(entries) >= limit:
                break
    except Exception:
        pass

    # 返回正序 (最旧的在前)
    return list(reversed(entries))


def get_all_logs(
    log_path: str,
    limit: int = 100,
    min_level: Optional[str] = None
) -> list[LogEntry]:
    """
    获取所有类别的日志 (不过滤类别)
    """
    return get_recent_logs(log_path, limit, categories=[], min_level=min_level)


def search_logs(
    log_path: str,
    pattern: str,
    limit: int = 50,
    categories: list[str] = None
) -> list[LogEntry]:
    """
    在日志中搜索匹配的条目

    Args:
        log_path: 日志文件路径
        pattern: 正则表达式模式
        limit: 返回的最大条数
        categories: 只搜索这些类别，None 表示搜索所有
    """
    if not os.path.exists(log_path):
        return []

    entries = []
    regex = re.compile(pattern, re.IGNORECASE)

    try:
        for line in read_file_reverse(log_path):
            if not regex.search(line):
                continue

            entry = parse_log_line(line)
            if not entry:
                continue

            if categories and entry.category not in categories:
                continue

            entries.append(entry)
            if len(entries) >= limit:
                break
    except Exception:
        pass

    return list(reversed(entries))


def search_logs_from_line(
    log_path: str,
    pattern: str,
    after_line: int = None,
    before_line: int = None,
    timestamps: bool = False,
    categories: list[str] = None,
    apply_filter: bool = True
) -> dict:
    """
    在指定行范围内搜索日志
    
    Args:
        log_path: 日志文件路径
        pattern: 正则表达式模式
        after_line: 从哪一行之后开始搜索
        before_line: 到哪一行之前结束
        timestamps: 是否附加时间戳
        categories: 只搜索这些类别，默认 ["FLog::Output"]
        apply_filter: 是否应用过滤规则
        
    Returns:
        {
            "logs": "匹配的日志文本",
            "start_line": 起始行号,
            "last_line": 最后行号,
            "match_count": 匹配条数,
            "remaining": 剩余匹配数,
            "has_more": 是否还有更多
        }
    """
    MAX_BYTES = 32000
    
    if not os.path.exists(log_path):
        return {"logs": "", "start_line": 0, "last_line": 0, "match_count": 0, "remaining": 0, "has_more": False}
    
    if categories is None:
        categories = DEFAULT_CATEGORIES
    
    try:
        regex = re.compile(pattern, re.IGNORECASE)
    except re.error:
        return {"error": f"Invalid regex pattern: {pattern}"}
    
    start_line = None
    last_line = 0
    current_bytes = 0
    log_lines = []
    match_count = 0
    bytes_exceeded = False
    
    try:
        with open(log_path, 'r', encoding='utf-8', errors='ignore') as f:
            for line_num, line in enumerate(f, 1):
                if after_line is not None and line_num <= after_line:
                    continue
                
                if before_line is not None and line_num >= before_line:
                    break
                
                line = line.strip()
                if not line:
                    continue
                
                entry = parse_log_line(line)
                if not entry:
                    continue
                
                if categories and entry.category not in categories:
                    continue
                
                if apply_filter and should_exclude(entry.message):
                    continue
                
                # 正则匹配
                if not regex.search(entry.message):
                    continue
                
                match_count += 1
                
                if bytes_exceeded:
                    continue
                
                if timestamps:
                    time_part = entry.timestamp[11:19]
                    output_line = f"{line_num}|[{time_part}] {entry.message}"
                else:
                    output_line = f"{line_num}|{entry.message}"
                
                line_bytes = len(output_line.encode('utf-8')) + 1
                
                if current_bytes + line_bytes > MAX_BYTES and log_lines:
                    bytes_exceeded = True
                    continue
                
                if start_line is None:
                    start_line = line_num
                
                log_lines.append(output_line)
                last_line = line_num
                current_bytes += line_bytes
                
    except Exception:
        pass
    
    returned_count = len(log_lines)
    return {
        "logs": "\n".join(log_lines),
        "start_line": start_line or 0,
        "last_line": last_line,
        "match_count": returned_count,
        "remaining": match_count - returned_count,
        "has_more": match_count > returned_count
    }


def find_latest_studio_log() -> Optional[str]:
    """查找最新的 Studio 日志文件"""
    if not os.path.exists(LOG_DIR):
        return None

    studio_logs = []
    for f in os.listdir(LOG_DIR):
        if "Studio" in f and f.endswith(".log"):
            path = os.path.join(LOG_DIR, f)
            studio_logs.append((path, os.path.getmtime(path)))

    if not studio_logs:
        return None

    studio_logs.sort(key=lambda x: x[1], reverse=True)
    return studio_logs[0][0]


def clean_old_logs(days: int = 7) -> int:
    """清理超过指定天数的旧日志"""
    if not os.path.exists(LOG_DIR):
        return 0

    from datetime import datetime
    count = 0
    now = datetime.now().timestamp()
    threshold = days * 24 * 60 * 60

    for f in os.listdir(LOG_DIR):
        if f.endswith(".log"):
            path = os.path.join(LOG_DIR, f)
            try:
                if now - os.path.getmtime(path) > threshold:
                    os.remove(path)
                    count += 1
            except Exception:
                pass

    return count
