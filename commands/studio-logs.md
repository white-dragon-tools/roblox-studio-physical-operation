---
name: studio-logs
description: 获取和分析 Roblox Studio 日志
---

# Studio Logs Command

获取、搜索和分析 Studio 日志。

## 步骤

1. 确认 place_path，如未提供则询问或使用 `studio_list` 查找
2. 根据用户需求选择操作：
   - 获取最新日志：`logs_get`
   - 搜索特定内容：`logs_search` + pattern
   - 按日期范围：`logs_by_date`
   - 检查错误：`logs_has_error`
3. 解析日志内容，识别：
   - 错误和警告
   - 用户 print 输出
   - 运行上下文（[P] 游戏中 / [E] 编辑模式）
4. 向用户展示格式化的日志摘要

## 常用场景

- "查看最新日志" → `logs_get`
- "搜索 error" → `logs_search` with pattern "error"
- "有没有报错" → `logs_has_error`
- "清理旧日志" → `logs_clean`

## 输出格式

- 高亮显示错误（红色）和警告（黄色）
- 显示日志行号便于定位
- 如日志过长，显示摘要并提示可查看更多
