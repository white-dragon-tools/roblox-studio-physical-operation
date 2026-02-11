--!strict
-- 内部脚本：为 Workspace 注入 LocalPlacePath 属性
-- 由 lune-manager.mjs 调用，不直接暴露给用户

local fs = require("@lune/fs")
local roblox = require("@lune/roblox")
local process = require("@lune/process")

local ATTRIBUTE_NAME = "LocalPlacePath"

local function main()
    local args = process.args
    if #args < 1 then
        print("Usage: lune run inject_local_path.luau <place_path> [output_path]")
        process.exit(1)
    end

    local placePath = args[1]
    local outputPath = args[2] -- 可选，如果不指定则输出信息

    -- 检查文件是否存在
    if not fs.isFile(placePath) then
        print("Error: File not found: " .. placePath)
        process.exit(1)
    end

    -- 读取文件
    local content = fs.readFile(placePath)

    -- 根据扩展名选择反序列化方法和格式
    local game
    local isXml = placePath:match("%.rbxlx$") or placePath:match("%.rbxmx$")
    local isPlace = placePath:match("%.rbxl$") or placePath:match("%.rbxlx$")
    local isModel = placePath:match("%.rbxm$") or placePath:match("%.rbxmx$")

    if isPlace then
        game = roblox.deserializePlace(content)
    elseif isModel then
        game = roblox.deserializeModel(content)
    else
        print("Error: Unsupported file format. Expected .rbxl, .rbxlx, .rbxm, or .rbxmx")
        process.exit(1)
    end

    -- 找到 Workspace
    local workspace = game:FindFirstChild("Workspace")
    if not workspace then
        print("Error: Workspace not found in file")
        process.exit(1)
    end

    -- 设置属性 (使用原始路径，而非输出路径)
    workspace:SetAttribute(ATTRIBUTE_NAME, placePath)

    -- 序列化 (保持原格式)
    local newContent
    if isPlace then
        newContent = roblox.serializePlace(game, isXml)
    else
        newContent = roblox.serializeModel(game, isXml)
    end

    -- 保存到输出路径
    if outputPath then
        fs.writeFile(outputPath, newContent)
        print(outputPath)
    else
        print("Error: output_path is required")
        process.exit(1)
    end
end

main()
