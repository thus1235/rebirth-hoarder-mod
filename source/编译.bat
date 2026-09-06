@echo off
chcp 936 >nul
set CSC=C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe
if not exist "%CSC%" set CSC=C:\Windows\Microsoft.NET\Framework\v4.0.30319\csc.exe
if not exist "%CSC%" echo [´íÎó] Î´ÕÒµ½ .NET Framework ±àÒëÆ÷ && pause && exit /b 1
"%CSC%" /nologo /codepage:65001 /target:winexe /out:´æµµÐÞ¸ÄÆ÷.exe /r:System.dll /r:System.Core.dll /r:System.Drawing.dll /r:System.Windows.Forms.dll /r:System.Numerics.dll save_editor.cs save_editor_extra.cs game_names.cs
echo.
echo ±àÒëÍê³É£º%CD%\´æµµÐÞ¸ÄÆ÷.exe
pause