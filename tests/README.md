# Roblox Studio MCP 测试

## 依赖安装

```bash
pip install -r requirements.txt
```

## 完整测试

运行所有 MCP 功能测试：

```bash
python tests/test_full.py
```

**测试流程：**
1. `studio_list` - 列出运行中的 Studio 实例
2. `studio_open` - 打开 Studio（如果未打开）
3. 等待 5 秒加载
4. `modal_close` - 关闭所有弹窗
5. `studio_query` - 确认 Ready=True
6. `toolbar_state` - 检测工具栏状态
7. `screenshot` - 截图
8. `game_start` - 开始游戏 (F5)
9. 等待 7 秒
10. `toolbar_state` - 检测运行状态
11. `logs_get` - 获取日志
12. `game_stop` - 停止游戏 (Shift+F5)
13. 等待 7 秒
14. `toolbar_state` - 检测停止状态

## 底层验证测试

### PostMessage 可行性测试

测试 Windows 消息能否控制 Roblox Studio：

```bash
python tests/test_postmessage.py
```

### SendInput 测试

测试 SendInput API 控制：

```bash
python tests/test_sendinput.py
```

### 窗口捕获测试

测试能否捕获被遮挡的 Roblox Studio 窗口：

```bash
python tests/test_window_capture.py
```

## 预期结果

| 测试项 | 成功标准 |
|-------|---------|
| test_full.py | 所有步骤完成，game_state 正确切换 |
| PostMessage | Studio 响应 F5 开始游戏 |
| 窗口捕获 | 被遮挡时仍能截取 Studio 内容 (非黑屏) |
