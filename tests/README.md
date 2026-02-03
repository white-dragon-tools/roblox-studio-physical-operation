# Roblox Studio MCP 验证测试

## 依赖安装

```bash
pip install pywin32 pillow dxcam mss
```

## 测试脚本

### 1. PostMessage 可行性测试

测试 Windows 消息能否控制 Roblox Studio：

```bash
python tests/test_postmessage.py
```

**测试内容：**
- PostMessage 发送 F5
- SendMessage 发送 F5
- keybd_event 发送 F5 (需要窗口焦点)

### 2. 窗口捕获测试

测试能否捕获被遮挡的 Roblox Studio 窗口：

```bash
python tests/test_window_capture.py
```

**测试内容：**
- BitBlt/PrintWindow 截图
- dxcam 截图 (全屏)
- mss 截图 (全屏)

## 预期结果

| 测试项 | 成功标准 |
|-------|---------|
| PostMessage | Studio 响应 F5 开始游戏 |
| 窗口捕获 | 被遮挡时仍能截取 Studio 内容 (非黑屏) |
