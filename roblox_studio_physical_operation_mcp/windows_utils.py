"""
Windows 工具模块: 窗口查找、按键发送、截图等
"""

import ctypes
from ctypes import wintypes, Structure, Union, POINTER
import time
from typing import Optional
import winreg

# 设置 DPI 感知 (必须在任何 GUI 操作之前调用)
# PROCESS_PER_MONITOR_DPI_AWARE = 2
try:
    ctypes.windll.shcore.SetProcessDpiAwareness(2)
except Exception:
    # Windows 8.1 之前的系统使用旧 API
    try:
        ctypes.windll.user32.SetProcessDPIAware()
    except Exception:
        pass

# Windows API
user32 = ctypes.windll.user32

# SendInput 常量
INPUT_KEYBOARD = 1
KEYEVENTF_KEYUP = 0x0002
VK_F5 = 0x74
VK_F12 = 0x7B
VK_SHIFT = 0x10


# SendInput 结构体
class KEYBDINPUT(Structure):
    _fields_ = [
        ("wVk", wintypes.WORD),
        ("wScan", wintypes.WORD),
        ("dwFlags", wintypes.DWORD),
        ("time", wintypes.DWORD),
        ("dwExtraInfo", POINTER(ctypes.c_ulong))
    ]


class MOUSEINPUT(Structure):
    _fields_ = [
        ("dx", wintypes.LONG),
        ("dy", wintypes.LONG),
        ("mouseData", wintypes.DWORD),
        ("dwFlags", wintypes.DWORD),
        ("time", wintypes.DWORD),
        ("dwExtraInfo", POINTER(ctypes.c_ulong))
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


def get_studio_path() -> Optional[str]:
    """从注册表获取 Roblox Studio 路径"""
    try:
        key = winreg.OpenKey(winreg.HKEY_CLASSES_ROOT, r"roblox-studio\shell\open\command")
        value, _ = winreg.QueryValueEx(key, "")
        winreg.CloseKey(key)
        # 值格式: "C:\...\RobloxStudioBeta.exe" %1
        # 提取路径
        if value.startswith('"'):
            return value.split('"')[1]
        return value.split()[0]
    except FileNotFoundError:
        return None


def is_window_valid(hwnd: int) -> bool:
    """检查窗口句柄是否有效"""
    return bool(user32.IsWindow(hwnd))


def find_window_by_title(title_contains: str) -> Optional[int]:
    """通过标题查找窗口"""
    result = []
    EnumWindowsProc = ctypes.WINFUNCTYPE(wintypes.BOOL, wintypes.HWND, wintypes.LPARAM)

    def enum_callback(hwnd, lparam):
        if user32.IsWindowVisible(hwnd):
            length = user32.GetWindowTextLengthW(hwnd)
            if length > 0:
                buffer = ctypes.create_unicode_buffer(length + 1)
                user32.GetWindowTextW(hwnd, buffer, length + 1)
                if title_contains in buffer.value:
                    result.append(hwnd)
        return True

    user32.EnumWindows(EnumWindowsProc(enum_callback), 0)
    return result[0] if result else None


def find_window_by_pid(pid: int) -> Optional[int]:
    """通过 PID 查找主窗口句柄"""
    result = []
    EnumWindowsProc = ctypes.WINFUNCTYPE(wintypes.BOOL, wintypes.HWND, wintypes.LPARAM)

    def enum_callback(hwnd, lparam):
        if user32.IsWindowVisible(hwnd):
            window_pid = wintypes.DWORD()
            user32.GetWindowThreadProcessId(hwnd, ctypes.byref(window_pid))
            if window_pid.value == pid:
                length = user32.GetWindowTextLengthW(hwnd)
                if length > 0:
                    buffer = ctypes.create_unicode_buffer(length + 1)
                    user32.GetWindowTextW(hwnd, buffer, length + 1)
                    title = buffer.value
                    if "Roblox Studio" in title:
                        result.append(hwnd)
        return True

    user32.EnumWindows(EnumWindowsProc(enum_callback), 0)
    return result[0] if result else None


def send_key(vk_code: int) -> bool:
    """使用 SendInput 发送按键"""
    inputs = (INPUT * 2)()

    # Key down
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
    return result == 2


def send_key_combo(vk_codes: list[int]) -> bool:
    """发送组合键 (如 Shift+F5)"""
    count = len(vk_codes) * 2
    inputs = (INPUT * count)()

    # 所有键按下
    for i, vk in enumerate(vk_codes):
        inputs[i].type = INPUT_KEYBOARD
        inputs[i].union.ki.wVk = vk
        inputs[i].union.ki.dwFlags = 0

    # 所有键释放 (逆序)
    for i, vk in enumerate(reversed(vk_codes)):
        idx = len(vk_codes) + i
        inputs[idx].type = INPUT_KEYBOARD
        inputs[idx].union.ki.wVk = vk
        inputs[idx].union.ki.dwFlags = KEYEVENTF_KEYUP

    result = user32.SendInput(count, ctypes.byref(inputs), ctypes.sizeof(INPUT))
    return result == count


def send_key_to_window(hwnd: int, vk_code: int) -> bool:
    """将窗口置于前台并发送按键"""
    original_hwnd = user32.GetForegroundWindow()

    # 尝试将目标窗口置于前台
    user32.SetForegroundWindow(hwnd)
    time.sleep(0.1)

    # 检查是否成功，使用 Alt 键技巧
    if user32.GetForegroundWindow() != hwnd:
        user32.keybd_event(0x12, 0, 0, 0)  # Alt down
        user32.SetForegroundWindow(hwnd)
        user32.keybd_event(0x12, 0, 2, 0)  # Alt up
        time.sleep(0.1)

    # 发送按键
    success = send_key(vk_code)
    time.sleep(0.2)

    # 恢复原窗口
    if original_hwnd and original_hwnd != hwnd:
        user32.SetForegroundWindow(original_hwnd)

    return success


def send_key_combo_to_window(hwnd: int, vk_codes: list[int]) -> bool:
    """将窗口置于前台并发送组合键"""
    original_hwnd = user32.GetForegroundWindow()

    user32.SetForegroundWindow(hwnd)
    time.sleep(0.1)

    if user32.GetForegroundWindow() != hwnd:
        user32.keybd_event(0x12, 0, 0, 0)
        user32.SetForegroundWindow(hwnd)
        user32.keybd_event(0x12, 0, 2, 0)
        time.sleep(0.1)

    success = send_key_combo(vk_codes)
    time.sleep(0.2)

    if original_hwnd and original_hwnd != hwnd:
        user32.SetForegroundWindow(original_hwnd)

    return success


def capture_window(hwnd: int, output_path: str) -> bool:
    """使用 PrintWindow 截取窗口"""
    try:
        import win32gui
        import win32ui
        from PIL import Image

        rect = win32gui.GetWindowRect(hwnd)
        width = rect[2] - rect[0]
        height = rect[3] - rect[1]

        hwnd_dc = win32gui.GetWindowDC(hwnd)
        mfc_dc = win32ui.CreateDCFromHandle(hwnd_dc)
        save_dc = mfc_dc.CreateCompatibleDC()

        bitmap = win32ui.CreateBitmap()
        bitmap.CreateCompatibleBitmap(mfc_dc, width, height)
        save_dc.SelectObject(bitmap)

        # PrintWindow with PW_RENDERFULLCONTENT flag
        ctypes.windll.user32.PrintWindow(hwnd, save_dc.GetSafeHdc(), 2)

        bmpinfo = bitmap.GetInfo()
        bmpstr = bitmap.GetBitmapBits(True)
        img = Image.frombuffer('RGB', (bmpinfo['bmWidth'], bmpinfo['bmHeight']),
                               bmpstr, 'raw', 'BGRX', 0, 1)
        img.save(output_path)

        win32gui.DeleteObject(bitmap.GetHandle())
        save_dc.DeleteDC()
        mfc_dc.DeleteDC()
        win32gui.ReleaseDC(hwnd, hwnd_dc)

        return True
    except Exception:
        return False


def click_at(hwnd: int, x: int, y: int, restore_focus: bool = True) -> bool:
    """
    在窗口的指定坐标点击

    Args:
        hwnd: 窗口句柄
        x: 相对于窗口左上角的 X 坐标
        y: 相对于窗口左上角的 Y 坐标
        restore_focus: 是否恢复原窗口焦点

    Returns:
        是否成功
    """
    try:
        import win32gui
        import win32api
        import win32con

        # 保存当前前台窗口
        original_hwnd = user32.GetForegroundWindow() if restore_focus else None

        # 获取窗口位置
        rect = win32gui.GetWindowRect(hwnd)
        abs_x = rect[0] + x
        abs_y = rect[1] + y

        # 将窗口置于前台
        user32.SetForegroundWindow(hwnd)
        time.sleep(0.1)

        if user32.GetForegroundWindow() != hwnd:
            user32.keybd_event(0x12, 0, 0, 0)  # Alt down
            user32.SetForegroundWindow(hwnd)
            user32.keybd_event(0x12, 0, 2, 0)  # Alt up
            time.sleep(0.1)

        # 移动鼠标并点击
        win32api.SetCursorPos((abs_x, abs_y))
        time.sleep(0.05)
        win32api.mouse_event(win32con.MOUSEEVENTF_LEFTDOWN, 0, 0, 0, 0)
        time.sleep(0.05)
        win32api.mouse_event(win32con.MOUSEEVENTF_LEFTUP, 0, 0, 0, 0)

        time.sleep(0.1)

        # 恢复原窗口
        if original_hwnd and original_hwnd != hwnd:
            user32.SetForegroundWindow(original_hwnd)

        return True
    except Exception:
        return False


def right_click_at(hwnd: int, x: int, y: int, restore_focus: bool = True) -> bool:
    """
    在窗口的指定坐标右键点击

    Args:
        hwnd: 窗口句柄
        x: 相对于窗口左上角的 X 坐标
        y: 相对于窗口左上角的 Y 坐标
        restore_focus: 是否恢复原窗口焦点

    Returns:
        是否成功
    """
    try:
        import win32gui
        import win32api
        import win32con

        original_hwnd = user32.GetForegroundWindow() if restore_focus else None

        rect = win32gui.GetWindowRect(hwnd)
        abs_x = rect[0] + x
        abs_y = rect[1] + y

        user32.SetForegroundWindow(hwnd)
        time.sleep(0.1)

        if user32.GetForegroundWindow() != hwnd:
            user32.keybd_event(0x12, 0, 0, 0)
            user32.SetForegroundWindow(hwnd)
            user32.keybd_event(0x12, 0, 2, 0)
            time.sleep(0.1)

        win32api.SetCursorPos((abs_x, abs_y))
        time.sleep(0.05)
        win32api.mouse_event(win32con.MOUSEEVENTF_RIGHTDOWN, 0, 0, 0, 0)
        time.sleep(0.05)
        win32api.mouse_event(win32con.MOUSEEVENTF_RIGHTUP, 0, 0, 0, 0)

        time.sleep(0.1)

        if original_hwnd and original_hwnd != hwnd:
            user32.SetForegroundWindow(original_hwnd)

        return True
    except Exception:
        return False


def double_click_at(hwnd: int, x: int, y: int, restore_focus: bool = True) -> bool:
    """
    在窗口的指定坐标双击

    Args:
        hwnd: 窗口句柄
        x: 相对于窗口左上角的 X 坐标
        y: 相对于窗口左上角的 Y 坐标
        restore_focus: 是否恢复原窗口焦点

    Returns:
        是否成功
    """
    try:
        import win32gui
        import win32api
        import win32con

        original_hwnd = user32.GetForegroundWindow() if restore_focus else None

        rect = win32gui.GetWindowRect(hwnd)
        abs_x = rect[0] + x
        abs_y = rect[1] + y

        user32.SetForegroundWindow(hwnd)
        time.sleep(0.1)

        if user32.GetForegroundWindow() != hwnd:
            user32.keybd_event(0x12, 0, 0, 0)
            user32.SetForegroundWindow(hwnd)
            user32.keybd_event(0x12, 0, 2, 0)
            time.sleep(0.1)

        win32api.SetCursorPos((abs_x, abs_y))
        time.sleep(0.05)

        # 双击
        for _ in range(2):
            win32api.mouse_event(win32con.MOUSEEVENTF_LEFTDOWN, 0, 0, 0, 0)
            time.sleep(0.02)
            win32api.mouse_event(win32con.MOUSEEVENTF_LEFTUP, 0, 0, 0, 0)
            time.sleep(0.05)

        time.sleep(0.1)

        if original_hwnd and original_hwnd != hwnd:
            user32.SetForegroundWindow(original_hwnd)

        return True
    except Exception:
        return False


def find_all_windows_by_pid(pid: int) -> list[dict]:
    """
    查找指定进程的所有可见窗口
    
    Args:
        pid: 进程 ID
        
    Returns:
        窗口信息列表，每个元素包含 hwnd, title, rect
    """
    windows = []
    EnumWindowsProc = ctypes.WINFUNCTYPE(wintypes.BOOL, wintypes.HWND, wintypes.LPARAM)
    
    def enum_callback(hwnd, lparam):
        if user32.IsWindowVisible(hwnd):
            window_pid = wintypes.DWORD()
            user32.GetWindowThreadProcessId(hwnd, ctypes.byref(window_pid))
            if window_pid.value == pid:
                # 获取窗口标题
                length = user32.GetWindowTextLengthW(hwnd)
                title = ""
                if length > 0:
                    buffer = ctypes.create_unicode_buffer(length + 1)
                    user32.GetWindowTextW(hwnd, buffer, length + 1)
                    title = buffer.value
                
                # 获取窗口位置
                import win32gui
                try:
                    rect = win32gui.GetWindowRect(hwnd)
                    # 过滤掉无效窗口 (宽高为0)
                    width = rect[2] - rect[0]
                    height = rect[3] - rect[1]
                    if width > 0 and height > 0:
                        windows.append({
                            'hwnd': hwnd,
                            'title': title,
                            'rect': rect,
                            'width': width,
                            'height': height
                        })
                except Exception:
                    pass
        return True
    
    user32.EnumWindows(EnumWindowsProc(enum_callback), 0)
    return windows


def capture_window_with_modals(hwnd: int, pid: int, output_path: str) -> tuple[bool, list[dict]]:
    """
    截取窗口，优先截取模态弹窗
    
    通过查找同一进程的所有窗口，如果存在模态弹窗（非主窗口），
    则只截取模态弹窗；否则截取主窗口。
    
    Args:
        hwnd: 主窗口句柄
        pid: 进程 ID
        output_path: 输出图片路径
        
    Returns:
        (success, windows_info) - 是否成功，以及捕获到的窗口信息列表
    """
    try:
        # 查找所有同进程窗口
        all_windows = find_all_windows_by_pid(pid)
        
        if not all_windows:
            # 如果没找到窗口，回退到普通截图
            success = capture_window(hwnd, output_path)
            return success, []
        
        # 找出模态弹窗（非主窗口的其他窗口）
        modal_windows = [w for w in all_windows if w['hwnd'] != hwnd]
        
        if modal_windows:
            # 有模态弹窗，截取第一个模态弹窗（通常是最上层的）
            target_hwnd = modal_windows[0]['hwnd']
            success = capture_window(target_hwnd, output_path)
            return success, all_windows
        else:
            # 没有模态弹窗，截取主窗口
            success = capture_window(hwnd, output_path)
            return success, all_windows
        
    except Exception as e:
        return False, [{'error': str(e)}]


def get_modal_windows(hwnd: int, pid: int) -> list[dict]:
    """
    获取模态弹窗列表（排除主窗口和小的边框窗口）
    
    Args:
        hwnd: 主窗口句柄
        pid: 进程 ID
        
    Returns:
        模态弹窗信息列表
    """
    all_windows = find_all_windows_by_pid(pid)
    
    # 过滤：排除主窗口，排除小窗口（宽或高小于50的可能是边框）
    modal_windows = [
        w for w in all_windows 
        if w['hwnd'] != hwnd and w['width'] > 50 and w['height'] > 50
    ]
    
    return modal_windows


def close_modal_window(modal_hwnd: int) -> bool:
    """
    关闭指定的模态弹窗
    
    通过发送 WM_CLOSE 消息关闭窗口
    
    Args:
        modal_hwnd: 模态弹窗句柄
        
    Returns:
        是否成功
    """
    try:
        WM_CLOSE = 0x0010
        user32.PostMessageW(modal_hwnd, WM_CLOSE, 0, 0)
        return True
    except Exception:
        return False


def close_all_modals(hwnd: int, pid: int) -> tuple[int, list[str]]:
    """
    关闭所有模态弹窗
    
    Args:
        hwnd: 主窗口句柄
        pid: 进程 ID
        
    Returns:
        (关闭数量, 关闭的窗口标题列表)
    """
    modal_windows = get_modal_windows(hwnd, pid)
    closed_titles = []
    
    for modal in modal_windows:
        if close_modal_window(modal['hwnd']):
            closed_titles.append(modal['title'] or f"(hwnd: {modal['hwnd']})")
    
    return len(closed_titles), closed_titles
