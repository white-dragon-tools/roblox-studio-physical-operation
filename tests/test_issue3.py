"""
测试脚本：验证 Issue #3 的新功能

功能:
1. 日期限定查询 (start_date, end_date)
2. hasError 工具
3. 客户端/服务端日志区分
"""

import sys
import os
import io

# 设置 UTF-8 输出
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
sys.stdout.reconfigure(line_buffering=True)

# 添加项目路径
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from roblox_studio_physical_operation_mcp.log_utils import (
    parse_log_line,
    parse_timestamp,
    is_timestamp_in_range,
    is_error_log,
    build_game_state_index,
    get_run_context_for_line,
    get_logs_from_line,
    find_errors,
    LogEntry,
    LOG_DIR
)


def test_parse_timestamp():
    """测试时间戳解析"""
    print("\n" + "=" * 60)
    print("[TEST] parse_timestamp")
    print("=" * 60)
    
    # ISO 格式
    ts1 = parse_timestamp("2026-02-03T08:52:02.095Z")
    assert ts1 is not None, "Failed to parse ISO timestamp with milliseconds"
    print(f"  ✓ ISO with ms: {ts1}")
    
    # ISO 格式无毫秒
    ts2 = parse_timestamp("2026-02-03T08:52:02Z")
    assert ts2 is not None, "Failed to parse ISO timestamp without milliseconds"
    print(f"  ✓ ISO without ms: {ts2}")
    
    # 日期格式
    ts3 = parse_timestamp("2026-02-03")
    assert ts3 is not None, "Failed to parse date only"
    print(f"  ✓ Date only: {ts3}")
    
    # 无效格式
    ts4 = parse_timestamp("invalid")
    assert ts4 is None, "Should return None for invalid format"
    print(f"  ✓ Invalid format returns None")
    
    print("  [PASS] parse_timestamp")
    return True


def test_is_timestamp_in_range():
    """测试时间戳范围检查"""
    print("\n" + "=" * 60)
    print("[TEST] is_timestamp_in_range")
    print("=" * 60)
    
    timestamp = "2026-02-03T12:30:00.000Z"
    
    # 无范围限制
    assert is_timestamp_in_range(timestamp) == True
    print("  ✓ No range: True")
    
    # 在范围内
    assert is_timestamp_in_range(timestamp, start_date="2026-02-03") == True
    print("  ✓ Same day start: True")
    
    assert is_timestamp_in_range(timestamp, end_date="2026-02-03") == True
    print("  ✓ Same day end: True")
    
    assert is_timestamp_in_range(timestamp, start_date="2026-02-01", end_date="2026-02-05") == True
    print("  ✓ Within range: True")
    
    # 超出范围
    assert is_timestamp_in_range(timestamp, start_date="2026-02-04") == False
    print("  ✓ Before start: False")
    
    assert is_timestamp_in_range(timestamp, end_date="2026-02-02") == False
    print("  ✓ After end: False")
    
    # 精确时间范围
    assert is_timestamp_in_range(timestamp, start_date="2026-02-03T12:00:00", end_date="2026-02-03T13:00:00") == True
    print("  ✓ Within time range: True")
    
    assert is_timestamp_in_range(timestamp, start_date="2026-02-03T13:00:00") == False
    print("  ✓ Before time start: False")
    
    print("  [PASS] is_timestamp_in_range")
    return True


def test_is_error_log():
    """测试错误日志判断"""
    print("\n" + "=" * 60)
    print("[TEST] is_error_log")
    print("=" * 60)
    
    # Warning 级别
    entry1 = LogEntry(
        timestamp="2026-02-03T12:00:00.000Z",
        level="Warning",
        category="FLog::Output",
        message="Test warning",
        raw=""
    )
    assert is_error_log(entry1) == True
    print("  ✓ Warning level: True")
    
    # Error 级别
    entry2 = LogEntry(
        timestamp="2026-02-03T12:00:00.000Z",
        level="Error",
        category="FLog::Output",
        message="Test error",
        raw=""
    )
    assert is_error_log(entry2) == True
    print("  ✓ Error level: True")
    
    # FLog::Warning 类别
    entry3 = LogEntry(
        timestamp="2026-02-03T12:00:00.000Z",
        level="Info",
        category="FLog::Warning",
        message="Test warning category",
        raw=""
    )
    assert is_error_log(entry3) == True
    print("  ✓ FLog::Warning category: True")
    
    # 普通日志
    entry4 = LogEntry(
        timestamp="2026-02-03T12:00:00.000Z",
        level="Info",
        category="FLog::Output",
        message="Normal log",
        raw=""
    )
    assert is_error_log(entry4) == False
    print("  ✓ Normal log: False")
    
    print("  [PASS] is_error_log")
    return True


def test_parse_log_line():
    """测试日志行解析"""
    print("\n" + "=" * 60)
    print("[TEST] parse_log_line")
    print("=" * 60)
    
    # 标准格式
    line1 = "2026-02-03T08:52:02.095Z,128.095795,1996c,12 [FLog::Output] Hello world"
    entry1 = parse_log_line(line1, 100)
    assert entry1 is not None
    assert entry1.timestamp == "2026-02-03T08:52:02.095Z"
    assert entry1.category == "FLog::Output"
    assert entry1.message == "Hello world"
    assert entry1.line_num == 100
    print(f"  ✓ Standard format: {entry1.message}")
    
    # 带级别的格式
    line2 = "2026-02-03T08:52:04.244Z,130.244095,12f4,6,Warning [FLog::Output] Warning message"
    entry2 = parse_log_line(line2, 200)
    assert entry2 is not None
    assert entry2.level == "Warning"
    assert entry2.message == "Warning message"
    print(f"  ✓ With level: {entry2.level} - {entry2.message}")
    
    # 无效格式
    line3 = "Invalid log line"
    entry3 = parse_log_line(line3)
    assert entry3 is None
    print("  ✓ Invalid format returns None")
    
    print("  [PASS] parse_log_line")
    return True


def test_with_real_log():
    """使用真实日志文件测试"""
    print("\n" + "=" * 60)
    print("[TEST] Real log file tests")
    print("=" * 60)
    
    # 查找最新的日志文件
    if not os.path.exists(LOG_DIR):
        print(f"  [SKIP] Log directory not found: {LOG_DIR}")
        return True
    
    log_files = [f for f in os.listdir(LOG_DIR) if "Studio" in f and f.endswith(".log")]
    if not log_files:
        print("  [SKIP] No Studio log files found")
        return True
    
    # 按修改时间排序，取最新的
    log_files.sort(key=lambda f: os.path.getmtime(os.path.join(LOG_DIR, f)), reverse=True)
    log_path = os.path.join(LOG_DIR, log_files[0])
    print(f"  Using log file: {log_files[0]}")
    
    # 测试 build_game_state_index
    print("\n  --- build_game_state_index ---")
    state_ranges = build_game_state_index(log_path)
    print(f"  Found {len(state_ranges)} game state ranges:")
    for i, r in enumerate(state_ranges[:5]):  # 只显示前5个
        print(f"    {i+1}. {r.state}: lines {r.start_line}-{r.end_line if r.end_line > 0 else 'EOF'}")
    if len(state_ranges) > 5:
        print(f"    ... and {len(state_ranges) - 5} more")
    
    # 测试 get_logs_from_line 带日期过滤
    print("\n  --- get_logs_from_line with date filter ---")
    result = get_logs_from_line(
        log_path,
        start_date="2026-02-03",
        timestamps=True,
        include_context=True
    )
    log_lines = result.get("logs", "").split("\n")[:5]
    print(f"  Found {result.get('remaining', 0) + len(log_lines)} logs")
    print(f"  First 5 lines:")
    for line in log_lines:
        if line:
            print(f"    {line[:100]}...")
    
    # 测试 get_logs_from_line 带 context 过滤
    print("\n  --- get_logs_from_line with context filter ---")
    for ctx in ["server", "client", "edit"]:
        result = get_logs_from_line(
            log_path,
            run_context=ctx,
            timestamps=True
        )
        count = len(result.get("logs", "").split("\n")) if result.get("logs") else 0
        remaining = result.get("remaining", 0)
        print(f"  Context '{ctx}': {count + remaining} logs")
    
    # 测试 find_errors
    print("\n  --- find_errors ---")
    errors = find_errors(log_path, max_errors=10)
    print(f"  has_error: {errors.get('has_error')}")
    print(f"  error_count: {errors.get('error_count')}")
    if errors.get('errors'):
        print(f"  First error: {errors['errors'][0].get('message', '')[:80]}...")
    
    print("\n  [PASS] Real log file tests")
    return True


def main():
    print("=" * 60)
    print("Issue #3 功能测试")
    print("=" * 60)
    print("测试内容:")
    print("  1. 日期限定查询 (start_date, end_date)")
    print("  2. hasError 工具")
    print("  3. 客户端/服务端日志区分")
    
    all_passed = True
    
    try:
        all_passed &= test_parse_timestamp()
    except Exception as e:
        print(f"  [FAIL] parse_timestamp: {e}")
        all_passed = False
    
    try:
        all_passed &= test_is_timestamp_in_range()
    except Exception as e:
        print(f"  [FAIL] is_timestamp_in_range: {e}")
        all_passed = False
    
    try:
        all_passed &= test_is_error_log()
    except Exception as e:
        print(f"  [FAIL] is_error_log: {e}")
        all_passed = False
    
    try:
        all_passed &= test_parse_log_line()
    except Exception as e:
        print(f"  [FAIL] parse_log_line: {e}")
        all_passed = False
    
    try:
        all_passed &= test_with_real_log()
    except Exception as e:
        print(f"  [FAIL] Real log tests: {e}")
        import traceback
        traceback.print_exc()
        all_passed = False
    
    print("\n" + "=" * 60)
    if all_passed:
        print("所有测试通过! ✓")
    else:
        print("部分测试失败! ✗")
    print("=" * 60)
    
    return 0 if all_passed else 1


if __name__ == "__main__":
    sys.exit(main())
