"""
日志工具模块: 日志读取、搜索等

优化:
- 从文件末尾倒序读取，适合大文件
- 支持过滤特定类别 (如 FLog::Output)
- 支持日期范围过滤
- 支持错误检测
- 支持客户端/服务端日志区分
"""

import os
import sys
import re
from datetime import datetime
from typing import Optional, Generator, Literal
from dataclasses import dataclass, field

if sys.platform == "win32":
    LOG_DIR = os.path.expandvars(r"%LOCALAPPDATA%\Roblox\logs")
elif sys.platform == "darwin":
    LOG_DIR = os.path.expanduser("~/Library/Logs/Roblox")
else:
    LOG_DIR = os.path.expanduser("~/.local/share/Roblox/logs")

# 默认读取这些类别的日志（包含用户脚本的 print, warn, error 输出）
DEFAULT_CATEGORIES = ["FLog::Output", "FLog::Warning", "FLog::Error"]

# 错误类别（用于 hasError 检测）
ERROR_CATEGORIES = ["FLog::Warning", "FLog::Error", "DFLog::HttpTraceError"]

# 运行上下文类型
RunContext = Literal["play", "edit", "unknown"]


@dataclass
class LogEntry:
    timestamp: str
    level: str
    category: str
    message: str
    raw: str
    line_num: int = 0
    run_context: RunContext = "unknown"


def parse_log_line(line: str, line_num: int = 0) -> Optional[LogEntry]:
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
            raw=line,
            line_num=line_num
        )
    return None


def parse_timestamp(timestamp_str: str) -> Optional[datetime]:
    """
    解析时间戳字符串为 datetime 对象
    
    支持格式:
    - ISO 格式: 2026-02-03T08:52:02.095Z
    - 日期格式: 2026-02-03
    - 日期时间格式: 2026-02-03T08:52:02
    """
    formats = [
        "%Y-%m-%dT%H:%M:%S.%fZ",  # ISO with milliseconds
        "%Y-%m-%dT%H:%M:%SZ",     # ISO without milliseconds
        "%Y-%m-%dT%H:%M:%S",      # datetime without Z
        "%Y-%m-%d",               # date only
    ]
    
    for fmt in formats:
        try:
            return datetime.strptime(timestamp_str, fmt)
        except ValueError:
            continue
    return None


def is_timestamp_in_range(
    timestamp: str,
    start_date: str = None,
    end_date: str = None
) -> bool:
    """
    检查时间戳是否在指定日期范围内
    
    Args:
        timestamp: ISO 格式时间戳 (如 2026-02-03T08:52:02.095Z)
        start_date: 开始日期 (如 2026-02-03 或 2026-02-03T08:00:00)
        end_date: 结束日期 (如 2026-02-03 或 2026-02-03T23:59:59)
        
    Returns:
        True 如果在范围内，False 否则
    """
    if not start_date and not end_date:
        return True
    
    ts = parse_timestamp(timestamp)
    if not ts:
        return False
    
    if start_date:
        start = parse_timestamp(start_date)
        if start and ts < start:
            return False
    
    if end_date:
        end = parse_timestamp(end_date)
        if end:
            # 如果只提供日期，则包含整天
            if len(end_date) == 10:  # YYYY-MM-DD format
                end = end.replace(hour=23, minute=59, second=59, microsecond=999999)
            if ts > end:
                return False
    
    return True


def is_error_log(entry: LogEntry) -> bool:
    """
    判断日志条目是否为错误日志
    
    错误判断条件:
    1. 类别为 FLog::Warning, FLog::Error, DFLog::HttpTraceError 等
    2. 级别为 Warning 或 Error
    """
    # 类别判断
    if entry.category in ERROR_CATEGORIES:
        return True
    
    # 级别判断
    if entry.level.lower() in ("warning", "error"):
        return True
    
    return False


@dataclass
class GameStateRange:
    """游戏状态时间范围"""
    state: str  # PlayServer, PlayClient, Edit
    start_line: int
    end_line: int = -1  # -1 表示到文件末尾
    start_time: str = ""
    end_time: str = ""


def build_game_state_index(log_path: str) -> list[GameStateRange]:
    """
    构建游戏状态索引，用于区分客户端/服务端日志
    
    通过解析 [FLog::AssetDataModelManager] Setting StudioGameStateType to ... 日志
    来确定每个时间段的运行上下文
    
    Returns:
        游戏状态范围列表
    """
    if not os.path.exists(log_path):
        return []
    
    ranges = []
    current_state = "Edit"
    current_start_line = 1
    current_start_time = ""
    
    pattern = re.compile(r'Setting StudioGameStateType to StudioGameStateType_(\w+)')
    
    try:
        with open(log_path, 'r', encoding='utf-8', errors='ignore') as f:
            for line_num, line in enumerate(f, 1):
                if 'AssetDataModelManager' not in line:
                    continue
                
                match = pattern.search(line)
                if match:
                    new_state = match.group(1)
                    
                    # 提取时间戳
                    entry = parse_log_line(line.strip(), line_num)
                    timestamp = entry.timestamp if entry else ""
                    
                    # 保存前一个状态范围
                    if current_start_line > 0:
                        ranges.append(GameStateRange(
                            state=current_state,
                            start_line=current_start_line,
                            end_line=line_num - 1,
                            start_time=current_start_time,
                            end_time=timestamp
                        ))
                    
                    # 开始新状态
                    current_state = new_state
                    current_start_line = line_num
                    current_start_time = timestamp
    except Exception:
        pass
    
    # 添加最后一个状态范围
    if current_start_line > 0:
        ranges.append(GameStateRange(
            state=current_state,
            start_line=current_start_line,
            end_line=-1,
            start_time=current_start_time,
            end_time=""
        ))
    
    return ranges


def get_run_context_for_line(line_num: int, state_ranges: list[GameStateRange]) -> RunContext:
    """
    根据行号获取运行上下文
    
    Args:
        line_num: 行号
        state_ranges: 游戏状态范围列表
        
    Returns:
        运行上下文: "play", "edit", "unknown"
    """
    for range_info in state_ranges:
        if range_info.start_line <= line_num:
            if range_info.end_line == -1 or line_num <= range_info.end_line:
                state = range_info.state.lower()
                if "server" in state or "client" in state:
                    return "play"
                elif "edit" in state:
                    return "edit"
    return "unknown"


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
    start_date: str = None,
    end_date: str = None,
    timestamps: bool = False,
    categories: list[str] = None,
    apply_filter: bool = True,
    run_context: RunContext = None,
    include_context: bool = False
) -> dict:
    """
    从指定行范围读取日志
    
    Args:
        log_path: 日志文件路径
        after_line: 从哪一行之后开始读取，None 表示从头开始
        before_line: 到哪一行之前结束，None 表示到末尾
        start_date: 开始日期 (如 2026-02-03 或 2026-02-03T08:00:00)
        end_date: 结束日期 (如 2026-02-03 或 2026-02-03T23:59:59)
        timestamps: 是否附加时间戳
        categories: 只返回这些类别的日志，默认 ["FLog::Output"]
        apply_filter: 是否应用过滤规则排除 Studio 内部日志
        run_context: 只返回指定运行上下文的日志 ("server", "client", "edit")
        include_context: 是否在输出中包含运行上下文标识
        
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
    
    # 如果需要过滤运行上下文或包含上下文信息，构建状态索引
    state_ranges = []
    if run_context or include_context:
        state_ranges = build_game_state_index(log_path)
    
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
                
                entry = parse_log_line(line, line_num)
                if not entry:
                    continue
                
                # 类别过滤
                if categories and entry.category not in categories:
                    continue
                
                # 应用排除规则
                if apply_filter and should_exclude(entry.message):
                    continue
                
                # 日期范围过滤
                if start_date or end_date:
                    if not is_timestamp_in_range(entry.timestamp, start_date, end_date):
                        continue
                
                # 运行上下文过滤
                if run_context or include_context:
                    ctx = get_run_context_for_line(line_num, state_ranges)
                    entry.run_context = ctx
                    if run_context and ctx != run_context:
                        continue
                
                # 这是一条有效日志
                remaining += 1
                
                # 如果已超过字节限制，只统计不添加
                if bytes_exceeded:
                    continue
                
                # 格式化输出
                parts = []
                if include_context:
                    ctx_label = {"play": "[P]", "edit": "[E]", "unknown": "[?]"}
                    parts.append(ctx_label.get(entry.run_context, "[?]"))
                if timestamps:
                    time_part = entry.timestamp[11:19]
                    parts.append(f"[{time_part}]")
                parts.append(entry.message)
                output_line = " ".join(parts)
                
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
    apply_filter: bool = True,
    start_date: str = None,
    end_date: str = None,
    run_context: RunContext = None
) -> list[LogEntry]:
    """
    从日志文件末尾读取最近的日志

    Args:
        log_path: 日志文件路径
        limit: 返回的最大条数
        categories: 只返回这些类别的日志，默认 ["FLog::Output"]
        min_level: 最低日志级别过滤
        apply_filter: 是否应用过滤规则排除 Studio 内部日志，默认 True
        start_date: 开始日期过滤
        end_date: 结束日期过滤
        run_context: 只返回指定运行上下文的日志

    Returns:
        日志条目列表 (按时间正序)
    """
    if not os.path.exists(log_path):
        return []

    if categories is None:
        categories = DEFAULT_CATEGORIES

    # 如果需要过滤运行上下文，构建状态索引
    state_ranges = []
    if run_context:
        state_ranges = build_game_state_index(log_path)

    entries = []
    line_num = 0
    
    # 先计算总行数（用于倒序读取时的行号计算）
    try:
        with open(log_path, 'r', encoding='utf-8', errors='ignore') as f:
            line_num = sum(1 for _ in f)
    except Exception:
        pass
    
    try:
        for line in read_file_reverse(log_path):
            entry = parse_log_line(line, line_num)
            line_num -= 1
            
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

            # 日期范围过滤
            if start_date or end_date:
                if not is_timestamp_in_range(entry.timestamp, start_date, end_date):
                    continue

            # 运行上下文过滤
            if run_context:
                ctx = get_run_context_for_line(entry.line_num, state_ranges)
                entry.run_context = ctx
                if ctx != run_context:
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
    start_date: str = None,
    end_date: str = None,
    timestamps: bool = False,
    categories: list[str] = None,
    apply_filter: bool = True,
    run_context: RunContext = None,
    include_context: bool = False
) -> dict:
    """
    在指定行范围内搜索日志
    
    Args:
        log_path: 日志文件路径
        pattern: 正则表达式模式
        after_line: 从哪一行之后开始搜索
        before_line: 到哪一行之前结束
        start_date: 开始日期 (如 2026-02-03)
        end_date: 结束日期 (如 2026-02-03)
        timestamps: 是否附加时间戳
        categories: 只搜索这些类别，默认 ["FLog::Output"]
        apply_filter: 是否应用过滤规则
        run_context: 只返回指定运行上下文的日志
        include_context: 是否在输出中包含运行上下文标识
        
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
    
    # 如果需要过滤运行上下文或包含上下文信息，构建状态索引
    state_ranges = []
    if run_context or include_context:
        state_ranges = build_game_state_index(log_path)
    
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
                
                entry = parse_log_line(line, line_num)
                if not entry:
                    continue
                
                if categories and entry.category not in categories:
                    continue
                
                if apply_filter and should_exclude(entry.message):
                    continue
                
                # 日期范围过滤
                if start_date or end_date:
                    if not is_timestamp_in_range(entry.timestamp, start_date, end_date):
                        continue
                
                # 运行上下文过滤
                if run_context or include_context:
                    ctx = get_run_context_for_line(line_num, state_ranges)
                    entry.run_context = ctx
                    if run_context and ctx != run_context:
                        continue
                
                # 正则匹配
                if not regex.search(entry.message):
                    continue
                
                match_count += 1
                
                if bytes_exceeded:
                    continue
                
                # 格式化输出
                parts = [f"{line_num}|"]
                if include_context:
                    ctx_label = {"play": "[P]", "edit": "[E]", "unknown": "[?]"}
                    parts.append(ctx_label.get(entry.run_context, "[?]"))
                if timestamps:
                    time_part = entry.timestamp[11:19]
                    parts.append(f"[{time_part}]")
                parts.append(entry.message)
                output_line = " ".join(parts)
                
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


def find_errors(
    log_path: str,
    after_line: int = None,
    before_line: int = None,
    start_date: str = None,
    end_date: str = None,
    run_context: RunContext = None,
    max_errors: int = 100
) -> dict:
    """
    在指定范围内查找错误日志
    
    Args:
        log_path: 日志文件路径
        after_line: 从哪一行之后开始搜索
        before_line: 到哪一行之前结束
        start_date: 开始日期 (如 2026-02-03)
        end_date: 结束日期 (如 2026-02-03)
        run_context: 只返回指定运行上下文的错误
        max_errors: 最大返回错误数，默认 100
        
    Returns:
        {
            "has_error": bool,
            "error_count": int,
            "errors": [
                {
                    "line": 行号,
                    "timestamp": 时间戳,
                    "message": 错误内容,
                    "category": 日志类别,
                    "level": 日志级别,
                    "context": 运行上下文 (server/client/edit)
                },
                ...
            ]
        }
    """
    if not os.path.exists(log_path):
        return {"has_error": False, "error_count": 0, "errors": []}
    
    # 构建状态索引
    state_ranges = build_game_state_index(log_path) if run_context else []
    
    errors = []
    total_errors = 0
    
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
                
                entry = parse_log_line(line, line_num)
                if not entry:
                    continue
                
                # 检查是否为错误日志
                if not is_error_log(entry):
                    continue
                
                # 排除 Studio 内部的警告日志
                if should_exclude(entry.message):
                    continue
                
                # 日期范围过滤
                if start_date or end_date:
                    if not is_timestamp_in_range(entry.timestamp, start_date, end_date):
                        continue
                
                # 运行上下文过滤
                ctx = "unknown"
                if state_ranges:
                    ctx = get_run_context_for_line(line_num, state_ranges)
                    if run_context and ctx != run_context:
                        continue
                
                total_errors += 1
                
                # 只保存前 max_errors 个错误的详细信息
                if len(errors) < max_errors:
                    errors.append({
                        "line": line_num,
                        "timestamp": entry.timestamp,
                        "message": entry.message,
                        "category": entry.category,
                        "level": entry.level,
                        "context": ctx
                    })
                
    except Exception:
        pass
    
    return {
        "has_error": total_errors > 0,
        "error_count": total_errors,
        "errors": errors
    }


def get_logs_by_date(
    log_path: str,
    start_date: str = None,
    end_date: str = None,
    timestamps: bool = True,
    categories: list[str] = None,
    apply_filter: bool = True,
    run_context: RunContext = None,
    include_context: bool = False
) -> dict:
    """
    按日期范围获取日志（便捷函数）
    
    Args:
        log_path: 日志文件路径
        start_date: 开始日期 (如 2026-02-03 或 2026-02-03T08:00:00)
        end_date: 结束日期 (如 2026-02-03 或 2026-02-03T23:59:59)
        timestamps: 是否附加时间戳，默认 True
        categories: 只返回这些类别的日志
        apply_filter: 是否应用过滤规则
        run_context: 只返回指定运行上下文的日志
        include_context: 是否在输出中包含运行上下文标识
        
    Returns:
        与 get_logs_from_line 相同的返回格式
    """
    return get_logs_from_line(
        log_path=log_path,
        after_line=None,
        before_line=None,
        start_date=start_date,
        end_date=end_date,
        timestamps=timestamps,
        categories=categories,
        apply_filter=apply_filter,
        run_context=run_context,
        include_context=include_context
    )
