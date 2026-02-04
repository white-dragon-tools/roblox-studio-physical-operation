-- 测试脚本：验证 print 和 warn 日志是否都能被 MCP 捕获
-- Issue #1: 看不到 roblox 运行后的警告日志

print("========== 日志测试开始 ==========")

-- 测试 print (普通输出)
print("[TEST] 这是一条 print 消息 - 应该能看到")

-- 测试 warn (警告输出)
warn("[TEST] 这是一条 warn 警告消息 - 需要验证是否能看到")

-- 测试多条消息
for i = 1, 3 do
	print("[TEST] print 循环消息 #" .. i)
	warn("[TEST] warn 循环警告 #" .. i)
end

-- 测试 error (不会中断脚本的方式)
print("[TEST] 准备测试 error 输出...")

-- 使用 pcall 包装 error，避免脚本中断
local success, err = pcall(function()
	error("[TEST] 这是一条 error 错误消息 - 需要验证是否能看到")
end)

if not success then
	print("[TEST] pcall 捕获到错误: " .. tostring(err))
end

print("========== 日志测试结束 ==========")
print("[TEST] 如果你只能看到 print 消息，说明 warn 被过滤了")
print("[TEST] 如果你能看到 warn 消息，说明问题已修复")
