# test_diag.ps1 - 语法检查 + 实跑增强后的诊断脚本，回收报告
$ErrorActionPreference = 'Continue'
$L = New-Object System.Collections.ArrayList
function A($s) { [void]$L.Add([string]$s) }

$diag = 'D:\桌面\末世房车MOD工具库\修改器\diagnose_save.ps1'

# 1) 语法检查
$tokens = $null; $errors = $null
$ast = [System.Management.Automation.Language.Parser]::ParseFile($diag, [ref]$tokens, [ref]$errors)
A ("语法错误数: " + $errors.Count)
foreach ($e in $errors) { A ("  [" + $e.Extent.StartLineNumber + ":" + $e.Extent.StartColumnNumber + "] " + $e.Message) }
$fns = $ast.FindAll({ param($n) $n -is [System.Management.Automation.Language.FunctionDefinitionAst] }, $true)
A ("函数: " + (($fns | ForEach-Object { $_.Name }) -join ', '))
A ''

if ($errors.Count -gt 0) {
  $L -join "`r`n" | Set-Content "$env:TEMP\test_diag.txt" -Encoding UTF8
  Write-Output 'syntax errors'; exit 1
}

# 2) 实跑（-NoPause 避免卡输入）
$rep = 'D:\桌面\末世房车MOD工具库\修改器\诊断报告.txt'
if (Test-Path $rep) { Remove-Item $rep -Force }
$sw = [System.Diagnostics.Stopwatch]::StartNew()
& powershell -NoProfile -ExecutionPolicy Bypass -File $diag -NoPause | Out-Null
$sw.Stop()
A ("实跑完成，用时 " + $sw.ElapsedMilliseconds + " ms; 报告存在=" + (Test-Path $rep))
A ''

# 3) 回收报告中的关键段落
if (Test-Path $rep) {
  $txt = Get-Content $rep -Raw -Encoding UTF8
  A '===== 报告中「版本参考」段 ====='
  foreach ($ln in ($txt -split "`r?`n")) { if ($ln -match 'app\.asar|仅供参考') { A ('  ' + $ln.Trim()) } }
  A ''
  A '===== 报告中第 6 项（损坏/实测）全文 ====='
  $lines2 = $txt -split "`r?`n"
  $start = -1
  for ($i = 0; $i -lt $lines2.Count; $i++) { if ($lines2[$i] -match '游戏是否把存档判为损坏') { $start = $i; break } }
  if ($start -ge 0) {
    for ($i = $start; $i -lt [Math]::Min($start + 60, $lines2.Count); $i++) { A ('  ' + $lines2[$i]) }
  } else { A '  (未找到第 6 项)' }
}

# 4) 关掉脚本自动打开的记事本
Start-Sleep -Milliseconds 500
Get-Process notepad -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowTitle -like '*诊断报告*' } | ForEach-Object {
  Stop-Process -Id $_.Id -Force -ErrorAction SilentlyContinue
  A ''
  A ("已关闭打开的记事本 (PID " + $_.Id + ")")
}

$L -join "`r`n" | Set-Content "$env:TEMP\test_diag.txt" -Encoding UTF8
Write-Output 'done'
