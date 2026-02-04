"""
测试脚本：验证 warn 日志修复
Issue #1: 看不到 roblox 运行后的警告日志
"""

import sys
import os
import time

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from roblox_studio_physical_operation_mcp.server import (
    studio_list, game_start, game_stop, logs_get
)

PLACE_PATH = os.path.join(os.path.dirname(__file__), "game.rbxl")


def main():
    print("=" * 60)
    print("Issue #1 Fix Verification")
    print("=" * 60)
    
    # 查找我们的测试实例
    instances = studio_list()
    our_instance = None
    for inst in instances:
        if inst.get("place_path") and "game.rbxl" in inst.get("place_path", ""):
            our_instance = inst
            break
    
    if not our_instance:
        print("Error: Test game.rbxl not running!")
        print(f"Running instances: {instances}")
        return
    
    print(f"Found test instance: PID={our_instance['pid']}")
    
    # 重新开始游戏
    print("\n[1] Restart game (F5)...")
    game_stop(place_path=PLACE_PATH)
    time.sleep(2)
    game_start(place_path=PLACE_PATH)
    time.sleep(5)
    
    # 获取日志
    print("\n[2] Get logs (after fix)...")
    logs = logs_get(place_path=PLACE_PATH)
    log_text = logs.get("logs", "")
    
    print("-" * 40)
    # 只打印测试相关的行
    for line in log_text.split("\n"):
        if "[TEST]" in line or "=====" in line:
            print(line)
    print("-" * 40)
    
    # 验证
    print("\n[3] Verification:")
    has_print = "print" in log_text and "[TEST]" in log_text
    has_warn = "warn" in log_text and "[TEST]" in log_text
    
    print(f"    print messages: {'VISIBLE' if has_print else 'NOT VISIBLE'}")
    print(f"    warn messages:  {'VISIBLE' if has_warn else 'NOT VISIBLE'}")
    
    if has_print and has_warn:
        print("\n    SUCCESS: Issue #1 is FIXED!")
    elif has_print and not has_warn:
        print("\n    FAILED: warn still filtered!")
    else:
        print("\n    UNKNOWN: Check output above")
    
    print("\n" + "=" * 60)


if __name__ == "__main__":
    main()
