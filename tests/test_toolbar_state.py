"""
测试工具栏状态检测

使用 tests/toolbar_stats 目录下的截图测试:
- running/: 游戏运行中的截图，期望 game_state="running"
- stopped/: 游戏停止的截图，期望 game_state="stopped"
"""

import sys
import os
import io

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
sys.stdout.reconfigure(line_buffering=True)

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import cv2
import numpy as np
from PIL import Image

from roblox_studio_physical_operation_mcp.toolbar_detector import (
    ButtonState,
    ButtonType,
    pil_to_cv2,
    load_template,
    find_button_by_template,
    analyze_button_color,
    infer_game_state,
)

TEST_DATA_DIR = os.path.join(os.path.dirname(__file__), "toolbar_stats")
RUNNING_DIR = os.path.join(TEST_DATA_DIR, "running")
STOPPED_DIR = os.path.join(TEST_DATA_DIR, "stopped")


def detect_state_from_image(pil_image: Image.Image) -> dict:
    """
    从 PIL 图像检测工具栏状态
    
    Returns:
        {
            "play": ButtonState,
            "pause": ButtonState,
            "stop": ButtonState,
            "game_state": str,
            "debug": dict
        }
    """
    cv_image = pil_to_cv2(pil_image)
    gray_image = cv2.cvtColor(cv_image, cv2.COLOR_BGR2GRAY)
    
    play_template = load_template("play")
    pause_template = load_template("pause")
    stop_template = load_template("stop")
    
    debug = {
        "templates_loaded": {
            "play": play_template is not None,
            "pause": pause_template is not None,
            "stop": stop_template is not None
        }
    }
    
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
            debug["play"] = {"x": x, "y": y, "confidence": confidence, "state": state.value, "color": color}
        else:
            debug["play"] = {"error": "not found"}
    
    # 查找暂停按钮
    if pause_template is not None:
        result = find_button_by_template(gray_image, pause_template)
        if result:
            x, y, confidence = result
            h, w = pause_template.shape
            state, color = analyze_button_color(pil_image, x, y, w, h, button_type="pause")
            pause_state = state
            debug["pause"] = {"x": x, "y": y, "confidence": confidence, "state": state.value, "color": color}
        else:
            debug["pause"] = {"error": "not found"}
    
    # 查找停止按钮
    if stop_template is not None:
        result = find_button_by_template(gray_image, stop_template)
        if result:
            x, y, confidence = result
            h, w = stop_template.shape
            state, color = analyze_button_color(pil_image, x, y, w, h)
            stop_state = state
            stop_color = color
            debug["stop"] = {"x": x, "y": y, "confidence": confidence, "state": state.value, "color": color}
        else:
            debug["stop"] = {"error": "not found"}
    
    game_state = infer_game_state(play_state, pause_state, stop_state, play_color, stop_color)
    
    return {
        "play": play_state,
        "pause": pause_state,
        "stop": stop_state,
        "game_state": game_state,
        "debug": debug
    }


def test_running_screenshots():
    """测试运行状态的截图"""
    print("\n" + "=" * 60)
    print("[TEST] Running state screenshots")
    print("=" * 60)
    
    if not os.path.exists(RUNNING_DIR):
        print(f"  [SKIP] Directory not found: {RUNNING_DIR}")
        return True, 0, 0
    
    files = [f for f in os.listdir(RUNNING_DIR) if f.endswith(".png")]
    if not files:
        print("  [SKIP] No PNG files found")
        return True, 0, 0
    
    passed = 0
    failed = 0
    
    for filename in files:
        filepath = os.path.join(RUNNING_DIR, filename)
        try:
            pil_image = Image.open(filepath)
            result = detect_state_from_image(pil_image)
            
            expected_state = "running"
            actual_state = result["game_state"]
            
            if actual_state == expected_state:
                print(f"  [PASS] {filename}: game_state={actual_state}")
                passed += 1
            else:
                print(f"  [FAIL] {filename}: expected={expected_state}, got={actual_state}")
                print(f"         debug: {result['debug']}")
                failed += 1
        except Exception as e:
            print(f"  [ERROR] {filename}: {e}")
            failed += 1
    
    return failed == 0, passed, failed


def test_stopped_screenshots():
    """测试停止状态的截图"""
    print("\n" + "=" * 60)
    print("[TEST] Stopped state screenshots")
    print("=" * 60)
    
    if not os.path.exists(STOPPED_DIR):
        print(f"  [SKIP] Directory not found: {STOPPED_DIR}")
        return True, 0, 0
    
    files = [f for f in os.listdir(STOPPED_DIR) if f.endswith(".png")]
    if not files:
        print("  [SKIP] No PNG files found")
        return True, 0, 0
    
    passed = 0
    failed = 0
    
    for filename in files:
        filepath = os.path.join(STOPPED_DIR, filename)
        try:
            pil_image = Image.open(filepath)
            result = detect_state_from_image(pil_image)
            
            expected_state = "stopped"
            actual_state = result["game_state"]
            
            if actual_state == expected_state:
                print(f"  [PASS] {filename}: game_state={actual_state}")
                passed += 1
            else:
                print(f"  [FAIL] {filename}: expected={expected_state}, got={actual_state}")
                print(f"         debug: {result['debug']}")
                failed += 1
        except Exception as e:
            print(f"  [ERROR] {filename}: {e}")
            failed += 1
    
    return failed == 0, passed, failed


def test_button_detection_details():
    """详细测试按钮检测，输出调试信息"""
    print("\n" + "=" * 60)
    print("[TEST] Button detection details")
    print("=" * 60)
    
    all_files = []
    
    if os.path.exists(RUNNING_DIR):
        for f in os.listdir(RUNNING_DIR):
            if f.endswith(".png"):
                all_files.append((os.path.join(RUNNING_DIR, f), "running", f))
    
    if os.path.exists(STOPPED_DIR):
        for f in os.listdir(STOPPED_DIR):
            if f.endswith(".png"):
                all_files.append((os.path.join(STOPPED_DIR, f), "stopped", f))
    
    if not all_files:
        print("  [SKIP] No test files found")
        return True
    
    # 只测试前2个文件作为详细示例
    for filepath, expected, filename in all_files[:4]:
        print(f"\n  --- {expected}/{filename} ---")
        try:
            pil_image = Image.open(filepath)
            result = detect_state_from_image(pil_image)
            
            print(f"  Image size: {pil_image.size}")
            print(f"  Play: {result['play'].value}")
            print(f"  Pause: {result['pause'].value}")
            print(f"  Stop: {result['stop'].value}")
            print(f"  Game state: {result['game_state']} (expected: {expected})")
            
            for btn in ["play", "pause", "stop"]:
                if btn in result["debug"]:
                    info = result["debug"][btn]
                    if "error" in info:
                        print(f"    {btn}: {info['error']}")
                    else:
                        print(f"    {btn}: pos=({info['x']},{info['y']}), conf={info['confidence']:.3f}, color={info['color']}")
        except Exception as e:
            print(f"  Error: {e}")
    
    return True


def main():
    print("=" * 60)
    print("Toolbar State Detection Tests")
    print("=" * 60)
    print(f"Test data directory: {TEST_DATA_DIR}")
    
    total_passed = 0
    total_failed = 0
    
    # 详细测试
    test_button_detection_details()
    
    # 运行状态测试
    success, passed, failed = test_running_screenshots()
    total_passed += passed
    total_failed += failed
    
    # 停止状态测试
    success, passed, failed = test_stopped_screenshots()
    total_passed += passed
    total_failed += failed
    
    print("\n" + "=" * 60)
    print(f"Results: {total_passed} passed, {total_failed} failed")
    if total_failed == 0:
        print("All tests passed!")
    else:
        print("Some tests failed!")
    print("=" * 60)
    
    return 0 if total_failed == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
