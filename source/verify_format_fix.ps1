# verify_format_fix.ps1 - 编译修改后的修改器，跑往返实验验证写入格式已与游戏一致
$ErrorActionPreference = 'Continue'
$L = New-Object System.Collections.ArrayList
function A($s) { [void]$L.Add([string]$s) }

function FmtOf([string]$txt) {
  $nl = 'none'
  if ($txt.Contains("`r`n")) { $nl = 'CRLF' } elseif ($txt.Contains("`n")) { $nl = 'LF' }
  $ind = 'compact(紧凑)'
  if ($txt -match '\n\s+"') { $ind = 'pretty(缩进)' }
  $tail = 'no'
  if ($txt.EndsWith("`n")) { $tail = 'yes' }
  return @{ Nl = $nl; Ind = $ind; Tail = $tail }
}

# ---- 编译 ----
$src = 'D:\桌面\末世房车MOD工具库\源代码\存档修改器-源代码'
$csc = 'C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe'
if (-not (Test-Path $csc)) { $csc = 'C:\Windows\Microsoft.NET\Framework\v4.0.30319\csc.exe' }
$work = Join-Path $env:TEMP 'rh_fmtfix'
if (Test-Path $work) { Remove-Item $work -Recurse -Force }
New-Item -ItemType Directory -Path $work -Force | Out-Null
$exe = Join-Path $work '存档修改器.exe'
$cargs = @('/nologo', '/codepage:65001', '/target:winexe', ("/out:" + $exe),
  '/r:System.dll', '/r:System.Core.dll', '/r:System.Drawing.dll', '/r:System.Windows.Forms.dll', '/r:System.Numerics.dll',
  'save_editor.cs', 'save_editor_extra.cs', 'save_editor_add.cs', 'lang.cs', 'game_names.cs', 'item_table.cs')
Push-Location $src
$compile = & $csc @cargs 2>&1 | Out-String
Pop-Location
A '--- 编译 ---'
if ($compile.Trim()) { A $compile } else { A '(无输出 = 成功)' }
if (-not (Test-Path $exe)) { A '编译失败'; $L -join "`r`n" | Set-Content "$env:TEMP\fmtfix.txt" -Encoding UTF8; exit 1 }

# ---- 准备沙盒 ----
$saves = 'C:\Users\Thus\AppData\Roaming\Rebirth Hoarder\steam-cloud\saves'
$sandbox = Join-Path $work 'saves'
New-Item -ItemType Directory -Path $sandbox -Force | Out-Null
Copy-Item (Join-Path $saves 'progress-current.json') (Join-Path $sandbox 'progress-current.json') -Force

$orig = [Text.Encoding]::UTF8.GetString([IO.File]::ReadAllBytes((Join-Path $saves 'progress-current.json')))
$fo = FmtOf $orig
A ''
A ("[游戏原档] 字节=" + (Get-Item (Join-Path $saves 'progress-current.json')).Length + "  换行=" + $fo.Nl + "  格式=" + $fo.Ind + "  末尾换行=" + $fo.Tail)
A ("           头部: " + $orig.Substring(0, 70))

# ---- selftest（走完整加载→改值→写入）----
$outLog = Join-Path $work 'st.out'
$p = Start-Process -FilePath $exe -ArgumentList @('--selftest', ('"' + $sandbox + '"'), ('"' + $outLog + '"')) -Wait -PassThru -NoNewWindow
A ''
A ("--- selftest 退出码=" + $p.ExitCode + " ---")

# ---- 写入后对比 ----
$after = Join-Path $sandbox 'progress-current.json'
$txt = [Text.Encoding]::UTF8.GetString([IO.File]::ReadAllBytes($after))
$fa = FmtOf $txt
$lenAfter = (Get-Item $after).Length
A ''
A ("[修改器写出] 字节=" + $lenAfter + "  换行=" + $fa.Nl + "  格式=" + $fa.Ind + "  末尾换行=" + $fa.Tail)
A ("             头部: " + $txt.Substring(0, 70))
A ''
A '--- 判定 ---'
$sizeOk = ($lenAfter -lt 700000)
$fmtOk = ($fa.Ind -like 'compact*') -and ($fa.Tail -eq 'no')
if ($sizeOk) { A ('  [PASS] 体积未翻倍 (' + $lenAfter + ' vs 修复前 976133)') } else { A ('  [FAIL] 体积仍异常 (' + $lenAfter + ')') }
if ($fmtOk) { A ('  [PASS] 格式=紧凑, 末尾无换行') } else { A ('  [FAIL] 格式=' + $fa.Ind + ', 末尾换行=' + $fa.Tail) }

# ---- checksum 仍须通过 ----
$rep = $after + '.rhcheck.txt'
if (Test-Path $rep) { Remove-Item $rep -Force }
Start-Process -FilePath $exe -ArgumentList @('--check', ('"' + $after + '"')) -Wait -NoNewWindow | Out-Null
if (Test-Path $rep) {
  foreach ($ln in ((Get-Content $rep -Raw -Encoding UTF8) -split "`r?`n")) {
    $t = $ln.Trim()
    if ($t -match '^(revision|computed|stored|result)' -or $t -match '^!\s*会丢弃' -or $t -match '^\(无\)') { A ('  ' + $t) }
  }
  Remove-Item $rep -Force -ErrorAction SilentlyContinue
}

$L -join "`r`n" | Set-Content "$env:TEMP\fmtfix.txt" -Encoding UTF8
Write-Output 'done'
