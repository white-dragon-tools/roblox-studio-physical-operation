"""
日志过滤规则

用于过滤 FLog::Output 中的 Studio 内部日志，只保留用户脚本输出。
"""

from typing import List


# 排除前缀：以这些字符串开头的日志会被过滤掉
EXCLUDE_PREFIXES: List[str] = [
    # Studio 内部日志：Info: 后面有制表符缩进
    'Info: \t',
    
    # Studio 内部日志：Info: 开头的各种内部消息
    'Info: RobloxScriptDoc',
    'Info: RPC:',
    
    # Studio 版本和架构信息
    'Studio Version:',
    'Studio Architecture:',
    '*******',
    'RobloxGitHash:',
    
    # 资源和路径
    'setExtraAssetFolder',
    'setAssetFolder',
    'Reflection::load',
    
    # GPU 和驱动信息
    'Studio D3D',
    'ESGamePerfMonitor',
    
    # AB 测试和云插件
    'ABTestFramework',
    'Web returned cloud plugins',
    
    # Lua Ribbon 加载
    'Loading Lua Ribbon',
    
    # TeamCreate
    'TeamCreateWidget',
    
    # 设置相关
    'settingsUrl:',
    'Settings ',
    
    # 崩溃评估
    'Evaluating deferred',
    
    # Lua 标志引用
    'Flag ',
    
    # 策略和基础 URL
    'Creating PolicyContext',
    'BaseUrl:',
    
    # 会话和机器信息
    'Session GUID',
    'Machine GUID',
    'Studio Launch Intent',
    'Is Studio Configured',
    
    # 安装路径
    'isSupportedInstallLocation',
    
    # 语言设置
    'preferredLocale',
    'systemLocale',
]


def should_exclude(message: str) -> bool:
    """
    判断日志消息是否应该被排除
    
    Args:
        message: 日志消息内容
        
    Returns:
        True 表示应该排除，False 表示保留
    """
    for prefix in EXCLUDE_PREFIXES:
        if message.startswith(prefix):
            return True
    return False


def filter_logs(messages: List[str]) -> List[str]:
    """
    过滤日志消息列表
    
    Args:
        messages: 日志消息列表
        
    Returns:
        过滤后的消息列表
    """
    return [msg for msg in messages if not should_exclude(msg)]
