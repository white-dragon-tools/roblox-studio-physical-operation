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

from roblox_studio_mcp.studio_manager import studio_manager
from roblox_studio_mcp.windows_utils import send_key_to_window, send_key_combo_to_window, capture_window, VK_F5, VK_F12, VK_SHIFT
from roblox_studio_mcp.log_utils import get_recent_logs

PLACE_PATH = r"D:\workspace\white-dragon-tools\roblox-studio-physical-operation-mcp\main\tests\game.rbxl"
SCREENSHOT_DIR = os.path.join(os.path.dirname(__file__), "screenshots")


def test_open_place():
    print("=" * 60)
    print("[TEST] open_place")
    print("=" * 60)

    success, msg = studio_manager.open_place(PLACE_PATH)
    print(f"Result: {success}")
    print(f"Message: {msg}")

    if success:
        status = studio_manager.get_status()
        print(f"Status: {status}")
    return success


def test_start_game():
    print("\n" + "=" * 60)
    print("[TEST] start_game (F5)")
    print("=" * 60)

    status = studio_manager.get_status()
    if not status.get("active"):
        print("Error: No active session")
        return False

    hwnd = status.get("hwnd")
    print(f"Sending F5 to HWND: {hwnd}")
    success = send_key_to_window(hwnd, VK_F5)
    print(f"Result: {success}")
    return success


def test_stop_game():
    print("\n" + "=" * 60)
    print("[TEST] stop_game (Shift+F5)")
    print("=" * 60)

    status = studio_manager.get_status()
    if not status.get("active"):
        print("Error: No active session")
        return False

    hwnd = status.get("hwnd")
    print(f"Sending Shift+F5 to HWND: {hwnd}")
    success = send_key_combo_to_window(hwnd, [VK_SHIFT, VK_F5])
    print(f"Result: {success}")
    return success


def test_capture_screenshot():
    print("\n" + "=" * 60)
    print("[TEST] capture_screenshot")
    print("=" * 60)

    status = studio_manager.get_status()
    if not status.get("active"):
        print("Error: No active session")
        return False

    hwnd = status.get("hwnd")
    os.makedirs(SCREENSHOT_DIR, exist_ok=True)
    output_path = os.path.join(SCREENSHOT_DIR, "test_screenshot.png")

    print(f"Capturing HWND: {hwnd}")
    success = capture_window(hwnd, output_path)
    print(f"Result: {success}")
    if success:
        print(f"Saved to: {output_path}")
    return success


def test_get_logs():
    print("\n" + "=" * 60)
    print("[TEST] get_logs")
    print("=" * 60)

    status = studio_manager.get_status()
    if not status.get("active"):
        print("Error: No active session")
        return False

    log_path = status.get("log_path")
    print(f"Log path: {log_path}")

    entries = get_recent_logs(log_path, limit=5)
    print(f"Got {len(entries)} entries:")
    for e in entries:
        print(f"  [{e.level}] {e.category}: {e.message[:50]}...")
    return True


def test_close_place():
    print("\n" + "=" * 60)
    print("[TEST] close_place")
    print("=" * 60)

    success, msg = studio_manager.close_place()
    print(f"Result: {success}")
    print(f"Message: {msg}")
    return success


def main():
    print("Roblox Studio MCP Full Test")
    print("=" * 60)

    # 1. 打开 Place
    if not test_open_place():
        print("\nFailed to open place, aborting")
        return

    print("\nWaiting 5 seconds for Studio to fully load...")
    time.sleep(5)

    # 2. 截图
    test_capture_screenshot()

    # 3. 开始游戏
    test_start_game()
    print("\nWaiting 3 seconds...")
    time.sleep(3)

    # 4. 获取日志
    test_get_logs()

    # 5. 停止游戏
    test_stop_game()
    print("\nWaiting 2 seconds...")
    time.sleep(2)

    # 6. 关闭 Place
    print("\nClosing Studio in 2 seconds...")
    time.sleep(2)
    test_close_place()

    print("\n" + "=" * 60)
    print("All tests completed!")
    print("=" * 60)


if __name__ == "__main__":
    main()
