@echo off
chcp 936 >nul
title 末世：我有一辆房车 - MOD 更新器（已装过 MOD 时双击此文件）
rem 用法：双击即可自动更新；也可把游戏目录拖到本文件上，或加参数指定
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0install_mod.ps1" -force %*
exit /b %errorlevel%