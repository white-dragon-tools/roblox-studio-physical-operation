-- 客户端测试脚本
-- 用于测试客户端日志是否能被正确捕获和区分

print("[CLIENT] ========== 客户端日志测试 ==========")
print("[CLIENT] 这是客户端 print 消息")
warn("[CLIENT] 这是客户端 warn 警告")

-- 延迟输出，确保和服务端日志有时间差
task.wait(0.5)
print("[CLIENT] 延迟 0.5 秒后的客户端消息")

-- 客户端错误
task.spawn(function()
	error("[CLIENT] 这是客户端 error 错误")
end)

print("[CLIENT] ========== 客户端日志测试结束 ==========")
