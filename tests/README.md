# Roblox Studio Physical Operation 测试

## 单元测试

```bash
npm test            # 运行所有测试 (vitest)
npm run test:watch  # 监视模式
```

测试文件：
- `log-filter.test.mjs` - 日志过滤规则测试
- `log-utils.test.mjs` - 日志解析、搜索、错误检测测试
- `log-utils-extra.test.mjs` - 日志工具扩展测试
- `cli.test.mjs` - CLI 参数解析、命令路由测试
- `studio-manager.test.mjs` - Studio 会话管理测试
- `screenshot-utils.test.mjs` - 截图工具测试
- `rojo-inject.test.mjs` - Rojo 注入参数校验、二进制路径发现测试

## 原生测试

```bash
npm run test:native                    # 运行所有原生测试
npm run test:all                       # 运行单元 + 原生测试
ROJO_PATH=/path/to/rojo npm run test:native  # 指定 rojo 二进制路径
```

原生测试文件：
- `cli.native.test.mjs` - CLI 端到端测试
- `studio-manager.native.test.mjs` - Studio 进程管理原生测试
- `toolbar-detector.native.test.mjs` - 工具栏截图回归测试（running/stopped 样本）
- `toolbar-detector-unit.native.test.mjs` - 工具栏检测单元原生测试
- `rojo-inject.native.test.mjs` - Rojo 注入集成测试（需要 `ROJO_PATH` 环境变量）

### Rojo 注入测试

`rojo-inject.native.test.mjs` 需要 rojo-injectable 二进制。无二进制时自动跳过。

测试内容：
1. 基础 .rbxl 生成 - 验证 `rojo build` 正常工作
2. 注入成功 - 注入后文件增大（包含新增的 TestFolder 等）
3. 幂等性 - 同一配置注入 3 次，二进制输出完全一致（`Buffer.compare === 0`）
4. 无重复 - 注入 1 次和 2 次结果文件大小一致
5. CLI 命令 - `rspo inject` 命令端到端验证

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
| 单元测试 | `npm test` 全部通过（115 tests） |
| 原生测试 | `npm run test:native` 全部通过（73 tests） |
| 集成测试 | 所有步骤完成，game_state 正确切换 |
