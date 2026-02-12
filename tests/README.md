# Roblox Studio Physical Operation 测试

## 单元测试

```bash
npm test            # 运行所有测试 (vitest)
npm run test:watch  # 监视模式
```

测试文件：
- `log-filter.test.mjs` - 日志过滤规则测试
- `log-utils.test.mjs` - 日志解析、搜索、错误检测测试
- `toolbar-detector.test.mjs` - 工具栏截图回归测试（running/stopped 样本）

## 完整集成测试

运行所有 CLI 功能的端到端测试（需要 Studio 运行中）：

**测试流程：**
1. `rspo list` - 列出运行中的 Studio 实例
2. `rspo open` - 打开 Studio（如果未打开）
3. 等待 5 秒加载
4. `rspo modal --close` - 关闭所有弹窗
5. `rspo status` - 确认 ready=true
6. `rspo toolbar` - 检测工具栏状态
7. `rspo screenshot` - 截图
8. `rspo game start` - 开始游戏 (F5)
9. 等待 7 秒
10. `rspo toolbar` - 检测运行状态
11. `rspo log` - 获取日志
12. `rspo game stop` - 停止游戏 (Shift+F5)
13. 等待 7 秒
14. `rspo toolbar` - 检测停止状态

## 预期结果

| 测试项 | 成功标准 |
|-------|---------|
| 集成测试 | 所有步骤完成，game_state 正确切换 |
| 单元测试 | `npm test` 全部通过 |
