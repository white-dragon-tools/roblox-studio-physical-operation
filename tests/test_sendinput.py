"""
验证脚本: 测试 SendInput 对 Roblox Studio 是否有效

SendInput 模拟硬件级键盘输入，需要目标窗口在前台。
脚本会短暂将 Studio 置于前台，发送按键后立即恢复原窗口。
"""

import sys
import io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

import time
import ctypes
from ctypes import wintypes, Structure, Union, POINTER

# Windows API
user32 = ctypes.windll.user32

# 常量
INPUT_KEYBOARD = 1
KEYEVENTF_KEYUP = 0x0002
KEYEVENTF_SCANCODE = 0x0008
VK_F5 = 0x74
VK_SHIFT = 0x10
VK_F12 = 0x7B


# SendInput 结构体
class KEYBDINPUT(Structure):
    _fields_ = [
        ("wVk", wintypes.WORD),
        ("wScan", wintypes.WORD),
        ("dwFlags", wintypes.DWORD),
        ("time", wintypes.DWORD),
        ("dwExtraInfo", ctypes.POINTER(ctypes.c_ulong))
    ]


class MOUSEINPUT(Structure):
    _fields_ = [
        ("dx", wintypes.LONG),
        ("dy", wintypes.LONG),
        ("mouseData", wintypes.DWORD),
        ("dwFlags", wintypes.DWORD),
        ("time", wintypes.DWORD),
        ("dwExtraInfo", ctypes.POINTER(ctypes.c_ulong))
    ]


class HARDWAREINPUT(Structure):
    _fields_ = [
        ("uMsg", wintypes.DWORD),
        ("wParamL", wintypes.WORD),
        ("wParamH", wintypes.WORD)
    ]


class INPUT_UNION(Union):
    _fields_ = [
        ("ki", KEYBDINPUT),
        ("mi", MOUSEINPUT),
        ("hi", HARDWAREINPUT)
    ]


class INPUT(Structure):
    _fields_ = [
        ("type", wintypes.DWORD),
        ("union", INPUT_UNION)
    ]


def find_roblox_studio_window():
    """查找 Roblox Studio 窗口句柄"""
    result = []
    EnumWindowsProc = ctypes.WINFUNCTYPE(wintypes.BOOL, wintypes.HWND, wintypes.LPARAM)

    def enum_callback(hwnd, lparam):
        if user32.IsWindowVisible(hwnd):
            length = user32.GetWindowTextLengthW(hwnd)
            if length > 0:
                buffer = ctypes.create_unicode_buffer(length + 1)
                user32.GetWindowTextW(hwnd, buffer, length + 1)
                title = buffer.value
                if "Roblox Studio" in title:
                    result.append({'hwnd': hwnd, 'title': title})
        return True

    user32.EnumWindows(EnumWindowsProc(enum_callback), 0)
    return result


def send_key(vk_code):
    """使用 SendInput 发送按键"""
    # Key down
    inputs = (INPUT * 2)()

    inputs[0].type = INPUT_KEYBOARD
    inputs[0].union.ki.wVk = vk_code
    inputs[0].union.ki.wScan = 0
    inputs[0].union.ki.dwFlags = 0
    inputs[0].union.ki.time = 0
    inputs[0].union.ki.dwExtraInfo = None

    # Key up
    inputs[1].type = INPUT_KEYBOARD
    inputs[1].union.ki.wVk = vk_code
    inputs[1].union.ki.wScan = 0
    inputs[1].union.ki.dwFlags = KEYEVENTF_KEYUP
    inputs[1].union.ki.time = 0
    inputs[1].union.ki.dwExtraInfo = None

    result = user32.SendInput(2, ctypes.byref(inputs), ctypes.sizeof(INPUT))
    return result


def send_key_to_window(hwnd, vk_code, key_name):
    """将窗口置于前台并发送按键"""
    # 保存当前前台窗口
    original_hwnd = user32.GetForegroundWindow()

    print(f"  正在将 Studio 置于前台...")

    # 尝试将目标窗口置于前台
    # 先尝试 SetForegroundWindow
    user32.SetForegroundWindow(hwnd)
    time.sleep(0.1)

    # 检查是否成功
    current_fg = user32.GetForegroundWindow()
    if current_fg != hwnd:
        # 使用 Alt 键技巧绕过前台锁定
        print(f"  使用 Alt 键技巧...")
        user32.keybd_event(0x12, 0, 0, 0)  # Alt down
        user32.SetForegroundWindow(hwnd)
        user32.keybd_event(0x12, 0, 2, 0)  # Alt up
        time.sleep(0.1)

    # 发送按键
    print(f"  发送 {key_name}...")
    result = send_key(vk_code)
    print(f"  SendInput 返回: {result} (应为 2)")

    time.sleep(0.2)

    # 恢复原窗口
    if original_hwnd and original_hwnd != hwnd:
        print(f"  恢复原窗口焦点...")
        user32.SetForegroundWindow(original_hwnd)

    return result == 2


def main():
    print("=" * 60)
    print("Roblox Studio SendInput 测试")
    print("=" * 60)

    # 查找窗口
    print("\n正在查找 Roblox Studio 窗口...")
    windows = find_roblox_studio_window()

    if not windows:
        print("[X] 未找到 Roblox Studio 窗口!")
        print("    请确保 Roblox Studio 已打开并加载了一个 Place")
        return

    target = windows[0]
    hwnd = target['hwnd']
    print(f"[OK] 找到窗口: {target['title'][:50]}...")
    print(f"     HWND: {hwnd}")

    print("\n" + "-" * 60)
    print("测试 SendInput 发送 F5 (开始游戏)")
    print("-" * 60)
    print("\n注意: 窗口会短暂切换到 Studio，然后恢复")

    input("\n按 Enter 开始测试...")

    success = send_key_to_window(hwnd, VK_F5, "F5")

    print("\n" + "=" * 60)
    print("测试完成!")
    print("=" * 60)
    print(f"""
请确认:
- Studio 是否开始运行游戏? (Y/N)

如果成功:
  SendInput 方案可行，代价是每次操作会短暂 (~0.3秒) 切换窗口焦点

如果失败:
  可能需要以管理员权限运行，或 Studio 有额外的输入保护
""")


if __name__ == "__main__":
    main()
