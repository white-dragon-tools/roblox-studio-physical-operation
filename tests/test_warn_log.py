"""
测试脚本：验证 warn 日志是否能被捕获
Issue #1: 看不到 roblox 运行后的警告日志
"""

import sys
import os
import time

# 添加项目路径
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from roblox_studio_physical_operation_mcp.server import (
    studio_list, studio_open, studio_query, 
    game_start, game_stop, logs_get, modal_close
)

PLACE_PATH = os.path.join(os.path.dirname(__file__), "game.rbxl")


def main():
    print("=" * 60)
    print("Issue #1 测试: 验证 warn 日志是否能被捕获")
    print("=" * 60)
    
    # 1. 检查 Studio 是否已运行
    print("\n[1] 检查 Studio 实例...")
    instances = studio_list()
    print(f"    当前实例: {instances}")
    
    # 2. 打开 Studio
    print(f"\n[2] 打开 Studio: {PLACE_PATH}")
    result = studio_open(PLACE_PATH)
    print(f"    结果: {result}")
    
    # 3. 等待加载
    print("\n[3] 等待 Studio 加载 (8秒)...")
    time.sleep(8)
    
    # 4. 关闭弹窗
    print("\n[4] 关闭弹窗...")
    result = modal_close(place_path=PLACE_PATH)
    print(f"    结果: {result}")
    
    # 5. 查询状态
    print("\n[5] 查询 Studio 状态...")
    status = studio_query(place_path=PLACE_PATH)
    print(f"    状态: {status}")
    
    if not status.get("active"):
        print("    错误: Studio 未运行!")
        return
    
    # 6. 开始游戏
    print("\n[6] 开始游戏 (F5)...")
    result = game_start(place_path=PLACE_PATH)
    print(f"    结果: {result}")
    
    # 7. 等待脚本执行
    print("\n[7] 等待脚本执行 (5秒)...")
    time.sleep(5)
    
    # 8. 获取日志
    print("\n[8] 获取日志 (默认过滤)...")
    logs = logs_get(place_path=PLACE_PATH)
    print(f"    日志结果:")
    print("-" * 40)
    print(logs.get("logs", "无日志"))
    print("-" * 40)
    print(f"    last_line: {logs.get('last_line')}")
    print(f"    remaining: {logs.get('remaining')}")
    
    # 9. 分析结果
    print("\n[9] 分析结果...")
    log_text = logs.get("logs", "")
    has_print = "[TEST] 这是一条 print 消息" in log_text
    has_warn = "[TEST] 这是一条 warn 警告消息" in log_text
    
    print(f"    print 消息: {'✓ 可见' if has_print else '✗ 不可见'}")
    print(f"    warn 消息:  {'✓ 可见' if has_warn else '✗ 不可见'}")
    
    if has_print and not has_warn:
        print("\n    ⚠️ 问题确认: warn 日志被过滤了!")
    elif has_print and has_warn:
        print("\n    ✓ 正常: print 和 warn 都可见")
    else:
        print("\n    ? 异常: 需要检查日志输出")
    
    # 10. 停止游戏
    print("\n[10] 停止游戏 (Shift+F5)...")
    result = game_stop(place_path=PLACE_PATH)
    print(f"    结果: {result}")
    
    print("\n" + "=" * 60)
    print("测试完成")
    print("=" * 60)


if __name__ == "__main__":
    main()
