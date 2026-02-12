---
name: studio-run
description: 运行 Roblox Studio 游戏并监控日志输出
---

# Studio Run Command

运行指定的 .rbxl 文件并监控游戏日志。

## 步骤

1. 确认用户提供了 place_path（.rbxl 文件路径），如未提供则询问
2. 使用 `status` 检查 Studio 状态
3. 如有模态弹窗，使用 `modal --close` 关闭
4. 使用 `toolbar` 确认当前游戏状态
5. 如游戏未运行，使用 `game start` 启动游戏
6. 等待 2-3 秒后使用 `log` 获取日志
7. 使用 `log --errors` 检查是否有错误
8. 向用户报告运行结果和日志摘要

## 注意事项

- 如果 Studio 未打开，提示用户先打开 Studio
- 日志中 `[P]` 表示游戏运行时输出，`[E]` 表示编辑模式输出
- 如发现错误，高亮显示并建议排查方向
