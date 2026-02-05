-- 测试脚本：验证各种日志输出是否都能被 MCP 捕获
-- Issue #1: 看不到 roblox 运行后的警告日志
-- Issue #3: 增加各种奇怪的打印测试

local HttpService = game:GetService("HttpService")

print("========== 日志测试开始 ==========")

-- ============ 基础测试 ============
print("[TEST] 1. 基础 print 消息")
warn("[TEST] 2. 基础 warn 警告消息")

-- ============ JSON 测试 ============
print("[TEST] 3. JSON 对象测试:")
local jsonData = {
	name = "测试用户",
	level = 99,
	items = {"剑", "盾", "药水"},
	nested = {
		a = 1,
		b = "hello"
	}
}
print(HttpService:JSONEncode(jsonData))

-- 复杂 JSON
local complexJson = {
	users = {
		{id = 1, name = "Alice"},
		{id = 2, name = "Bob"},
	},
	metadata = {
		timestamp = os.time(),
		version = "1.0.0"
	}
}
warn("[TEST] 4. 复杂 JSON:")
warn(HttpService:JSONEncode(complexJson))

-- ============ 换行符测试 ============
print("[TEST] 5. 换行符测试:")
print("第一行\n第二行\n第三行")
warn("警告第一行\n警告第二行")

-- ============ 特殊字符测试 ============
print("[TEST] 6. 特殊字符测试:")
print("Tab分隔:\tA\tB\tC")
print("引号测试: \"双引号\" '单引号'")
print("反斜杠: C:\\Users\\Test\\Path")
print("Unicode: 你好世界 🎮 ⚔️ 🛡️")
print("空格测试:    多个空格    ")

-- ============ 长文本测试 ============
print("[TEST] 7. 长文本测试:")
local longText = string.rep("这是一段很长的文本", 20)
print(longText)

-- ============ 数字和布尔测试 ============
print("[TEST] 8. 数字和布尔测试:")
print(12345)
print(3.14159265358979)
print(true)
print(false)
print(nil)

-- ============ 多参数 print 测试 ============
print("[TEST] 9. 多参数 print:")
print("参数1", "参数2", "参数3", 123, true)
warn("warn多参数", "A", "B", 456)

-- ============ 空和特殊值测试 ============
print("[TEST] 10. 空和特殊值:")
print("")  -- 空字符串
print("   ")  -- 只有空格
print(tostring(math.huge))  -- 无穷大
print(tostring(-math.huge))  -- 负无穷大
print(tostring(0/0))  -- NaN

-- ============ 表格格式测试 ============
print("[TEST] 11. 表格格式:")
print("| ID | Name  | Score |")
print("|----|-------|-------|")
print("| 1  | Alice | 100   |")
print("| 2  | Bob   | 95    |")

-- ============ Error 测试 ============
print("[TEST] 12. Error 测试:")

-- 直接抛出 error（会被日志捕获，但脚本会继续执行后面的 spawn）
spawn(function()
	error("这是一条直接 error 错误消息")
end)

-- 延迟抛出另一个错误
delay(0.1, function()
	error("这是延迟 0.1 秒后的 error")
end)

-- assert 失败
spawn(function()
	assert(false, "这是 assert 失败的错误消息")
end)

-- ============ 循环输出测试 ============
print("[TEST] 13. 循环输出:")
for i = 1, 5 do
	print("循环 #" .. i .. " - print")
	if i % 2 == 0 then
		warn("循环 #" .. i .. " - warn (偶数)")
	end
end

-- ============ 时间戳测试 ============
print("[TEST] 14. 时间戳:")
print("当前时间戳: " .. os.time())
print("格式化时间: " .. os.date("%Y-%m-%d %H:%M:%S"))

-- ============ 结束 ============
print("========== 日志测试结束 ==========")
print("[SUMMARY] 测试项目: 14 个")
print("[SUMMARY] 包含: print, warn, error, JSON, 换行符, 特殊字符, 长文本等")
