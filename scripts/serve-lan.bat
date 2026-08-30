@echo off
chcp 65001 >nul
cd /d "%~dp0\.."
where node >nul 2>nul
if errorlevel 1 (
  echo 未找到 node，请先安装 Node.js 或使用 Python 启动。
  echo 备用方案: python -m http.server 8080 --bind 0.0.0.0
  pause
  exit /b 1
)
node scripts\serve-lan.cjs
pause
