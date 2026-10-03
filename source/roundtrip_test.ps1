# roundtrip_test.ps1 - 让修改器完整走一遍「加载→改值→写入」，再校验它写出的档是否合法
#   写入后 checksum 仍 MATCH   -> 写入逻辑自洽
#   写入后 checksum MISMATCH   -> 写入逻辑有 bug（可复现别人的损坏）
#   同时对比格式（缩进/换行/体积/末尾换行）与游戏原始档的差异
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
  return @{ Nl = $nl; Ind = $ind; Tail = $tail; Len = $txt.Length }
}

$work = Join-Path $env:TEMP 'rh_roundtrip'
if (Test-Path $work) { Remove-Item $work -Recurse -Force }
New-Item -ItemType Directory -Path $work -Force | Out-Null

$saves = 'C:\Users\Thus\AppData\Roaming\Rebirth Hoarder\steam-cloud\saves'
$sandbox = Join-Path $work 'saves'
New-Item -ItemType Directory -Path $sandbox -Force | Out-Null
foreach ($n in @('progress-current.json','progress-manual-2.json')) {
  $p = Join-Path $saves $n
  if (Test-Path $p) { Copy-Item $p (Join-Path $sandbox $n) -Force }
}
A ("沙盒: " + $sandbox)
A ''

$exe = 'D:\桌面\末世房车MOD工具库\修改器\存档修改器.exe'
$haveExe = Test-Path $exe
A ("修改器 exe 存在=" + $haveExe)
if (-not $haveExe) { $L -join "`r`n" | Set-Content "$env:TEMP\roundtrip.txt" -Encoding UTF8; exit 1 }

A ''
A '--- 写入前格式基线 ---'
foreach ($n in @('progress-current.json','progress-manual-2.json')) {
  $p = Join-Path $sandbox $n
  if (-not (Test-Path $p)) { continue }
  $txt = [Text.Encoding]::UTF8.GetString([IO.File]::ReadAllBytes($p))
  $f = FmtOf $txt
  $realLen = (Get-Item $p).Length
  A ("[前] " + $n + "  字节=" + $realLen + "  字符=" + $f.Len + "  换行=" + $f.Nl + "  格式=" + $f.Ind + "  末尾换行=" + $f.Tail)
}

A ''
A '--- 运行 --selftest（加载→各标签页改值→写入）---'
$outLog = Join-Path $work 'selftest.out'
$p = Start-Process -FilePath $exe -ArgumentList @('--selftest', ('"' + $sandbox + '"'), ('"' + $outLog + '"')) -Wait -PassThru -NoNewWindow
A ("退出码=" + $p.ExitCode)
if (Test-Path $outLog) {
  foreach ($ln in ((Get-Content $outLog -Raw -Encoding UTF8) -split "`r?`n")) { if ($ln.Trim()) { A ('  | ' + $ln) } }
} else { A '  (无自检输出文件)' }

A ''
A '--- 写入后：格式与校验 ---'
foreach ($n in @('progress-current.json','progress-manual-2.json')) {
  $p = Join-Path $sandbox $n
  if (-not (Test-Path $p)) { continue }
  $txt = [Text.Encoding]::UTF8.GetString([IO.File]::ReadAllBytes($p))
  $f = FmtOf $txt
  $realLen = (Get-Item $p).Length
  A ("[后] " + $n + "  字节=" + $realLen + "  字符=" + $f.Len + "  换行=" + $f.Nl + "  格式=" + $f.Ind + "  末尾换行=" + $f.Tail)
  $head = $txt.Substring(0, [Math]::Min(70, $txt.Length)).Replace("`r", '\r').Replace("`n", '\n')
  A ("     头部: " + $head)
  $rep = $p + '.rhcheck.txt'
  if (Test-Path $rep) { Remove-Item $rep -Force }
  Start-Process -FilePath $exe -ArgumentList @('--check', ('"' + $p + '"')) -Wait -NoNewWindow | Out-Null
  if (Test-Path $rep) {
    foreach ($ln in ((Get-Content $rep -Raw -Encoding UTF8) -split "`r?`n")) {
      $t = $ln.Trim()
      if ($t -match '^(revision|checksumAlg|computed|stored|result)' -or $t -match '^!\s*会丢弃') { A ('     ' + $t) }
    }
    Remove-Item $rep -Force -ErrorAction SilentlyContinue
  } else { A '     (未生成校验报告)' }
  A ''
}

# 额外：用 --check 校验“游戏自己写的原始档”作为对照
A '--- 对照：游戏原始档（未改过）---'
foreach ($n in @('progress-current.json','progress-manual-2.json')) {
  $p = Join-Path $saves $n
  if (-not (Test-Path $p)) { continue }
  $cp = Join-Path $work ('orig_' + $n)
  Copy-Item $p $cp -Force
  Start-Process -FilePath $exe -ArgumentList @('--check', ('"' + $cp + '"')) -Wait -NoNewWindow | Out-Null
  $rep = $cp + '.rhcheck.txt'
  if (Test-Path $rep) {
    foreach ($ln in ((Get-Content $rep -Raw -Encoding UTF8) -split "`r?`n")) {
      $t = $ln.Trim()
      if ($t -match '^(result|computed|stored)') { A ('  ' + $n + ': ' + $t) }
    }
  }
}

$L -join "`r`n" | Set-Content "$env:TEMP\roundtrip.txt" -Encoding UTF8
Write-Output 'done'
