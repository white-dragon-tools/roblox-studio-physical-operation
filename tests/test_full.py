"""
完整测试脚本: 测试 MCP 所有功能
"""

import sys
import io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

import time
import os

# 添加项目路径
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from roblox_studio_mcp.server import (
    studio_list, studio_open, studio_close, studio_query,
    game_start, game_stop, logs_get, screenshot, toolbar_state
)

PLACE_PATH = os.path.abspath(os.path.join(os.path.dirname(__file__), "game.rbxl"))


def test_studio_list():
    print("=" * 60)
    print("[TEST] studio_list")
    print("=" * 60)
    
    result = studio_list()
    print(f"Running instances: {len(result)}")
    for inst in result:
        print(f"  - PID: {inst.get('pid')}, Type: {inst.get('type')}")
        if inst.get('place_path'):
            print(f"    Path: {inst.get('place_path')}")
        if inst.get('place_id'):
            print(f"    Place ID: {inst.get('place_id')}")
    return result


def test_studio_open():
    print("\n" + "=" * 60)
    print("[TEST] studio_open")
    print("=" * 60)
    
    result = studio_open(PLACE_PATH)
    print(f"Result: {result}")
    return "成功" in result or "已经" in result


def test_studio_query():
    print("\n" + "=" * 60)
    print("[TEST] studio_query")
    print("=" * 60)
    
    result = studio_query(place_path=PLACE_PATH)
    print(f"Active: {result.get('active')}")
    print(f"Ready: {result.get('ready')}")
    print(f"PID: {result.get('pid')}")
    print(f"Has Modal: {result.get('has_modal')}")
    return result.get('active', False)


def test_toolbar_state():
    print("\n" + "=" * 60)
    print("[TEST] toolbar_state")
    print("=" * 60)
    
    result = toolbar_state(place_path=PLACE_PATH)
    print(f"Game State: {result.get('game_state')}")
    print(f"Play: {result.get('play')}")
    print(f"Pause: {result.get('pause')}")
    print(f"Stop: {result.get('stop')}")
    return result


def test_game_start():
    print("\n" + "=" * 60)
    print("[TEST] game_start")
    print("=" * 60)
    
    result = game_start(place_path=PLACE_PATH)
    print(f"Result: {result}")
    return True


def test_game_stop():
    print("\n" + "=" * 60)
    print("[TEST] game_stop")
    print("=" * 60)
    
    result = game_stop(place_path=PLACE_PATH)
    print(f"Result: {result}")
    return True


def test_logs_get():
    print("\n" + "=" * 60)
    print("[TEST] logs_get")
    print("=" * 60)
    
    result = logs_get(place_path=PLACE_PATH, timestamps=True)
    print(f"Start Line: {result.get('start_line')}")
    print(f"Last Line: {result.get('last_line')}")
    print(f"Remaining: {result.get('remaining')}")
    logs = result.get('logs', '')
    lines = logs.split('\n')[:5]
    print(f"First 5 lines:")
    for line in lines:
        print(f"  {line[:80]}")
    return True


def test_screenshot():
    print("\n" + "=" * 60)
    print("[TEST] screenshot")
    print("=" * 60)
    
    result = screenshot(place_path=PLACE_PATH)
    print(f"Result: {result}")
    return "保存" in str(result)


def test_studio_close():
    print("\n" + "=" * 60)
    print("[TEST] studio_close")
    print("=" * 60)
    
    result = studio_close(place_path=PLACE_PATH)
    print(f"Result: {result}")
    return True


def main():
    print("Roblox Studio MCP Full Test")
    print("=" * 60)
    
    # 0. 列出当前实例
    instances = test_studio_list()
    
    # 检查是否已经打开
    already_open = any(
        inst.get('place_path') and PLACE_PATH.lower() in inst.get('place_path', '').lower()
        for inst in instances
    )
    
    if not already_open:
        # 1. 打开 Place
        if not test_studio_open():
            print("\nFailed to open place, aborting")
            return
        
        print("\nWaiting 8 seconds for Studio to fully load...")
        time.sleep(8)
    else:
        print("\nStudio already open, skipping open step")
    
    # 2. 查询状态
    if not test_studio_query():
        print("\nStudio not active, aborting")
        return
    
    # 3. 检测工具栏状态
    test_toolbar_state()
    
    # 4. 截图
    test_screenshot()
    
    # 5. 开始游戏
    test_game_start()
    print("\nWaiting 3 seconds...")
    time.sleep(3)
    
    # 6. 检测工具栏状态（运行中）
    test_toolbar_state()
    
    # 7. 获取日志
    test_logs_get()
    
    # 8. 停止游戏
    test_game_stop()
    print("\nWaiting 2 seconds...")
    time.sleep(2)
    
    # 9. 检测工具栏状态（停止后）
    test_toolbar_state()
    
    # 10. 关闭 Place（可选）
    # print("\nClosing Studio in 2 seconds...")
    # time.sleep(2)
    # test_studio_close()
    
    print("\n" + "=" * 60)
    print("All tests completed!")
    print("=" * 60)


if __name__ == "__main__":
    main()
