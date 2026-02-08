"""
工具栏按钮状态检测模块 - 模板匹配版本

使用 OpenCV 模板匹配在截图中定位按钮，然后通过颜色判断状态。

按钮布局（从左到右）：
1. 播放按钮(Play): 三角形 ▶
2. 暂停按钮(Pause): 双竖线 ‖  
3. 停止按钮(Stop): 方块 ■

颜色状态：
- 灰色 = disabled
- 彩色 = enabled (绿色播放、蓝色暂停、红色停止)
"""

import os
from typing import Optional, List, Tuple
from dataclasses import dataclass
from enum import Enum

try:
    import cv2
    import numpy as np
    from PIL import Image
except ImportError as e:
    raise ImportError(f"需要安装依赖: pip install opencv-python Pillow numpy: {e}")


class ButtonState(Enum):
    """按钮状态"""
    DISABLED = "disabled"  # 灰色，不可用
    ENABLED = "enabled"    # 彩色，可用
    UNKNOWN = "unknown"    # 无法识别


class ButtonType(Enum):
    """按钮类型"""
    PLAY = "play"
    PAUSE = "pause"
    STOP = "stop"


@dataclass
class ButtonInfo:
    """按钮信息"""
    button_type: ButtonType
    x: int
    y: int
    width: int
    height: int
    state: ButtonState
    color_type: str  # "gray", "green", "blue", "red"
    confidence: float  # 模板匹配置信度


@dataclass 
class ToolbarState:
    """工具栏状态"""
    play: ButtonState
    pause: ButtonState
    stop: ButtonState
    game_state: str  # "stopped", "running", "paused"
    buttons: List[ButtonInfo] = None
    
    def to_dict(self) -> dict:
        result = {
            "play": self.play.value,
            "pause": self.pause.value,
            "stop": self.stop.value,
            "game_state": self.game_state
        }
        if self.buttons:
            result["buttons_detail"] = [
                {
                    "type": b.button_type.value,
                    "x": b.x, "y": b.y,
                    "width": b.width, "height": b.height,
                    "state": b.state.value,
                    "color_type": b.color_type,
                    "confidence": round(b.confidence, 3)
                }
                for b in self.buttons
            ]
        return result


# 模板文件路径
TEMPLATE_DIR = os.path.join(os.path.dirname(__file__), "templates")


def capture_window_to_image(hwnd: int) -> Optional[Image.Image]:
    """截取窗口为 PIL Image 对象"""
    from .platform_utils import capture_window_to_pil
    return capture_window_to_pil(hwnd)


def pil_to_cv2(pil_image: Image.Image) -> np.ndarray:
    """PIL Image 转 OpenCV 格式"""
    return cv2.cvtColor(np.array(pil_image), cv2.COLOR_RGB2BGR)


def rgb_to_hsv(r: int, g: int, b: int) -> Tuple[float, float, float]:
    """RGB 转 HSV (H: 0-360, S: 0-100, V: 0-100)"""
    r, g, b = r / 255.0, g / 255.0, b / 255.0
    max_val = max(r, g, b)
    min_val = min(r, g, b)
    diff = max_val - min_val
    
    v = max_val * 100
    
    if max_val == 0:
        s = 0
    else:
        s = (diff / max_val) * 100
    
    if diff == 0:
        h = 0
    elif max_val == r:
        h = 60 * (((g - b) / diff) % 6)
    elif max_val == g:
        h = 60 * (((b - r) / diff) + 2)
    else:
        h = 60 * (((r - g) / diff) + 4)
    
    if h < 0:
        h += 360
        
    return h, s, v


def load_template(name: str) -> Optional[np.ndarray]:
    """加载模板图片（灰度）"""
    path = os.path.join(TEMPLATE_DIR, f"{name}.png")
    if not os.path.exists(path):
        return None
    return cv2.imread(path, cv2.IMREAD_GRAYSCALE)


def find_button_by_template(screenshot_gray: np.ndarray, template: np.ndarray, 
                            threshold: float = 0.7) -> Optional[Tuple[int, int, float]]:
    """
    使用模板匹配在截图中查找按钮
    
    Args:
        screenshot_gray: 灰度截图
        template: 灰度模板
        threshold: 匹配阈值
        
    Returns:
        (x, y, confidence) 或 None
    """
    if template is None:
        return None
    
    result = cv2.matchTemplate(screenshot_gray, template, cv2.TM_CCOEFF_NORMED)
    min_val, max_val, min_loc, max_loc = cv2.minMaxLoc(result)
    
    if max_val >= threshold:
        return (max_loc[0], max_loc[1], max_val)
    
    return None


def analyze_button_color(pil_image: Image.Image, x: int, y: int, 
                         width: int, height: int, button_type: str = None) -> Tuple[ButtonState, str]:
    """
    分析按钮区域的颜色来判断状态
    
    对于暂停按钮，使用亮度判断（竖线颜色）：
    - 浅灰色 (亮度 > 120) = disabled (游戏停止)
    - 深灰色 (亮度 < 120) = enabled (游戏运行中)
    
    对于其他按钮，使用彩色判断：
    - 有彩色 = enabled
    - 灰色 = disabled
    
    Returns:
        (state, color_type)
    """
    # 饱和度阈值
    COLOR_THRESHOLD = 50
    
    red_count = 0
    green_count = 0
    blue_count = 0
    dark_pixel_count = 0  # 深色像素计数
    total = 0
    total_dark_brightness = 0  # 深色像素的亮度总和
    
    for dy in range(height):
        for dx in range(width):
            try:
                r, g, b = pil_image.getpixel((x + dx, y + dy))[:3]
                h, s, v = rgb_to_hsv(r, g, b)
                brightness = (r + g + b) / 3
                total += 1
                
                # 统计非白色像素（按钮图标本身）
                if brightness < 200:
                    dark_pixel_count += 1
                    total_dark_brightness += brightness
                
                if s > COLOR_THRESHOLD and v > 30:
                    if h <= 30 or h >= 330:  # 红色
                        red_count += 1
                    elif 80 <= h <= 160:  # 绿色
                        green_count += 1
                    elif 180 <= h <= 250:  # 蓝色
                        blue_count += 1
            except:
                pass
    
    if total == 0:
        return ButtonState.UNKNOWN, "unknown"
    
    # 暂停按钮特殊处理：用图标亮度判断
    if button_type == "pause" and dark_pixel_count > 0:
        avg_dark_brightness = total_dark_brightness / dark_pixel_count
        # 亮度 > 120 = 浅灰色 = disabled (游戏停止)
        # 亮度 < 120 = 深灰色 = enabled (游戏运行中)
        if avg_dark_brightness < 120:
            return ButtonState.ENABLED, "dark"
        else:
            return ButtonState.DISABLED, "light"
    
    # 其他按钮：用彩色判断
    min_ratio = 0.03
    if red_count > total * min_ratio:
        return ButtonState.ENABLED, "red"
    elif green_count > total * min_ratio:
        return ButtonState.ENABLED, "green"
    elif blue_count > total * min_ratio:
        return ButtonState.ENABLED, "blue"
    else:
        return ButtonState.DISABLED, "gray"


def restore_window_if_minimized(hwnd: int) -> bool:
    """
    如果窗口最小化，则恢复窗口

    Args:
        hwnd: 窗口句柄

    Returns:
        True 如果窗口已恢复或本来就不是最小化
    """
    from .platform_utils import restore_window_if_minimized as _restore
    return _restore(hwnd)


def detect_toolbar_state(hwnd: int) -> Optional[ToolbarState]:
    """
    检测工具栏按钮状态
    
    Args:
        hwnd: Roblox Studio 窗口句柄
        
    Returns:
        ToolbarState 对象，失败返回 None
    """
    # 如果窗口最小化，先恢复
    restore_window_if_minimized(hwnd)
    
    # 截取窗口
    pil_image = capture_window_to_image(hwnd)
    if pil_image is None:
        return None
    
    # 转换为 OpenCV 格式
    cv_image = pil_to_cv2(pil_image)
    gray_image = cv2.cvtColor(cv_image, cv2.COLOR_BGR2GRAY)
    
    # 加载模板
    play_template = load_template("play")
    pause_template = load_template("pause")
    stop_template = load_template("stop")
    
    buttons = []
    play_state = ButtonState.UNKNOWN
    pause_state = ButtonState.UNKNOWN
    stop_state = ButtonState.UNKNOWN
    play_color = None
    stop_color = None
    
    # 查找播放按钮
    if play_template is not None:
        result = find_button_by_template(gray_image, play_template)
        if result:
            x, y, confidence = result
            h, w = play_template.shape
            state, color = analyze_button_color(pil_image, x, y, w, h)
            play_state = state
            play_color = color
            buttons.append(ButtonInfo(
                button_type=ButtonType.PLAY,
                x=x, y=y, width=w, height=h,
                state=state, color_type=color, confidence=confidence
            ))
    
    # 查找暂停按钮
    if pause_template is not None:
        result = find_button_by_template(gray_image, pause_template)
        if result:
            x, y, confidence = result
            h, w = pause_template.shape
            state, color = analyze_button_color(pil_image, x, y, w, h, button_type="pause")
            pause_state = state
            buttons.append(ButtonInfo(
                button_type=ButtonType.PAUSE,
                x=x, y=y, width=w, height=h,
                state=state, color_type=color, confidence=confidence
            ))
    
    # 查找停止按钮
    if stop_template is not None:
        result = find_button_by_template(gray_image, stop_template)
        if result:
            x, y, confidence = result
            h, w = stop_template.shape
            state, color = analyze_button_color(pil_image, x, y, w, h)
            stop_state = state
            stop_color = color
            buttons.append(ButtonInfo(
                button_type=ButtonType.STOP,
                x=x, y=y, width=w, height=h,
                state=state, color_type=color, confidence=confidence
            ))
    
    # 推断游戏状态
    game_state = infer_game_state(play_state, pause_state, stop_state, play_color, stop_color)
    
    return ToolbarState(
        play=play_state,
        pause=pause_state,
        stop=stop_state,
        game_state=game_state,
        buttons=buttons
    )


def infer_game_state(play: ButtonState, pause: ButtonState, stop: ButtonState,
                     play_color: str = None, stop_color: str = None) -> str:
    """
    根据按钮状态推断游戏状态
    
    规则（基于实际观察，按优先级）：
    1. 暂停按钮深灰色(enabled) -> 游戏运行中
    2. 暂停按钮浅灰色(disabled) -> 游戏停止
    3. 如果暂停按钮未找到，使用其他信号：
       - 停止按钮红色(enabled) -> 游戏运行中
       - 停止按钮灰色(disabled) -> 游戏停止
       - 播放按钮绿色(enabled) -> 游戏停止
       - 播放按钮红色(enabled) -> 游戏运行中（播放按钮变成恢复按钮）
    """
    # 优先使用暂停按钮状态
    if pause == ButtonState.ENABLED:
        return "running"
    elif pause == ButtonState.DISABLED:
        return "stopped"
    
    # 暂停按钮未找到时，使用其他信号
    # 停止按钮红色 = 游戏运行中
    if stop == ButtonState.ENABLED and stop_color == "red":
        return "running"
    
    # 停止按钮灰色 = 游戏停止
    if stop == ButtonState.DISABLED:
        return "stopped"
    
    # 播放按钮绿色 = 游戏停止
    if play == ButtonState.ENABLED and play_color == "green":
        return "stopped"
    
    # 播放按钮红色 = 游戏运行中（播放按钮变成恢复按钮，显示红色）
    if play == ButtonState.ENABLED and play_color == "red":
        return "running"
    
    # 最终默认
    return "stopped"


def detect_toolbar_state_with_debug(hwnd: int, debug_output_path: str = None) -> Tuple[Optional[ToolbarState], dict]:
    """
    检测工具栏状态（带调试信息）
    """
    debug_info = {}
    
    # 如果窗口最小化，先恢复
    restore_window_if_minimized(hwnd)
    
    # 截取窗口
    pil_image = capture_window_to_image(hwnd)
    if pil_image is None:
        debug_info["error"] = "Failed to capture window"
        return None, debug_info
    
    debug_info["window_size"] = pil_image.size
    
    # 转换为 OpenCV 格式
    cv_image = pil_to_cv2(pil_image)
    gray_image = cv2.cvtColor(cv_image, cv2.COLOR_BGR2GRAY)
    
    # 加载模板
    play_template = load_template("play")
    pause_template = load_template("pause")
    stop_template = load_template("stop")
    
    debug_info["templates_loaded"] = {
        "play": play_template is not None,
        "pause": pause_template is not None,
        "stop": stop_template is not None
    }
    
    buttons = []
    play_state = ButtonState.UNKNOWN
    pause_state = ButtonState.UNKNOWN
    stop_state = ButtonState.UNKNOWN
    play_color = None
    stop_color = None
    
    # 查找播放按钮
    if play_template is not None:
        result = find_button_by_template(gray_image, play_template)
        if result:
            x, y, confidence = result
            h, w = play_template.shape
            state, color = analyze_button_color(pil_image, x, y, w, h)
            play_state = state
            play_color = color
            buttons.append(ButtonInfo(
                button_type=ButtonType.PLAY,
                x=x, y=y, width=w, height=h,
                state=state, color_type=color, confidence=confidence
            ))
            debug_info["play"] = {"x": x, "y": y, "confidence": confidence, "state": state.value, "color": color}
        else:
            debug_info["play"] = {"error": "not found"}
    
    # 查找暂停按钮
    if pause_template is not None:
        result = find_button_by_template(gray_image, pause_template)
        if result:
            x, y, confidence = result
            h, w = pause_template.shape
            state, color = analyze_button_color(pil_image, x, y, w, h, button_type="pause")
            pause_state = state
            buttons.append(ButtonInfo(
                button_type=ButtonType.PAUSE,
                x=x, y=y, width=w, height=h,
                state=state, color_type=color, confidence=confidence
            ))
            debug_info["pause"] = {"x": x, "y": y, "confidence": confidence, "state": state.value, "color": color}
        else:
            debug_info["pause"] = {"error": "not found"}
    
    # 查找停止按钮
    if stop_template is not None:
        result = find_button_by_template(gray_image, stop_template)
        if result:
            x, y, confidence = result
            h, w = stop_template.shape
            state, color = analyze_button_color(pil_image, x, y, w, h)
            stop_state = state
            stop_color = color
            buttons.append(ButtonInfo(
                button_type=ButtonType.STOP,
                x=x, y=y, width=w, height=h,
                state=state, color_type=color, confidence=confidence
            ))
            debug_info["stop"] = {"x": x, "y": y, "confidence": confidence, "state": state.value, "color": color}
        else:
            debug_info["stop"] = {"error": "not found"}
    
    # 保存调试图像
    if debug_output_path:
        debug_img = cv_image.copy()
        colors = {
            ButtonType.PLAY: (0, 255, 0),    # 绿色
            ButtonType.PAUSE: (255, 255, 0),  # 青色
            ButtonType.STOP: (0, 0, 255)      # 红色
        }
        for btn in buttons:
            color = colors.get(btn.button_type, (255, 255, 255))
            cv2.rectangle(debug_img, (btn.x, btn.y), 
                         (btn.x + btn.width, btn.y + btn.height), color, 2)
            label = f"{btn.button_type.value}:{btn.color_type}"
            cv2.putText(debug_img, label, (btn.x, btn.y - 5), 
                       cv2.FONT_HERSHEY_SIMPLEX, 0.5, color, 1)
        cv2.imwrite(debug_output_path, debug_img)
        debug_info["debug_image"] = debug_output_path
    
    # 推断游戏状态
    game_state = infer_game_state(play_state, pause_state, stop_state, play_color, stop_color)
    debug_info["game_state"] = game_state
    
    toolbar_state = ToolbarState(
        play=play_state,
        pause=pause_state,
        stop=stop_state,
        game_state=game_state,
        buttons=buttons
    )
    
    return toolbar_state, debug_info
