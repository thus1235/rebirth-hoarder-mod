@echo off
chcp 936 >nul
title 末世：我有一辆房车 - MOD 还原器（脚本版·免环境）
setlocal EnableExtensions

set "GAME_DIR=%~1"
if defined GAME_DIR goto :check
if exist "D:\桌面\末世：我有一辆房车\Rebirth Hoarder.exe" set "GAME_DIR=D:\桌面\末世：我有一辆房车" & goto :check
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

rem —— 降级防护：若游戏已经 Steam 更新（app.asar 重新出现），
rem    绝不能用旧备份覆盖新版，否则游戏会被降级并触发 Steam 校验重下。
if exist "%RES%\app.asar" (
  echo.
  echo [提示] 检测到 %RES%\app.asar 已存在 —— 游戏可能已更新到新版本。
  echo        为防止用旧备份把游戏覆盖成旧版，已跳过还原。
  echo        若你确实想还原为备份版本，请先手动删除当前 app.asar 后重试；
  echo        否则无需处理，直接关闭本窗口即可。
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