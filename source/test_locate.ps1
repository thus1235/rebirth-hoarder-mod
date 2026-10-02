# test_locate.ps1 - 测试 install_mod.ps1 的游戏定位逻辑（只加载函数定义，不跑主流程）
$ErrorActionPreference = 'Stop'
$ps1 = 'D:\桌面\末世房车MOD工具库\修改器\install_mod.ps1'
$out = New-Object System.Collections.ArrayList
function A($s) { [void]$out.Add([string]$s) }
$base = Join-Path $env:TEMP 'rh_locate_test'
if (Test-Path $base) { Remove-Item $base -Recurse -Force }

# 只提取定位相关的函数定义并载入当前作用域
$tokens = $null; $errors = $null
$ast = [System.Management.Automation.Language.Parser]::ParseFile($ps1, [ref]$tokens, [ref]$errors)
$fns = $ast.FindAll({ param($n) $n -is [System.Management.Automation.Language.FunctionDefinitionAst] }, $true)
$want = @('Get-GameDirFrom','Get-ShellFolder','Get-SteamGameDir','Get-CommonPlaceGameDir')
foreach ($fn in $fns) { if ($want -contains $fn.Name) { Invoke-Expression $fn.Extent.Text } }
A ("syntax errors: " + $errors.Count)
A ("loaded: " + (($fns | Where-Object { $want -contains $_.Name } | ForEach-Object { $_.Name }) -join ', '))
A ''

$real = 'D:\桌面\末世：我有一辆房车'
A '== T1 path normalization (real game dir) =='
A ("  dir          -> " + (Get-GameDirFrom $real))
A ("  exe file     -> " + (Get-GameDirFrom ($real + '\Rebirth Hoarder.exe')))
A ("  quoted       -> " + (Get-GameDirFrom ('"' + $real + '"')))
A ("  trailing sep -> " + (Get-GameDirFrom ($real + '\')))
A ("  forward slsh -> " + (Get-GameDirFrom ($real.Replace('\','/'))))
A ("  bad path     -> [" + (Get-GameDirFrom 'Z:\nope\nope') + "] (expect empty)")
A ''

A '== T2 nested structures (each case in its own dir, no interference) =='
# 2a: 两层 —— 游戏目录就在被传入目录的直接子级（Steam: <lib>\steamapps\common\<Game>\）
$d = Join-Path $base 'a'; New-Item -ItemType Directory -Path (Join-Path $d 'GameFolder') -Force | Out-Null
Set-Content -LiteralPath (Join-Path $d 'GameFolder\Rebirth Hoarder.exe') -Value 'x'
A ("  2-level  -> " + (Get-GameDirFrom $d))
# 2b: 游戏目录本身就在被传入目录里
$d = Join-Path $base 'b'; New-Item -ItemType Directory -Path $d -Force | Out-Null
Set-Content -LiteralPath (Join-Path $d 'Rebirth Hoarder.exe') -Value 'x'
A ("  1-level  -> " + (Get-GameDirFrom $d))
# 2c: 三层且中间目录名命中关键词（网盘解压常见）
$d = Join-Path $base 'c'; New-Item -ItemType Directory -Path (Join-Path $d '末世房车\Rebirth Hoarder') -Force | Out-Null
Set-Content -LiteralPath (Join-Path $d '末世房车\Rebirth Hoarder\Rebirth Hoarder.exe') -Value 'x'
A ("  3-level, keyword middle -> " + (Get-GameDirFrom $d))
# 2d: 三层且中间目录名无关键词 -> 设计上不深入（由手动指定兜底）
$d = Join-Path $base 'd'; New-Item -ItemType Directory -Path (Join-Path $d 'whatever\Deep') -Force | Out-Null
Set-Content -LiteralPath (Join-Path $d 'whatever\Deep\Rebirth Hoarder.exe') -Value 'x'
A ("  3-level, no keyword     -> [" + (Get-GameDirFrom $d) + "]  <- design: 2 levels + keyword dive")
A ''

A '== T3 drive root guard =='
A ("  D:   -> [" + (Get-GameDirFrom 'D:') + "] (must not throw)")
A ("  D:\  -> [" + (Get-GameDirFrom 'D:\') + "]")
A ''

A '== T4 steam libraries =='
try { A ("  Get-SteamGameDir -> [" + (Get-SteamGameDir) + "] (empty expected on this machine)") }
catch { A ("  EXCEPTION: " + $_.Exception.Message) }
A ''

A '== T5 common places scan (real machine) =='
$sw = [System.Diagnostics.Stopwatch]::StartNew()
try { $g = Get-CommonPlaceGameDir; A ("  result  -> " + $g) } catch { A ("  EXCEPTION: " + $_.Exception.Message) }
$sw.Stop()
A ("  elapsed -> " + $sw.ElapsedMilliseconds + " ms")
A ''

A '== T6 edge cases =='
A ("  null -> [" + (Get-GameDirFrom $null) + "]")
A ("  ''   -> [" + (Get-GameDirFrom '') + "]")
A ("  '  ' -> [" + (Get-GameDirFrom '   ') + "]")
A ("  '.'  -> [" + (Get-GameDirFrom '.') + "]")
A ("  dir w/o exe -> [" + (Get-GameDirFrom $base) + "] (expect empty)")

if (Test-Path $base) { Remove-Item $base -Recurse -Force }
$out -join "`r`n" | Set-Content "$env:TEMP\locate_test.txt" -Encoding UTF8
Write-Output 'done'
