@echo off
chcp 936 >nul
set CSC=C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe
if not exist "%CSC%" set CSC=C:\Windows\Microsoft.NET\Framework\v4.0.30319\csc.exe
if not exist "%CSC%" echo [����] δ�ҵ� .NET Framework ������ && pause && exit /b 1
"%CSC%" /nologo /codepage:65001 /target:winexe /out:�浵�޸���.exe /r:System.dll /r:System.Core.dll /r:System.Drawing.dll /r:System.Windows.Forms.dll /r:System.Numerics.dll save_editor.cs save_editor_extra.cs save_editor_add.cs lang.cs game_names.cs item_table.cs
echo.
echo ������ɣ�%CD%\�浵�޸���.exe
pause