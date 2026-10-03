# build_and_check.ps1 - 编译带 --check 的修改器 + 用真实存档验证报告内容
$ErrorActionPreference = 'Continue'
$L = New-Object System.Collections.ArrayList
function A($s) { [void]$L.Add([string]$s) }

$src = 'D:\桌面\末世房车MOD工具库\源代码\存档修改器-源代码'
$csc = 'C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe'
if (-not (Test-Path $csc)) { $csc = 'C:\Windows\Microsoft.NET\Framework\v4.0.30319\csc.exe' }

$work = Join-Path $env:TEMP 'rh_cli_build'
if (Test-Path $work) { Remove-Item $work -Recurse -Force }
New-Item -ItemType Directory -Path $work -Force | Out-Null
$exe = Join-Path $work '存档修改器.exe'

$cargs = @('/nologo', '/codepage:65001', '/target:winexe', ("/out:" + $exe),
  '/r:System.dll', '/r:System.Core.dll', '/r:System.Drawing.dll', '/r:System.Windows.Forms.dll', '/r:System.Numerics.dll',
  'save_editor.cs', 'save_editor_extra.cs', 'save_editor_add.cs', 'lang.cs', 'game_names.cs', 'item_table.cs')
Push-Location $src
$compile = & $csc @cargs 2>&1 | Out-String
Pop-Location
A '--- compile output ---'
if ($compile.Trim()) { A $compile } else { A '(no output = success)' }
$sz = 0
if (Test-Path $exe) { $sz = (Get-Item $exe).Length }
A ("exe exists=" + (Test-Path $exe) + "  size=" + $sz)
A ''

if (-not (Test-Path $exe)) {
  $L -join "`r`n" | Set-Content "$env:TEMP\build_check.txt" -Encoding UTF8
  Write-Output 'compile failed'; exit 1
}

# 用真实存档副本验证 --check（winexe 无控制台输出，故结果写在 .rhcheck.txt）
$saves = 'C:\Users\Thus\AppData\Roaming\Rebirth Hoarder\steam-cloud\saves'
$copyDir = Join-Path $work 'saves'
New-Item -ItemType Directory -Path $copyDir -Force | Out-Null
foreach ($n in @('progress-current.json','progress-manual-2.json')) {
  $p = Join-Path $saves $n
  if (Test-Path $p) { Copy-Item $p (Join-Path $copyDir $n) -Force }
}
$cor = Join-Path $saves 'corrupt'
if (Test-Path $cor) {
  $i = 0
  Get-ChildItem $cor -File -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending | ForEach-Object {
    if ($i -lt 2) { Copy-Item $_.FullName (Join-Path $copyDir $_.Name) -Force; $i++ }
  }
}

A '--- --check reports (real save copies) ---'
foreach ($f in (Get-ChildItem $copyDir -File -Filter '*.json' | Sort-Object Name)) {
  $p = Start-Process -FilePath $exe -ArgumentList @('--check', ('"' + $f.FullName + '"')) -Wait -PassThru -NoNewWindow
  $rep = $f.FullName + '.rhcheck.txt'
  A ''
  A ("### " + $f.Name + "  (" + $f.Length + " bytes)  exit=" + $p.ExitCode)
  if (Test-Path $rep) {
    foreach ($ln in ((Get-Content $rep -Raw -Encoding UTF8) -split "`r?`n")) { if ($ln.Trim()) { A ("    " + $ln) } }
  } else { A '    (report not generated)' }
}

$L -join "`r`n" | Set-Content "$env:TEMP\build_check.txt" -Encoding UTF8
Write-Output 'done'
