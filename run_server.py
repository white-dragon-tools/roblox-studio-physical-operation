#!/usr/bin/env python
"""
MCP Server 入口点
"""
import sys
import os

# 确保当前目录在 path 中
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from roblox_studio_physical_operation_mcp.server import main

if __name__ == "__main__":
    main()
