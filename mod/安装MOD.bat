@echo off
chcp 936 >nul
title 末世：我有一辆房车 - MOD 安装器（脚本版·免环境）
rem 用法：安装MOD.bat           正常安装
rem       安装MOD.bat -force    已装过时强制覆盖更新到最新补丁
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0install_mod.ps1" %*
exit /b %errorlevel%