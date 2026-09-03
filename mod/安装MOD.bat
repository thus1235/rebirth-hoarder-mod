@echo off
title 末世：我有一辆房车 - MOD 安装器（脚本版·免环境）
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0install_mod.ps1" %*
exit /b %errorlevel%
