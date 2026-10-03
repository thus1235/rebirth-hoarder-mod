# check_codec.ps1 - 用修改器自身的 C# 算法校验真实游戏存档的 checksum
# 目的：判定「修改器的校验和算法」与「游戏记录的校验和」是否一致
#   一致   -> 算法没问题，另行排查
#   不一致 -> 算法/字段结构对不上，这就是"写入成功但游戏判损坏"的根因
$ErrorActionPreference = 'Continue'
$lines = New-Object System.Collections.ArrayList
function A($s) { [void]$lines.Add([string]$s) }

$src = 'D:\桌面\末世房车MOD工具库\源代码\存档修改器-源代码'
$csc = 'C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe'
if (-not (Test-Path $csc)) { $csc = 'C:\Windows\Microsoft.NET\Framework\v4.0.30319\csc.exe' }
A ("csc: " + $csc + "  存在=" + (Test-Path $csc))

$outExe = Join-Path $env:TEMP 'rh_codec_check.exe'
if (Test-Path $outExe) { Remove-Item $outExe -Force }

$cargs = @(
  '/nologo', '/codepage:65001', '/target:exe', ("/out:" + $outExe),
  '/main:RhSaveTrainer.TestMain',
  '/r:System.dll', '/r:System.Core.dll', '/r:System.Drawing.dll',
  '/r:System.Windows.Forms.dll', '/r:System.Numerics.dll',
  'save_editor.cs', 'save_editor_extra.cs', 'save_editor_add.cs',
  'lang.cs', 'game_names.cs', 'item_table.cs', 'test_main.cs'
)
Push-Location $src
$compile = & $csc @cargs 2>&1 | Out-String
Pop-Location
A "--- 编译输出 ---"
A $compile
A ("编译产物存在=" + (Test-Path $outExe))
A ''

if (Test-Path $outExe) {
  $saves = 'C:\Users\Thus\AppData\Roaming\Rebirth Hoarder\steam-cloud\saves'
  $targets = @()
  foreach ($n in @('progress-current.json','progress-current.json.bak1','progress-current.json.bak2','progress-manual-2.json')) {
    $p = Join-Path $saves $n
    if (Test-Path $p) { $targets += $p }
  }
  # 本机 corrupt 目录里的样本（若有）
  $cor = Join-Path $saves 'corrupt'
  if (Test-Path $cor) {
    Get-ChildItem $cor -File -ErrorAction SilentlyContinue | Select-Object -First 3 | ForEach-Object { $targets += $_.FullName }
  }
  A ("--- 待校验 " + $targets.Count + " 个存档 ---")
  foreach ($t in $targets) {
    A ''
    A ("### " + (Split-Path $t -Leaf) + "   (" + (Get-Item $t).Length + " 字节)")
    $r = & $outExe 'check' $t 2>&1 | Out-String
    foreach ($ln in ($r -split "`r?`n")) { if ($ln.Trim()) { A ("    " + $ln.Trim()) } }
  }
}

$lines -join "`r`n" | Set-Content "$env:TEMP\codec_check.txt" -Encoding UTF8
Write-Output 'done'
