@echo off
chcp 936 >nul
title 末世：我有一辆房车 - MOD 还原器（脚本版·免环境）
setlocal EnableExtensions

rem 【v3.7 / 2026-09-05】
rem  · 新增候选目录：正式版优先，其次副本；
rem  · 还原时顺带清理 MOD 版本记录 rhmod_installed.json；
rem  · 游戏已更新（app.asar 重新出现）时提示可直接用「安装MOD.bat」自动重装。

set "GAME_DIR=%~1"
if defined GAME_DIR goto :check
if exist "D:/桌面/末世：我有一辆房车/Rebirth Hoarder.exe" set "GAME_DIR=D:/桌面/末世：我有一辆房车" & goto :check
if exist "D:/桌面/末世：我有一辆房车 - 副本/Rebirth Hoarder.exe" set "GAME_DIR=D:/桌面/末世：我有一辆房车 - 副本" & goto :check
echo 未自动找到游戏目录，请手动输入游戏安装目录：
set /p "GAME_DIR=游戏目录: "

:check
if not exist "%GAME_DIR%\Rebirth Hoarder.exe" (
  echo.
  echo [错误] 未找到 "%GAME_DIR%\Rebirth Hoarder.exe"
  echo 请确认游戏目录正确后重新运行本脚本。
  pause
  exit /b 1
)

set "RES=%GAME_DIR%\resources"

if exist "%RES%\app" (
  rmdir /s /q "%RES%\app"
  echo 已删除 MOD 的 app 目录。
) else (
  echo 未发现 MOD 的 app 目录。
)

rem —— 清理 MOD 版本记录文件（如有）——
if exist "%RES%\rhmod_installed.json" del /q "%RES%\rhmod_installed.json" >nul 2>&1

rem —— 降级防护：若游戏已经 Steam 更新（app.asar 重新出现），
rem    绝不能用旧备份覆盖新版，否则游戏会被降级并触发 Steam 校验重下。
if exist "%RES%\app.asar" (
  echo.
  echo [提示] 检测到 %RES%\app.asar 已存在 —— 游戏可能已更新到新版本。
  echo        旧 MOD 已随之失效，此时无需还原，直接双击「安装MOD.bat」
  echo        即可按新版本自动清理重装。
  echo        （旧备份 app.asar.bak 已保留，确认不需要后可手动删除）
  echo.
  pause
  exit /b 0
)

if exist "%RES%\app.asar.bak" (
  move /y "%RES%\app.asar.bak" "%RES%\app.asar" >nul
  echo 已还原原版 app.asar。
) else (
  echo 未发现备份 app.asar.bak（游戏可能已是原版）。
)

echo.
echo 还原完成，游戏已恢复原版。
pause
exit /b 0
