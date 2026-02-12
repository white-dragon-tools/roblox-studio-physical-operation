---
name: studio-status
description: 查看 Roblox Studio 当前状态
---

# Studio Status Command

查看 Roblox Studio 的完整状态信息。

## 步骤

1. 使用 `list` 列出所有运行中的 Studio 实例
2. 如用户指定了 place_path，使用 `status` 获取详细状态
3. 使用 `toolbar` 获取工具栏按钮状态
4. 使用 `modal` 检查是否有模态弹窗
5. 汇总并向用户展示：
   - Studio 是否运行
   - 游戏状态（stopped/running/paused）
   - 是否有模态弹窗阻塞操作

## 输出格式

简洁展示关键信息：
- 🟢 Studio 运行中 / 🔴 Studio 未运行
- 🎮 游戏状态：停止/运行中/暂停
- ⚠️ 模态弹窗数量（如有）
