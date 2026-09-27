@echo off
chcp 65001 >nul
title 学校管理系统
cd /d "%~dp0"

echo ========================================
echo    学校管理系统 - 一键启动
echo ========================================
echo.

where node >nul 2>nul
if errorlevel 1 (
    echo [错误] 未检测到 Node.js 运行环境
    echo.
    echo 请先安装 Node.js（免费）:
    echo   下载地址: https://nodejs.org
    echo   安装时一路下一步即可，装完重新双击本脚本
    echo.
    pause
    exit /b 1
)

if not exist "node_modules" (
    echo [1/2] 首次启动，正在安装依赖（约1-2分钟）...
    call npm install
    if errorlevel 1 (
        echo.
        echo [错误] 依赖安装失败，请检查网络后重试
        pause
        exit /b 1
    )
    echo 依赖安装完成。
    echo.
)

echo [2/2] 正在启动服务...
echo.
echo ========================================
echo   启动成功！浏览器将自动打开
echo   访问地址: http://localhost:3000
echo   关闭本窗口即可停止服务
echo ========================================
echo.

start "" "http://localhost:3000"
node server.js

echo.
echo 服务已停止。
pause
