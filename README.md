# Roblox Studio MCP

一个用于控制 Roblox Studio 的 MCP (Model Context Protocol) 服务。

## 安装

```bash
pip install roblox-studio-mcp
```

## 配置 MCP

### Claude Desktop

编辑 `%APPDATA%\Claude\claude_desktop_config.json`：

```json
{
  "mcpServers": {
    "roblox-studio": {
      "command": "python",
      "args": ["-m", "roblox_studio_mcp"]
    }
  }
}
```

### Droid

编辑 `~/.factory/mcp.json`：

```json
{
  "mcpServers": {
    "roblox-studio": {
      "type": "stdio",
      "command": "python",
      "args": ["-m", "roblox_studio_mcp"]
    }
  }
}
```

> **注意**：Windows Store 版 Python 可能需要使用完整路径：
> ```json
> "command": "C:\\Users\\<用户名>\\AppData\\Local\\Microsoft\\WindowsApps\\PythonSoftwareFoundation.Python.3.13_qbz5n2kfra8p0\\python.exe"
> ```

## 从源码安装

```bash
git clone https://github.com/white-dragon-tools/roblox-studio-physical-operation-mcp.git
cd roblox-studio-physical-operation-mcp
pip install -r requirements.txt
python -m roblox_studio_mcp
```

---

## AI 使用指南

### ⚠️ 重要：获取 place_path 或 place_id

**不知道 place_path 或 place_id 时，必须先调用 `studio_list()` 获取！**

```python
# 先获取当前运行的 Studio 实例
instances = studio_list()
# 返回示例:
# [{"pid": 12345, "type": "local", "place_path": "D:/game.rbxl"},
#  {"pid": 67890, "type": "cloud", "place_id": 110155533210141}]

# 然后用返回的 place_path 或 place_id 操作
logs_get(place_path=instances[0]["place_path"])
```

### 推荐工作流程

**调试已打开的 Studio**
```
1. studio_list()               # 获取运行中的 Studio 实例
2. studio_query(place_path)    # 查询状态
3. modal_close(place_path)     # 如果有模态弹窗，关闭它们
4. game_start(place_path)      # 开始游戏
5. logs_get(place_path)        # 获取日志
6. game_stop(place_path)       # 停止游戏
```

**打开新的 Studio**
```
1. studio_open(place_path)     # 打开 Studio（本地文件）
2. studio_query(place_path)    # 查询状态
3. modal_close(place_path)     # 如果有模态弹窗，关闭它们
4. studio_query(place_path)    # 确认 ready=true
5. game_start(place_path)      # 开始游戏
6. logs_get(place_path)        # 获取日志
7. game_stop(place_path)       # 停止游戏
8. studio_close(place_path)    # 关闭 Studio
```

### 支持两种 Place 类型

所有工具都支持两种参数（二选一）：
- `place_path` - 本地 .rbxl 文件路径
- `place_id` - 云端 Roblox Place ID

```python
# 本地文件
logs_get(place_path="D:/game.rbxl")

# 云端 Place（从网页打开的）
logs_get(place_id=110155533210141)
```

### studio_query 返回值说明

```json
{
  "active": true,       // Studio 是否运行中
  "ready": true,        // 是否就绪（无模态弹窗）
  "pid": 12345,         // 进程 ID
  "hwnd": 67890,        // 主窗口句柄
  "has_modal": false,   // 是否有模态弹窗
  "modal_count": 0,     // 模态弹窗数量
  "modals": []          // 模态弹窗详情
}
```

**重要**: `ready=true` 时才能正常操作 Studio。

---

## 工具列表

### 系统工具

| 工具 | 说明 |
|------|------|
| `studio_help()` | 获取使用指南 |
| `studio_list()` | **列出所有运行中的 Studio 实例** |
| `studio_open(place_path)` | 打开 Studio 并加载 .rbxl 文件 |
| `studio_close(place_path/place_id)` | 关闭 Studio |
| `studio_status(place_path/place_id)` | 获取基本状态 |
| `studio_query(place_path/place_id)` | **综合查询状态（推荐）** |

### 模态弹窗

| 工具 | 说明 |
|------|------|
| `modal_detect(place_path/place_id)` | 检测模态弹窗 |
| `modal_close(place_path/place_id)` | 关闭所有模态弹窗 |

### 游戏控制

| 工具 | 说明 |
|------|------|
| `game_start(place_path/place_id)` | 开始游戏 (F5) |
| `game_stop(place_path/place_id)` | 停止游戏 (Shift+F5) |
| `game_pause(place_path/place_id)` | 暂停/恢复游戏 (F12) |

### 工具栏状态检测

| 工具 | 说明 |
|------|------|
| `toolbar_state(place_path/place_id)` | 检测工具栏按钮状态和游戏状态 |
| `toolbar_state_debug(place_path/place_id)` | 带调试信息的检测 |

返回示例：
```json
{
  "play": "enabled",
  "pause": "disabled", 
  "stop": "disabled",
  "game_state": "stopped"
}
```

`game_state` 可能的值：`stopped`, `running`, `paused`

### 日志

| 工具 | 说明 |
|------|------|
| `logs_get(place_path/place_id, after_line, before_line, timestamps)` | 获取日志 |
| `logs_search(place_path/place_id, pattern, after_line, before_line, timestamps)` | 搜索日志（正则） |
| `logs_clean(days)` | 清理旧日志 |

**logs_get 参数：**
```python
logs_get(
    place_path: str = None,      # 本地文件路径
    place_id: int = None,        # 云端 Place ID（二选一）
    after_line: int = None,      # 从哪一行之后开始读取
    before_line: int = None,     # 到哪一行之前结束
    timestamps: bool = False     # 是否附加时间戳 [HH:MM:SS]
)
```

**logs_get 返回：**
```json
{
  "logs": "[15:22:01] Hello world!\nThe MCP plugin is ready.",
  "start_line": 100,
  "last_line": 2330,
  "remaining": 0,
  "has_more": false
}
```

**续读日志：**
```python
# 首次获取
result = logs_get(place_path="D:/game.rbxl")
# 续读新日志
result = logs_get(place_path="D:/game.rbxl", after_line=result["last_line"])
```

### 截图

| 工具 | 说明 |
|------|------|
| `screenshot(place_path/place_id)` | 截取主窗口 |
| `screenshot_full(place_path/place_id)` | 截取窗口（包含模态弹窗） |

---

## 注意事项

1. **支持本地和云端 Place** - 使用 `place_path` 或 `place_id` 参数
2. **启动后务必查询状态** - 调用 `studio_query` 检查是否有模态弹窗
3. **处理模态弹窗** - `ready=false` 时调用 `modal_close` 关闭弹窗
4. **最小化窗口自动恢复** - 检测工具栏状态时会自动恢复最小化的窗口
5. **自动清理** - 关闭本地文件的 Studio 后会自动清理 .lock 文件
6. **日志过滤** - `logs_get` 自动过滤 Studio 内部日志，只返回用户脚本输出

---

## 技术说明

- 会话管理通过扫描进程命令行 + 日志文件自动匹配
- 日志索引缓存减少 IO 操作
- 游戏控制使用 SendInput API（需短暂切换窗口焦点）
- 截图使用 PrintWindow API（可捕获被遮挡窗口）
- 模态弹窗检测通过枚举同进程窗口实现
- 工具栏状态通过 OpenCV 模板匹配检测
- 支持多显示器环境
