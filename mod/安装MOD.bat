@echo off
chcp 936 >nul
title 末世：我有一辆房车 - MOD 安装器（双击即装/更新到最新）
rem 首次安装会解包（需 1~3 分钟）；已装过则自动覆盖更新补丁（几秒钟）
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0install_mod.ps1" %*
exit /b %errorlevel%