"""
平台抽象层

根据当前操作系统自动导入对应的平台实现。
所有模块应从此包导入平台相关函数:
    from .platform_utils import get_studio_path, find_window_by_pid, ...
"""
import sys

if sys.platform == "win32":
    from ._windows import *  # noqa: F401,F403
elif sys.platform == "darwin":
    from ._macos import *  # noqa: F401,F403
else:
    raise RuntimeError(f"不支持的平台: {sys.platform}")
