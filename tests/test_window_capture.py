"""
验证脚本 2: 测试 Windows Graphics Capture API 能否捕获被遮挡的 Roblox Studio 窗口

使用方法:
1. 打开 Roblox Studio
2. 用其他窗口遮挡 Studio (如浏览器)
3. 运行此脚本: python test_window_capture.py
4. 检查生成的截图是否正确显示了 Studio 内容

依赖安装:
pip install winsdk pillow
"""

import sys
import io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

import ctypes
from ctypes import wintypes
import asyncio
import os
import sys

# Windows API
user32 = ctypes.windll.user32
EnumWindows = user32.EnumWindows
EnumWindowsProc = ctypes.WINFUNCTYPE(wintypes.BOOL, wintypes.HWND, wintypes.LPARAM)
GetWindowTextW = user32.GetWindowTextW
GetWindowTextLengthW = user32.GetWindowTextLengthW
IsWindowVisible = user32.IsWindowVisible
GetWindowRect = user32.GetWindowRect


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
                if "Roblox Studio" in title:
                    result.append({'hwnd': hwnd, 'title': title})
        return True

    EnumWindows(EnumWindowsProc(enum_callback), 0)
    return result


def test_bitblt_capture(hwnd, output_path):
    """测试 BitBlt 方式截图 (通常对 DX 渲染无效)"""
    print("\n[测试 1] BitBlt 截图...")

    try:
        import win32gui
        import win32ui
        import win32con
        from PIL import Image

        # 获取窗口尺寸
        rect = win32gui.GetWindowRect(hwnd)
        width = rect[2] - rect[0]
        height = rect[3] - rect[1]

        # 创建设备上下文
        hwnd_dc = win32gui.GetWindowDC(hwnd)
        mfc_dc = win32ui.CreateDCFromHandle(hwnd_dc)
        save_dc = mfc_dc.CreateCompatibleDC()

        # 创建位图
        bitmap = win32ui.CreateBitmap()
        bitmap.CreateCompatibleBitmap(mfc_dc, width, height)
        save_dc.SelectObject(bitmap)

        # 使用 PrintWindow (比 BitBlt 对某些窗口更有效)
        result = ctypes.windll.user32.PrintWindow(hwnd, save_dc.GetSafeHdc(), 2)

        # 转换为 PIL Image
        bmpinfo = bitmap.GetInfo()
        bmpstr = bitmap.GetBitmapBits(True)
        img = Image.frombuffer('RGB', (bmpinfo['bmWidth'], bmpinfo['bmHeight']),
                               bmpstr, 'raw', 'BGRX', 0, 1)

        # 保存
        img.save(output_path)
        print(f"  ✅ 截图已保存: {output_path}")
        print(f"  PrintWindow 返回值: {result}")

        # 清理
        win32gui.DeleteObject(bitmap.GetHandle())
        save_dc.DeleteDC()
        mfc_dc.DeleteDC()
        win32gui.ReleaseDC(hwnd, hwnd_dc)

        return True

    except ImportError:
        print("  ❌ 需要安装 pywin32: pip install pywin32")
        return False
    except Exception as e:
        print(f"  ❌ BitBlt 截图失败: {e}")
        return False


async def test_wgc_capture(hwnd, output_path):
    """测试 Windows Graphics Capture API (推荐方案)"""
    print("\n[测试 2] Windows Graphics Capture API 截图...")

    try:
        # 尝试导入 winsdk
        from winsdk.windows.graphics.capture import GraphicsCaptureItem
        from winsdk.windows.graphics.capture import Direct3D11CaptureFramePool
        from winsdk.windows.graphics.capture import GraphicsCaptureSession
        from winsdk.windows.graphics.directx import DirectXPixelFormat
        from winsdk.windows.graphics.directx.direct3d11 import IDirect3DDevice
        from winsdk.windows.graphics.imaging import SoftwareBitmap, BitmapEncoder, BitmapPixelFormat
        from winsdk.windows.storage.streams import InMemoryRandomAccessStream
        import winsdk.windows.graphics.capture.interop as interop

        print("  winsdk 导入成功")

        # 这里需要更复杂的实现...
        print("  ⚠️ WGC 完整实现需要更多代码，请看备选方案")
        return False

    except ImportError as e:
        print(f"  ❌ winsdk 导入失败: {e}")
        print("  请安装: pip install winsdk")
        return False


def test_dxcam_capture(hwnd, output_path):
    """测试 dxcam 截图 (基于 DXGI Desktop Duplication)"""
    print("\n[测试 3] dxcam 截图 (注意: 无法捕获被遮挡窗口)...")

    try:
        import dxcam
        from PIL import Image

        camera = dxcam.create()
        frame = camera.grab()

        if frame is not None:
            img = Image.fromarray(frame)
            img.save(output_path)
            print(f"  ✅ 截图已保存: {output_path}")
            print("  ⚠️ 注意: 这是全屏截图，不是窗口截图")
        else:
            print("  ❌ 截图失败")

        del camera
        return True

    except ImportError:
        print("  ❌ 需要安装 dxcam: pip install dxcam")
        return False
    except Exception as e:
        print(f"  ❌ dxcam 截图失败: {e}")
        return False


def test_mss_capture(output_path):
    """测试 mss 截图 (跨平台，但只能截全屏或区域)"""
    print("\n[测试 4] mss 截图...")

    try:
        import mss
        from PIL import Image

        with mss.mss() as sct:
            # 截取主显示器
            monitor = sct.monitors[1]
            screenshot = sct.grab(monitor)

            img = Image.frombytes('RGB', screenshot.size, screenshot.bgra, 'raw', 'BGRX')
            img.save(output_path)
            print(f"  ✅ 截图已保存: {output_path}")
            print("  ⚠️ 注意: 这是全屏截图")

        return True

    except ImportError:
        print("  ❌ 需要安装 mss: pip install mss")
        return False
    except Exception as e:
        print(f"  ❌ mss 截图失败: {e}")
        return False


def main():
    print("=" * 60)
    print("Roblox Studio 窗口捕获测试")
    print("=" * 60)

    # 创建输出目录
    output_dir = os.path.join(os.path.dirname(__file__), "capture_test_output")
    os.makedirs(output_dir, exist_ok=True)

    # 查找窗口
    print("\n正在查找 Roblox Studio 窗口...")
    windows = find_roblox_studio_window()

    if not windows:
        print("❌ 未找到 Roblox Studio 窗口!")
        print("   请确保 Roblox Studio 已打开")
        return

    target = windows[0]
    hwnd = target['hwnd']
    print(f"✅ 找到窗口: {target['title'][:50]}...")
    print(f"   HWND: {hwnd}")

    print(f"\n输出目录: {output_dir}")
    print("\n3 秒后开始截图，请确保 Studio 被其他窗口遮挡...")
    import time
    time.sleep(3)

    # 测试各种方法
    print("\n" + "-" * 60)
    print("开始测试各种截图方法")
    print("-" * 60)

    # 测试 1: BitBlt/PrintWindow
    test_bitblt_capture(hwnd, os.path.join(output_dir, "test_bitblt.png"))

    # 测试 2: WGC (异步)
    # asyncio.run(test_wgc_capture(hwnd, os.path.join(output_dir, "test_wgc.png")))

    # 测试 3: dxcam
    test_dxcam_capture(hwnd, os.path.join(output_dir, "test_dxcam.png"))

    # 测试 4: mss
    test_mss_capture(os.path.join(output_dir, "test_mss.png"))

    print("\n" + "=" * 60)
    print("测试完成!")
    print("=" * 60)
    print(f"""
请检查 {output_dir} 目录下的截图:

1. test_bitblt.png - 如果显示 Studio 内容 (非黑屏) → PrintWindow 可用
2. test_dxcam.png  - 全屏截图，用于对比
3. test_mss.png    - 全屏截图，用于对比

结论:
- 如果 BitBlt/PrintWindow 能正确捕获被遮挡的窗口 → 使用此方案
- 如果只能捕获黑屏 → 需要使用 Windows Graphics Capture API
  (需要更复杂的实现，或使用第三方库如 window-capture)
""")


if __name__ == "__main__":
    main()
