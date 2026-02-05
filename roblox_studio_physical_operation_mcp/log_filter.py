"""
日志过滤规则

用于过滤 FLog::Output 中的 Studio 内部日志，只保留用户脚本输出。

设计思路：使用黑名单排除已知的系统日志前缀和关键词。
用户脚本的 print()/warn() 输出没有特殊前缀，会被保留。
"""

from typing import List


# 排除前缀：以这些字符串开头的日志会被过滤掉
EXCLUDE_PREFIXES: List[str] = [
    # === Studio 内部 Info 日志 ===
    'Info:',                    # Info: 开头的各种内部消息
    
    # === 版本和架构信息 ===
    'RobloxGitHash:',
    'Studio Version:',
    'Studio Architecture:',
    'Server RobloxGitHash:',
    'Server Prefix:',
    '*******',
    
    # === 策略和 URL ===
    'Creating PolicyContext',
    'BaseUrl:',
    'settingsUrl:',
    
    # === 会话信息 ===
    'Session GUID',
    'Machine GUID',
    'Studio Launch Intent',
    'Is Studio Configured',
    
    # === 路径和资源 ===
    'Reflection::load',
    'setAssetFolder',
    'setExtraAssetFolder',
    'isSupportedInstallLocation',
    
    # === 语言设置 ===
    'preferredLocale',
    'systemLocale',
    
    # === GPU 和驱动 ===
    'Studio D3D',
    'ESGamePerfMonitor',
    
    # === 框架和插件 ===
    'ABTestFramework',
    'Loading Lua Ribbon',
    'TeamCreateWidget',
    'Web returned cloud plugins',
    'The MCP Studio plugin',
    
    # === 内部标志 ===
    'Flag ',                    # Flag xxx referenced from Lua
    
    # === 崩溃和恢复 ===
    'Evaluating deferred',
    '已创建自动恢复文件',        # 中文自动恢复提示
    'Auto-recovery file',       # 英文自动恢复提示
    
    # === 网络和连接 ===
    'Started network server',
    'New connection from',
    'Disconnect from',
    'Connecting to',
    'Joining game',
    '! Joining game',           # 带感叹号的版本
    
    # === 玩家 ===
    'Player ',
    
    # === 代码补全 ===
    'sendMLCodeCompletionHttpRequest',
    
    # === 更新管理器 ===
    'UpdateManager::',
    
    # === StyleRule 警告 ===
    'Warning: Failed to apply StyleRule',
    
    # === 子对象事件 (内部) ===
    'On child added called',
    'On child removed called',
    
    # === FLog::Error 中的系统错误 ===
    'Action ',                  # Action xxx is not handled
]


# 排除包含这些子字符串的日志
EXCLUDE_CONTAINS: List[str] = [
    'referenced from Lua',      # Flag xxx referenced from Lua isn't defined
    'Redundant Flag ID',        # Redundant Flag ID: xxx
    'Asset (Image)',            # Asset (Image) xxx load failed
    'load failed:',             # 资源加载失败
]


def should_exclude(message: str) -> bool:
    """
    判断日志消息是否应该被排除
    
    Args:
        message: 日志消息内容
        
    Returns:
        True 表示应该排除（系统日志），False 表示保留（用户脚本输出）
    """
    # 排除空消息
    if not message or not message.strip():
        return True
    
    # 前缀匹配
    for prefix in EXCLUDE_PREFIXES:
        if message.startswith(prefix):
            return True
    
    # 包含匹配
    for substr in EXCLUDE_CONTAINS:
        if substr in message:
            return True
    
    return False


def filter_logs(messages: List[str]) -> List[str]:
    """
    过滤日志消息列表
    
    Args:
        messages: 日志消息列表
        
    Returns:
        过滤后的消息列表（只包含用户脚本输出）
    """
    return [msg for msg in messages if not should_exclude(msg)]
