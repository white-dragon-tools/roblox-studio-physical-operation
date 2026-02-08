"""
macOS 工具模块: 窗口查找、按键发送、截图等

使用 Quartz (Core Graphics) 和 AppKit 框架实现。
需要安装 pyobjc-framework-Quartz 和 pyobjc-framework-Cocoa。

注意: 部分功能需要在系统设置中授予辅助功能和屏幕录制权限。
"""

import os
import subprocess
import time
from typing import Optional

import Quartz
from Quartz import (
    CGWindowListCopyWindowInfo,
    kCGWindowListOptionOnScreenOnly,
    kCGWindowListExcludeDesktopElements,
    kCGWindowListOptionIncludingWindow,
    kCGNullWindowID,
    kCGWindowOwnerPID,
    kCGWindowNumber,
    kCGWindowName,
    kCGWindowBounds,
    kCGWindowListOptionAll,
    CGWindowListCreateImage,
    CGRectNull,
    kCGWindowImageBoundsIgnoreFraming,
    kCGWindowImageDefault,
    CGEventCreateKeyboardEvent,
    CGEventPost,
    kCGHIDEventTap,
    CGEventSetFlags,
    kCGEventFlagMaskShift,
    CGEventCreateMouseEvent,
    kCGEventLeftMouseDown,
    kCGEventLeftMouseUp,
    kCGEventRightMouseDown,
    kCGEventRightMouseUp,
    kCGMouseButtonLeft,
    kCGMouseButtonRight,
    CGPointMake,
)
from AppKit import (
    NSRunningApplication,
    NSApplicationActivateIgnoringOtherApps,
)

# SendInput 常量 (Windows VK codes, 保持 API 兼容)
VK_F5 = 0x74
VK_F12 = 0x7B
VK_SHIFT = 0x10

# Windows VK -> macOS keycode 映射
_VK_TO_MAC = {
    0x74: 0x60,  # VK_F5 -> kVK_F5
    0x7B: 0x6F,  # VK_F12 -> kVK_F12
    0x10: 0x38,  # VK_SHIFT -> kVK_Shift
    0x0D: 0x24,  # VK_RETURN -> kVK_Return
    0x1B: 0x35,  # VK_ESCAPE -> kVK_Escape
    0x09: 0x30,  # VK_TAB -> kVK_Tab
    0x20: 0x31,  # VK_SPACE -> kVK_Space
}

# Windows VK -> CGEvent flag 映射 (修饰键)
_VK_TO_FLAG = {
    0x10: kCGEventFlagMaskShift,  # VK_SHIFT
}


def get_studio_path() -> Optional[str]:
    """查找 Roblox Studio 路径"""
    candidates = [
        "/Applications/RobloxStudio.app",
        os.path.expanduser("~/Applications/RobloxStudio.app"),
    ]
    for path in candidates:
        if os.path.exists(path):
            return path

    # 使用 mdfind (Spotlight) 查找
    try:
        result = subprocess.run(
            ["mdfind", "kMDItemCFBundleIdentifier == 'com.roblox.RobloxStudio'"],
            capture_output=True, text=True, timeout=5
        )
        for line in result.stdout.strip().split('\n'):
            if line and os.path.exists(line):
                return line
    except Exception:
        pass

    return None


def _get_all_windows(on_screen_only: bool = False):
    """获取所有窗口信息"""
    if on_screen_only:
        options = kCGWindowListOptionOnScreenOnly | kCGWindowListExcludeDesktopElements
    else:
        options = kCGWindowListOptionAll | kCGWindowListExcludeDesktopElements
    return CGWindowListCopyWindowInfo(options, kCGNullWindowID) or []


def is_window_valid(window_id: int) -> bool:
    """检查窗口 ID 是否有效"""
    window_list = CGWindowListCopyWindowInfo(
        kCGWindowListOptionIncludingWindow,
        window_id
    )
    return window_list is not None and len(window_list) > 0


def find_window_by_title(title_contains: str) -> Optional[int]:
    """通过标题查找窗口"""
    for window in _get_all_windows(on_screen_only=True):
        name = window.get(kCGWindowName, "")
        if name and title_contains in name:
            return window.get(kCGWindowNumber)
    return None


def find_window_by_pid(pid: int) -> Optional[int]:
    """通过 PID 查找 Roblox Studio 主窗口"""
    for window in _get_all_windows(on_screen_only=True):
        if window.get(kCGWindowOwnerPID) == pid:
            name = window.get(kCGWindowName, "")
            if name and "Roblox Studio" in name:
                return window.get(kCGWindowNumber)

    # 回退: 如果没有标题匹配，找该 PID 最大的窗口
    best = None
    best_area = 0
    for window in _get_all_windows(on_screen_only=True):
        if window.get(kCGWindowOwnerPID) == pid:
            bounds = window.get(kCGWindowBounds, {})
            w = bounds.get('Width', 0)
            h = bounds.get('Height', 0)
            area = w * h
            if area > best_area:
                best_area = area
                best = window.get(kCGWindowNumber)
    return best


def _get_pid_for_window(window_id: int) -> Optional[int]:
    """获取窗口所属的 PID"""
    window_list = CGWindowListCopyWindowInfo(
        kCGWindowListOptionIncludingWindow,
        window_id
    )
    if window_list and len(window_list) > 0:
        return window_list[0].get(kCGWindowOwnerPID)
    return None


def _get_window_bounds(window_id: int) -> Optional[dict]:
    """获取窗口的位置和尺寸"""
    window_list = CGWindowListCopyWindowInfo(
        kCGWindowListOptionIncludingWindow,
        window_id
    )
    if window_list and len(window_list) > 0:
        return window_list[0].get(kCGWindowBounds)
    return None


def _activate_app_by_pid(pid: int) -> bool:
    """激活指定 PID 的应用程序"""
    app = NSRunningApplication.runningApplicationWithProcessIdentifier_(pid)
    if app:
        app.activateWithOptions_(NSApplicationActivateIgnoringOtherApps)
        return True
    return False


def send_key(vk_code: int) -> bool:
    """发送按键 (使用 CGEvent)"""
    mac_keycode = _VK_TO_MAC.get(vk_code)
    if mac_keycode is None:
        return False

    event_down = CGEventCreateKeyboardEvent(None, mac_keycode, True)
    event_up = CGEventCreateKeyboardEvent(None, mac_keycode, False)

    if event_down is None or event_up is None:
        return False

    CGEventPost(kCGHIDEventTap, event_down)
    time.sleep(0.05)
    CGEventPost(kCGHIDEventTap, event_up)
    return True


def send_key_combo(vk_codes: list[int]) -> bool:
    """发送组合键 (如 Shift+F5)"""
    if not vk_codes:
        return False

    # 分离修饰键和普通键
    flags = 0
    main_key = None
    for vk in vk_codes:
        if vk in _VK_TO_FLAG:
            flags |= _VK_TO_FLAG[vk]
        else:
            main_key = vk

    if main_key is None:
        return False

    mac_keycode = _VK_TO_MAC.get(main_key)
    if mac_keycode is None:
        return False

    event_down = CGEventCreateKeyboardEvent(None, mac_keycode, True)
    event_up = CGEventCreateKeyboardEvent(None, mac_keycode, False)

    if event_down is None or event_up is None:
        return False

    if flags:
        CGEventSetFlags(event_down, flags)
        CGEventSetFlags(event_up, flags)

    CGEventPost(kCGHIDEventTap, event_down)
    time.sleep(0.05)
    CGEventPost(kCGHIDEventTap, event_up)
    return True


def send_key_to_window(window_id: int, vk_code: int) -> bool:
    """将窗口置于前台并发送按键"""
    pid = _get_pid_for_window(window_id)
    if pid is None:
        return False

    _activate_app_by_pid(pid)
    time.sleep(0.2)

    success = send_key(vk_code)
    time.sleep(0.2)

    return success


def send_key_combo_to_window(window_id: int, vk_codes: list[int]) -> bool:
    """将窗口置于前台并发送组合键"""
    pid = _get_pid_for_window(window_id)
    if pid is None:
        return False

    _activate_app_by_pid(pid)
    time.sleep(0.2)

    success = send_key_combo(vk_codes)
    time.sleep(0.2)

    return success


def capture_window(window_id: int, output_path: str) -> bool:
    """截取窗口"""
    # 方法 1: 使用 CGWindowListCreateImage
    try:
        image = CGWindowListCreateImage(
            CGRectNull,
            kCGWindowListOptionIncludingWindow,
            window_id,
            kCGWindowImageBoundsIgnoreFraming | kCGWindowImageDefault
        )
        if image is not None:
            from AppKit import NSBitmapImageRep, NSPNGFileType
            bitmap = NSBitmapImageRep.alloc().initWithCGImage_(image)
            if bitmap is not None:
                png_data = bitmap.representationUsingType_properties_(NSPNGFileType, None)
                if png_data is not None:
                    png_data.writeToFile_atomically_(output_path, True)
                    return True
    except Exception:
        pass

    # 方法 2: 使用 screencapture 命令
    try:
        result = subprocess.run(
            ["screencapture", "-l", str(window_id), "-o", "-x", output_path],
            capture_output=True, timeout=10
        )
        return result.returncode == 0 and os.path.exists(output_path)
    except Exception:
        return False


def capture_window_to_pil(window_id: int):
    """截取窗口为 PIL Image 对象"""
    try:
        image = CGWindowListCreateImage(
            CGRectNull,
            kCGWindowListOptionIncludingWindow,
            window_id,
            kCGWindowImageBoundsIgnoreFraming | kCGWindowImageDefault
        )
        if image is None:
            return None

        width = Quartz.CGImageGetWidth(image)
        height = Quartz.CGImageGetHeight(image)

        if width <= 0 or height <= 0:
            return None

        from AppKit import NSBitmapImageRep
        bitmap = NSBitmapImageRep.alloc().initWithCGImage_(image)
        if bitmap is None:
            return None

        from AppKit import NSPNGFileType
        png_data = bitmap.representationUsingType_properties_(NSPNGFileType, None)
        if png_data is None:
            return None

        import io
        from PIL import Image
        return Image.open(io.BytesIO(png_data.bytes()))
    except Exception:
        # 回退: 使用 screencapture
        import tempfile
        tmp_path = os.path.join(tempfile.gettempdir(), f"_capture_{window_id}.png")
        try:
            if capture_window(window_id, tmp_path):
                from PIL import Image
                img = Image.open(tmp_path)
                img.load()
                return img
        except Exception:
            pass
        finally:
            try:
                os.remove(tmp_path)
            except Exception:
                pass
        return None


def restore_window_if_minimized(window_id: int) -> bool:
    """如果窗口最小化，则恢复窗口"""
    pid = _get_pid_for_window(window_id)
    if pid is None:
        return True

    # 使用 AppleScript 恢复窗口
    try:
        app = NSRunningApplication.runningApplicationWithProcessIdentifier_(pid)
        if app and app.isHidden():
            app.unhide()
            time.sleep(0.3)
        elif app:
            app.activateWithOptions_(NSApplicationActivateIgnoringOtherApps)
            time.sleep(0.3)
    except Exception:
        pass

    return True


def click_at(window_id: int, x: int, y: int, restore_focus: bool = True) -> bool:
    """在窗口的指定坐标点击"""
    try:
        bounds = _get_window_bounds(window_id)
        if bounds is None:
            return False

        abs_x = bounds['X'] + x
        abs_y = bounds['Y'] + y
        point = CGPointMake(abs_x, abs_y)

        # 激活窗口
        pid = _get_pid_for_window(window_id)
        if pid:
            _activate_app_by_pid(pid)
            time.sleep(0.1)

        event_down = CGEventCreateMouseEvent(
            None, kCGEventLeftMouseDown, point, kCGMouseButtonLeft
        )
        event_up = CGEventCreateMouseEvent(
            None, kCGEventLeftMouseUp, point, kCGMouseButtonLeft
        )

        CGEventPost(kCGHIDEventTap, event_down)
        time.sleep(0.05)
        CGEventPost(kCGHIDEventTap, event_up)

        return True
    except Exception:
        return False


def right_click_at(window_id: int, x: int, y: int, restore_focus: bool = True) -> bool:
    """在窗口的指定坐标右键点击"""
    try:
        bounds = _get_window_bounds(window_id)
        if bounds is None:
            return False

        abs_x = bounds['X'] + x
        abs_y = bounds['Y'] + y
        point = CGPointMake(abs_x, abs_y)

        pid = _get_pid_for_window(window_id)
        if pid:
            _activate_app_by_pid(pid)
            time.sleep(0.1)

        event_down = CGEventCreateMouseEvent(
            None, kCGEventRightMouseDown, point, kCGMouseButtonRight
        )
        event_up = CGEventCreateMouseEvent(
            None, kCGEventRightMouseUp, point, kCGMouseButtonRight
        )

        CGEventPost(kCGHIDEventTap, event_down)
        time.sleep(0.05)
        CGEventPost(kCGHIDEventTap, event_up)

        return True
    except Exception:
        return False


def double_click_at(window_id: int, x: int, y: int, restore_focus: bool = True) -> bool:
    """在窗口的指定坐标双击"""
    try:
        bounds = _get_window_bounds(window_id)
        if bounds is None:
            return False

        abs_x = bounds['X'] + x
        abs_y = bounds['Y'] + y
        point = CGPointMake(abs_x, abs_y)

        pid = _get_pid_for_window(window_id)
        if pid:
            _activate_app_by_pid(pid)
            time.sleep(0.1)

        for i in range(2):
            event_down = CGEventCreateMouseEvent(
                None, kCGEventLeftMouseDown, point, kCGMouseButtonLeft
            )
            event_up = CGEventCreateMouseEvent(
                None, kCGEventLeftMouseUp, point, kCGMouseButtonLeft
            )
            # 设置点击次数
            Quartz.CGEventSetIntegerValueField(event_down, Quartz.kCGMouseEventClickState, i + 1)
            Quartz.CGEventSetIntegerValueField(event_up, Quartz.kCGMouseEventClickState, i + 1)

            CGEventPost(kCGHIDEventTap, event_down)
            time.sleep(0.02)
            CGEventPost(kCGHIDEventTap, event_up)
            time.sleep(0.05)

        return True
    except Exception:
        return False


def find_all_windows_by_pid(pid: int) -> list[dict]:
    """查找指定进程的所有可见窗口"""
    windows = []
    for window in _get_all_windows(on_screen_only=True):
        if window.get(kCGWindowOwnerPID) == pid:
            bounds = window.get(kCGWindowBounds, {})
            width = int(bounds.get('Width', 0))
            height = int(bounds.get('Height', 0))
            if width > 0 and height > 0:
                window_id = window.get(kCGWindowNumber)
                title = window.get(kCGWindowName, "") or ""
                windows.append({
                    'hwnd': window_id,
                    'title': title,
                    'rect': (
                        int(bounds.get('X', 0)),
                        int(bounds.get('Y', 0)),
                        int(bounds.get('X', 0)) + width,
                        int(bounds.get('Y', 0)) + height,
                    ),
                    'width': width,
                    'height': height,
                })
    return windows


def capture_window_with_modals(window_id: int, pid: int, output_path: str) -> tuple[bool, list[dict]]:
    """截取窗口，优先截取模态弹窗"""
    try:
        all_windows = find_all_windows_by_pid(pid)

        if not all_windows:
            success = capture_window(window_id, output_path)
            return success, []

        modal_windows = [w for w in all_windows if w['hwnd'] != window_id]

        if modal_windows:
            target_id = modal_windows[0]['hwnd']
            success = capture_window(target_id, output_path)
            return success, all_windows
        else:
            success = capture_window(window_id, output_path)
            return success, all_windows

    except Exception as e:
        return False, [{'error': str(e)}]


def get_modal_windows(window_id: int, pid: int) -> list[dict]:
    """获取模态弹窗列表（排除主窗口和小的边框窗口）"""
    all_windows = find_all_windows_by_pid(pid)

    modal_windows = [
        w for w in all_windows
        if w['hwnd'] != window_id and w['width'] > 50 and w['height'] > 50
    ]

    return modal_windows


def close_modal_window(modal_window_id: int) -> bool:
    """关闭指定的模态弹窗"""
    try:
        pid = _get_pid_for_window(modal_window_id)
        if pid is None:
            return False

        # 使用 AppleScript 关闭窗口
        script = f'''
        tell application "System Events"
            set targetProcess to first process whose unix id is {pid}
            tell targetProcess
                repeat with w in windows
                    try
                        click button 1 of w
                    end try
                end repeat
            end tell
        end tell
        '''
        subprocess.run(
            ["osascript", "-e", script],
            capture_output=True, timeout=5
        )
        return True
    except Exception:
        # 回退: 发送 Escape 键
        try:
            _activate_app_by_pid(pid)
            time.sleep(0.1)
            escape_keycode = 0x35  # kVK_Escape
            event_down = CGEventCreateKeyboardEvent(None, escape_keycode, True)
            event_up = CGEventCreateKeyboardEvent(None, escape_keycode, False)
            CGEventPost(kCGHIDEventTap, event_down)
            time.sleep(0.05)
            CGEventPost(kCGHIDEventTap, event_up)
            return True
        except Exception:
            return False


def close_all_modals(window_id: int, pid: int) -> tuple[int, list[str]]:
    """关闭所有模态弹窗"""
    modal_windows = get_modal_windows(window_id, pid)
    closed_titles = []

    for modal in modal_windows:
        if close_modal_window(modal['hwnd']):
            closed_titles.append(modal['title'] or f"(window_id: {modal['hwnd']})")

    return len(closed_titles), closed_titles


__all__ = [
    'VK_F5', 'VK_F12', 'VK_SHIFT',
    'get_studio_path',
    'is_window_valid',
    'find_window_by_title',
    'find_window_by_pid',
    'send_key',
    'send_key_combo',
    'send_key_to_window',
    'send_key_combo_to_window',
    'capture_window',
    'capture_window_to_pil',
    'restore_window_if_minimized',
    'click_at',
    'right_click_at',
    'double_click_at',
    'find_all_windows_by_pid',
    'capture_window_with_modals',
    'get_modal_windows',
    'close_modal_window',
    'close_all_modals',
]
