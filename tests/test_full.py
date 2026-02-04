"""
完整测试脚本: 测试 MCP 所有功能
"""

import sys
import io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
sys.stdout.reconfigure(line_buffering=True)  # 实时打印

import time
import os

# 添加项目路径
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from roblox_studio_mcp.server import (
    studio_list, studio_open, studio_close, studio_query,
    game_start, game_stop, logs_get, screenshot, toolbar_state,
    modal_close
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
    # 检查是否成功启动
    return "启动" in result or "成功" in result or "已经" in result or "PID" in result


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


def test_modal_close():
    print("\n" + "=" * 60)
    print("[TEST] modal_close")
    print("=" * 60)
    
    result = modal_close(place_path=PLACE_PATH)
    print(f"Result: {result}")
    return True


def main():
    print("Roblox Studio MCP Full Test")
    print("=" * 60)
    print(f"PLACE_PATH: {PLACE_PATH}")
    
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
        
        print("\nWaiting 5 seconds for Studio to load...")
        time.sleep(5)
    else:
        print("\nStudio already open, skipping open step")
    
    # 2. 关闭所有弹窗（无论是否新打开）
    test_modal_close()
    print("\nWaiting 2 seconds...")
    time.sleep(2)
    
    # 3. 查询状态
    if not test_studio_query():
        print("\nStudio not active, aborting")
        return
    
    # 4. 检测工具栏状态
    test_toolbar_state()
    
    # 5. 截图
    test_screenshot()
    
    # 6. 开始游戏
    test_game_start()
    print("\nWaiting 3 seconds...")
    time.sleep(3)
    
    # 7. 检测工具栏状态（运行中）
    test_toolbar_state()
    
    # 8. 获取日志
    test_logs_get()
    
    # 9. 停止游戏
    test_game_stop()
    print("\nWaiting 2 seconds...")
    time.sleep(2)
    
    # 10. 检测工具栏状态（停止后）
    test_toolbar_state()
    
    # 11. 关闭 Place（可选）
    # print("\nClosing Studio in 2 seconds...")
    # time.sleep(2)
    # test_studio_close()
    
    print("\n" + "=" * 60)
    print("All tests completed!")
    print("=" * 60)


if __name__ == "__main__":
    main()
