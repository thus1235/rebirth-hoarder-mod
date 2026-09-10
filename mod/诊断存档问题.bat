@echo off
chcp 65001 >nul
title 末世房车 存档修改器 - 一键诊断
cd /d "%~dp0"
"%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy Bypass -File "%~dp0diagnose_save.ps1"
echo.
echo 诊断结束。若窗口一闪而过，请右键本文件 -^> 以管理员身份运行，
echo 或把同目录生成的「诊断报告.txt」发给作者。
pause
