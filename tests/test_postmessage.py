"""
验证脚本 1: 测试 PostMessage 对 Roblox Studio 是否有效

使用方法:
1. 打开 Roblox Studio 并加载一个 Place
2. 运行此脚本: python test_postmessage.py
3. 观察 Studio 是否响应 F5 (开始游戏)

如果 PostMessage 无效，脚本会尝试 SendMessage 和 keybd_event 作为备选方案。
"""

import sys
import io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

import time
import ctypes
from ctypes import wintypes

# Windows API 常量
WM_KEYDOWN = 0x0100
WM_KEYUP = 0x0101
WM_CHAR = 0x0102
VK_F5 = 0x74
VK_SHIFT = 0x10
VK_F12 = 0x7B

# 加载 Windows API
user32 = ctypes.windll.user32
EnumWindows = user32.EnumWindows
EnumWindowsProc = ctypes.WINFUNCTYPE(wintypes.BOOL, wintypes.HWND, wintypes.LPARAM)
GetWindowTextW = user32.GetWindowTextW
GetWindowTextLengthW = user32.GetWindowTextLengthW
IsWindowVisible = user32.IsWindowVisible
PostMessageW = user32.PostMessageW
SendMessageW = user32.SendMessageW
SetForegroundWindow = user32.SetForegroundWindow
GetClassName = user32.GetClassNameW


def find_roblox_studio_window():
    """查找 Roblox Studio 窗口句柄"""
    result = []

    def enum_callback(hwnd, lparam):
        if IsWindowVisible(hwnd):
            length = GetWindowTextLengthW(hwnd)
            if length > 0:
                buffer = ctypes.create_unicode_buffer(length + 1)
                GetWindowTextW(hwnd, buffer, length + 1)
                title = buffer.value

                # Roblox Studio 窗口标题通常包含 "Roblox Studio"
                if "Roblox Studio" in title:
                    class_name = ctypes.create_unicode_buffer(256)
                    GetClassName(hwnd, class_name, 256)
                    result.append({
                        'hwnd': hwnd,
                        'title': title,
                        'class': class_name.value
                    })
        return True

    EnumWindows(EnumWindowsProc(enum_callback), 0)
    return result


def test_postmessage(hwnd, key_code, key_name):
    """测试 PostMessage 发送按键"""
    print(f"\n[测试 1] PostMessage 发送 {key_name}...")

    # 发送 keydown
    result_down = PostMessageW(hwnd, WM_KEYDOWN, key_code, 0)
    time.sleep(0.05)
    # 发送 keyup
    result_up = PostMessageW(hwnd, WM_KEYUP, key_code, 0)

    print(f"  PostMessage WM_KEYDOWN 返回: {result_down}")
    print(f"  PostMessage WM_KEYUP 返回: {result_up}")
    print(f"  请观察 Roblox Studio 是否响应了 {key_name}")
    return result_down and result_up


def test_sendmessage(hwnd, key_code, key_name):
    """测试 SendMessage 发送按键"""
    print(f"\n[测试 2] SendMessage 发送 {key_name}...")

    result_down = SendMessageW(hwnd, WM_KEYDOWN, key_code, 0)
    time.sleep(0.05)
    result_up = SendMessageW(hwnd, WM_KEYUP, key_code, 0)

    print(f"  SendMessage WM_KEYDOWN 返回: {result_down}")
    print(f"  SendMessage WM_KEYUP 返回: {result_up}")
    print(f"  请观察 Roblox Studio 是否响应了 {key_name}")
    return True


def test_keybd_event(hwnd, key_code, key_name):
    """测试 keybd_event (需要窗口在前台)"""
    print(f"\n[测试 3] keybd_event 发送 {key_name} (会将窗口置于前台)...")

    # 将窗口置于前台
    SetForegroundWindow(hwnd)
    time.sleep(0.3)

    # keybd_event
    KEYEVENTF_KEYUP = 0x0002
    user32.keybd_event(key_code, 0, 0, 0)  # key down
    time.sleep(0.05)
    user32.keybd_event(key_code, 0, KEYEVENTF_KEYUP, 0)  # key up

    print(f"  keybd_event 已发送")
    print(f"  请观察 Roblox Studio 是否响应了 {key_name}")
    return True


def main():
    print("=" * 60)
    print("Roblox Studio PostMessage 可行性测试")
    print("=" * 60)

    # 查找窗口
    print("\n正在查找 Roblox Studio 窗口...")
    windows = find_roblox_studio_window()

    if not windows:
        print("❌ 未找到 Roblox Studio 窗口!")
        print("   请确保 Roblox Studio 已打开并加载了一个 Place")
        return

    print(f"\n✅ 找到 {len(windows)} 个 Roblox Studio 窗口:")
    for i, win in enumerate(windows):
        print(f"  [{i}] HWND: {win['hwnd']}")
        print(f"      标题: {win['title']}")
        print(f"      类名: {win['class']}")

    # 使用第一个窗口
    target = windows[0]
    hwnd = target['hwnd']

    print(f"\n将使用窗口: {target['title'][:50]}...")
    print("\n" + "-" * 60)
    print("开始测试 (每个测试间隔 3 秒，请观察 Studio 的反应)")
    print("-" * 60)

    # 测试 F5 (开始游戏)
    input("\n按 Enter 开始测试 PostMessage 发送 F5...")
    test_postmessage(hwnd, VK_F5, "F5")

    time.sleep(3)

    input("\n按 Enter 开始测试 SendMessage 发送 F5...")
    test_sendmessage(hwnd, VK_F5, "F5")

    time.sleep(3)

    input("\n按 Enter 开始测试 keybd_event 发送 F5 (会切换窗口焦点)...")
    test_keybd_event(hwnd, VK_F5, "F5")

    print("\n" + "=" * 60)
    print("测试完成!")
    print("=" * 60)
    print("""
请回答以下问题:
1. PostMessage 是否触发了 F5 功能? (Y/N)
2. SendMessage 是否触发了 F5 功能? (Y/N)
3. keybd_event 是否触发了 F5 功能? (Y/N)

根据结果:
- 如果 PostMessage 有效 → 最佳方案，完全不干扰操作
- 如果只有 SendMessage 有效 → 可用，但可能有延迟
- 如果只有 keybd_event 有效 → 需要短暂切换焦点，会轻微干扰
- 如果都无效 → 需要考虑其他方案 (如 Roblox Plugin API)
""")


if __name__ == "__main__":
    main()
