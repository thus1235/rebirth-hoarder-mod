# test_locate_full.ps1 - 穷举验证 install_mod.ps1 的 7 条游戏定位线索
# 原则：不破坏用户环境 —— 临时注册表改动测完立刻恢复，临时进程测完 kill，临时目录测完删除
$ErrorActionPreference = 'Continue'
$ps1 = 'D:\桌面\末世房车MOD工具库\修改器\install_mod.ps1'
$out = New-Object System.Collections.ArrayList
function A($s) { [void]$out.Add([string]$s) }
function OK($b) { if ($b) { return '[PASS]' } else { return '[FAIL]' } }

$base = Join-Path $env:TEMP 'rh_loc_full'
if (Test-Path $base) { Remove-Item $base -Recurse -Force }
New-Item -ItemType Directory -Path $base -Force | Out-Null
$exeName = 'Rebirth Hoarder.exe'

# ---------- 载入被测函数（只取函数定义，不跑主流程） ----------
$tokens = $null; $errors = $null
$ast = [System.Management.Automation.Language.Parser]::ParseFile($ps1, [ref]$tokens, [ref]$errors)
$fns = $ast.FindAll({ param($n) $n -is [System.Management.Automation.Language.FunctionDefinitionAst] }, $true)
$want = @('Get-GameDirFrom','Get-ShellFolder','Get-SteamGameDir','Get-CommonPlaceGameDir')
foreach ($fn in $fns) { if ($want -contains $fn.Name) { Invoke-Expression $fn.Extent.Text } }
$okSyntax = ($errors.Count -eq 0) -and (@($fns | Where-Object { $want -contains $_.Name }).Count -eq 4)
A ("[PRE] syntax errors = " + $errors.Count + "  loaded 4/4 = " + (@($fns | Where-Object { $want -contains $_.Name }).Count -eq 4) + "  " + (OK $okSyntax))
A ''

$pass = 0; $fail = 0
function Check($name, $cond, $detail) {
  if ($cond) { $script:pass++ } else { $script:fail++ }
  A ("" + (OK $cond) + " " + $name + "   " + $detail)
}

# ================= 线索 1：命令行参数 / 拖放 =================
A '=== 线索1 参数/拖放（6 种写法）==='
$real = 'D:\桌面\末世：我有一辆房车'
Check 'dir'          ((Get-GameDirFrom $real) -eq $real)                      ("-> " + (Get-GameDirFrom $real))
Check 'exe file'     ((Get-GameDirFrom ($real + '\' + $exeName)) -eq $real)   ("-> exe 取父目录")
Check 'quoted'       ((Get-GameDirFrom ('"' + $real + '"')) -eq $real)        ("-> 去引号")
Check 'trailing sep' ((Get-GameDirFrom ($real + '\')) -eq $real)              ("-> 去尾斜杠")
Check 'forward slash'((Get-GameDirFrom ($real.Replace('\','/'))) -eq $real)   ("-> 正斜杠归一")
$sp = Join-Path $base 'with space dir'; New-Item -ItemType Directory -Path $sp -Force | Out-Null
Set-Content -LiteralPath (Join-Path $sp $exeName) -Value 'x'
Check 'path with space' ((Get-GameDirFrom $sp) -eq $sp)                       ("-> 含空格目录")
Check 'bad path'     ($null -eq (Get-GameDirFrom 'Z:\nope'))                  ("-> 无效路径返回空")
A ''

# ================= 线索 2：运行中的进程路径 =================
A '=== 线索2 运行中进程路径（真实启动一个同名进程）==='
$procDir = Join-Path $base 'proc\GameFolder'
New-Item -ItemType Directory -Path $procDir -Force | Out-Null
$procExe = Join-Path $procDir $exeName
Copy-Item "$env:SystemRoot\System32\ping.exe" $procExe -Force
$p = $null
try {
  $p = Start-Process -FilePath $procExe -ArgumentList '-t','127.0.0.1' -PassThru -WindowStyle Hidden
  Start-Sleep -Milliseconds 1200
  $procs = @(Get-Process -Name 'Rebirth Hoarder' -ErrorAction SilentlyContinue |
             Where-Object { $_.Path -and $_.Path.StartsWith($base, [System.StringComparison]::OrdinalIgnoreCase) })
  Check 'process detected' ($procs.Count -gt 0) ("-> 检测到 " + $procs.Count + " 个同名进程")
  if ($procs.Count -gt 0 -and $procs[0].Path) {
    $fromProc = Get-GameDirFrom (Split-Path -Parent $procs[0].Path)
    Check 'resolved from process' ($fromProc -eq $procDir) ("-> " + $fromProc)
  } else {
    Check 'resolved from process' $false '-> 拿不到进程 Path（权限？）'
  }
} catch {
  Check 'process test' $false ("-> 异常: " + $_.Exception.Message)
} finally {
  if ($p -and -not $p.HasExited) { Stop-Process -Id $p.Id -Force -ErrorAction SilentlyContinue }
  Start-Sleep -Milliseconds 300
  $left = @(Get-Process -Name 'Rebirth Hoarder' -ErrorAction SilentlyContinue).Count
  A ("     进程已清理，残留 " + $left + " 个")
}
A ''

# ================= 线索 3：缓存文件 =================
A '=== 线索3 缓存文件 ==='
$cacheDir = Join-Path $base 'cacheGame'; New-Item -ItemType Directory -Path $cacheDir -Force | Out-Null
Set-Content -LiteralPath (Join-Path $cacheDir $exeName) -Value 'x'
$cacheFile = Join-Path $base 'gamedir.txt'
Set-Content -LiteralPath $cacheFile -Value $cacheDir
$fromCache = Get-GameDirFrom (Get-Content -LiteralPath $cacheFile -Raw)
Check 'cache hit'      ($fromCache -eq $cacheDir)  ("-> " + $fromCache)
Set-Content -LiteralPath $cacheFile -Value 'Z:\stale\old'
Check 'stale cache fx' ($null -eq (Get-GameDirFrom (Get-Content -LiteralPath $cacheFile -Raw))) '-> 失效路径返回空（会继续走后续线索）'
A ''

# ================= 线索 4：安装包附近（上溯 3 层） =================
A '=== 线索4 安装包附近（模拟主流程的上溯循环）==='
$base4 = Join-Path $base 'iso4'
$nearGame = Join-Path $base4 'GameFolder'; New-Item -ItemType Directory -Path $nearGame -Force | Out-Null
Set-Content -LiteralPath (Join-Path $nearGame $exeName) -Value 'x'
$tools = Join-Path $base4 'tools'; New-Item -ItemType Directory -Path $tools -Force | Out-Null
# 复刻主流程: $d = scriptDir; for i<3 { try; $d = parent }
$d = $tools; $found4 = $null
for ($i = 0; $i -lt 3; $i++) {
  if (-not $d) { break }
  $found4 = Get-GameDirFrom $d
  if ($found4) { break }
  $d = Split-Path -Parent $d
}
Check 'parent-level hit' ($found4 -eq $nearGame) ("-> 从 $tools 上溯找到 " + $found4)
# 反例：游戏在上溯范围之外（tools\a\b\c）
$deepTools = Join-Path $base 'tools2\x\y\z'; New-Item -ItemType Directory -Path $deepTools -Force | Out-Null
$farGame = Join-Path $base 'FarGame'; New-Item -ItemType Directory -Path $farGame -Force | Out-Null
Set-Content -LiteralPath (Join-Path $farGame $exeName) -Value 'x'
$d = $deepTools; $found4b = $null
for ($i = 0; $i -lt 3; $i++) {
  if (-not $d) { break }
  $found4b = Get-GameDirFrom $d
  if ($found4b) { break }
  $d = Split-Path -Parent $d
}
Check 'beyond 3 levels -> miss' ($null -eq $found4b) '-> 超出上溯范围返回空（符合设计，由常见位置兜底）'
A ''

# ================= 线索 5：Steam 库（临时改注册表 + 造假库） =================
A '=== 线索5 Steam 库（临时改 HKCU SteamPath，测完恢复）==='
$regKey = 'HKCU:\Software\Valve\Steam'
$origSteamPath = $null
try { $origSteamPath = (Get-ItemProperty $regKey -ErrorAction SilentlyContinue).SteamPath } catch {}
A ("     原始 HKCU SteamPath = " + $origSteamPath)
$libRoot = Join-Path $base 'FakeSteamLib'
$gameInLib = Join-Path $libRoot 'steamapps\common\Rebirth Hoarder'
New-Item -ItemType Directory -Path $gameInLib -Force | Out-Null
Set-Content -LiteralPath (Join-Path $gameInLib $exeName) -Value 'x'
# 造 libraryfolders.vdf（VDF 里路径用双反斜杠转义）
$vdfPath = Join-Path $libRoot 'steamapps\libraryfolders.vdf'
$libEsc = $libRoot.Replace('\','\\')
$vdfText = @"
"libraryfolders"
{
	"0"
	{
		"path"		"$libEsc"
	}
}
"@
Set-Content -LiteralPath $vdfPath -Value $vdfText -Encoding UTF8
A ("     临时库: " + $libRoot)
A ("     vdf: " + (Get-Content -LiteralPath $vdfPath -Raw).Replace("`r`n",' | '))
try {
  if (-not (Test-Path $regKey)) { New-Item -Path $regKey -Force | Out-Null }
  Set-ItemProperty -Path $regKey -Name SteamPath -Value $libRoot -ErrorAction Stop
  $fromSteam = Get-SteamGameDir
  Check 'steam lib hit' ($fromSteam -eq $gameInLib) ("-> " + $fromSteam)
} catch {
  Check 'steam lib hit' $false ("-> 异常: " + $_.Exception.Message)
} finally {
  try {
    if ($origSteamPath) { Set-ItemProperty -Path $regKey -Name SteamPath -Value $origSteamPath }
    else { Remove-ItemProperty -Path $regKey -Name SteamPath -ErrorAction SilentlyContinue }
  } catch {}
  $nowBack = $null
  try { $nowBack = (Get-ItemProperty $regKey -ErrorAction SilentlyContinue).SteamPath } catch {}
  Check 'steampath restored' ($nowBack -eq $origSteamPath) ("-> 已恢复为 " + $nowBack)
}
# 负例：库里没有该游戏 -> 返回空
$emptyLib = Join-Path $base 'EmptyLib'
New-Item -ItemType Directory -Path (Join-Path $emptyLib 'steamapps\common\SomeOtherGame') -Force | Out-Null
$vdf2 = Join-Path $emptyLib 'steamapps\libraryfolders.vdf'
$e2 = $emptyLib.Replace('\','\\')
Set-Content -LiteralPath $vdf2 -Value ('"libraryfolders"{ "0" { "path" "' + $e2 + '" } }') -Encoding UTF8
try {
  Set-ItemProperty -Path $regKey -Name SteamPath -Value $emptyLib -ErrorAction Stop
  $none = Get-SteamGameDir
  Check 'steam lib miss -> null (no crash)' ($null -eq $none -or $none -notlike "$emptyLib*") ("-> [" + $none + "]")
} catch {
  Check 'steam lib miss -> null (no crash)' $false ("-> 异常: " + $_.Exception.Message)
} finally {
  try {
    if ($origSteamPath) { Set-ItemProperty -Path $regKey -Name SteamPath -Value $origSteamPath }
    else { Remove-ItemProperty -Path $regKey -Name SteamPath -ErrorAction SilentlyContinue }
  } catch {}
}
$finalPath = $null
try { $finalPath = (Get-ItemProperty $regKey -ErrorAction SilentlyContinue).SteamPath } catch {}
Check 'steampath finally restored' ($finalPath -eq $origSteamPath) ("-> " + $finalPath)
A ''

# ================= 线索 6：常见位置 =================
A '=== 线索6 常见位置（真实机器）==='
$sw = [System.Diagnostics.Stopwatch]::StartNew()
$fromCommon = $null
try { $fromCommon = Get-CommonPlaceGameDir } catch { A ("     异常: " + $_.Exception.Message) }
$sw.Stop()
Check 'common places hit real game' ($fromCommon -eq $real) ("-> " + $fromCommon + "  (" + $sw.ElapsedMilliseconds + " ms)")
# 覆盖面核对：把该函数用到的根目录清单打印出来（人工可核对）
A '     --- 该函数纳入的根目录类别（源码核对）---'
$src6 = ($fns | Where-Object { $_.Name -eq 'Get-CommonPlaceGameDir' }).Extent.Text
foreach ($k in @('Desktop','Personal','374DE290','USERPROFILE','Downloads','Documents','Saved Games','DriveInfo','Games','游戏','单机游戏','PC Games','SteamLibrary','Program Files')) {
  $has = $src6 -like ("*" + $k + "*")
  A ("       " + (OK $has) + " " + $k)
}
A ''

# ================= 线索 7：手动输入（含拖放粘贴形态） =================
A '=== 线索7 手动输入形态 ==='
Check 'quoted+space' ((Get-GameDirFrom ('"' + $sp + '"')) -eq $sp) '-> 拖入的带引号含空格路径'
Check 'double sep tail' ((Get-GameDirFrom ($sp + '\\')) -eq $sp)   '-> 尾部双斜杠'
Check 'mixed slashes'  ((Get-GameDirFrom ($sp.Replace('\','/'))) -eq $sp) '-> 粘贴成混合斜杠'
Check 'null input'     ($null -eq (Get-GameDirFrom $null)) '-> 直接回车'
Check 'blank input'    ($null -eq (Get-GameDirFrom '   ')) '-> 只打空格'
A ''

# ================= 多候选可预测性 =================
A '=== 多候选：同一目录下多个游戏目录（验证枚举排序带来的确定性）==='
$multi = Join-Path $base 'iso5'
$gA = Join-Path $multi '末世房车'; New-Item -ItemType Directory -Path $gA -Force | Out-Null
Set-Content -LiteralPath (Join-Path $gA $exeName) -Value 'x'
$gB = Join-Path $multi '末世房车 - 副本'; New-Item -ItemType Directory -Path $gB -Force | Out-Null
Set-Content -LiteralPath (Join-Path $gB $exeName) -Value 'x'
$pick1 = Get-GameDirFrom $multi
$pick2 = Get-GameDirFrom $multi
Check 'deterministic across calls' ($pick1 -eq $pick2) ("-> 两次一致: " + $pick1)
Check 'prefers non-copy (shorter name)' ($pick1 -eq $gA) ("-> 选中 " + $pick1 + "（副本为 " + $gB + "）")
A ''

# ================= 线索优先级 =================
A '=== 优先级：进程 > 缓存（按主流程顺序模拟）==='
$pdir = Join-Path $base 'prio\procGame'; New-Item -ItemType Directory -Path $pdir -Force | Out-Null
Copy-Item "$env:SystemRoot\System32\ping.exe" (Join-Path $pdir $exeName) -Force
$cdir = Join-Path $base 'prio\cacheGame'; New-Item -ItemType Directory -Path $cdir -Force | Out-Null
Set-Content -LiteralPath (Join-Path $cdir $exeName) -Value 'x'
$pp = $null
try {
  $pp = Start-Process -FilePath (Join-Path $pdir $exeName) -ArgumentList '-t','127.0.0.1' -PassThru -WindowStyle Hidden
  Start-Sleep -Milliseconds 1200
  # 复刻主流程：(1)参数 -> (2)进程 -> (3)缓存
  $pick = Get-GameDirFrom $null
  if (-not $pick) {
    $pr = @(Get-Process -Name 'Rebirth Hoarder' -ErrorAction SilentlyContinue |
            Where-Object { $_.Path -and $_.Path.StartsWith($base, [System.StringComparison]::OrdinalIgnoreCase) })
    if ($pr.Count -gt 0 -and $pr[0].Path) { $pick = Get-GameDirFrom (Split-Path -Parent $pr[0].Path) }
  }
  if (-not $pick) { $pick = Get-GameDirFrom $cdir }
  Check 'process wins over cache' ($pick -eq $pdir) ("-> 选中 " + $pick + "（缓存里是 " + $cdir + "）")
} catch {
  Check 'process wins over cache' $false ("-> 异常: " + $_.Exception.Message)
} finally {
  if ($pp -and -not $pp.HasExited) { Stop-Process -Id $pp.Id -Force -ErrorAction SilentlyContinue }
  Start-Sleep -Milliseconds 300
}
A ''

# ================= 清理 =================
A '=== 清理 ==='
$resid = @(Get-Process -Name 'Rebirth Hoarder' -ErrorAction SilentlyContinue).Count
A ("   残留同名进程: " + $resid)
if (Test-Path $base) { Remove-Item $base -Recurse -Force -ErrorAction SilentlyContinue }
A ("   临时目录已删除: " + (-not (Test-Path $base)))
$finalSteam = $null
try { $finalSteam = (Get-ItemProperty 'HKCU:\Software\Valve\Steam' -ErrorAction SilentlyContinue).SteamPath } catch {}
A ("   注册表 SteamPath 最终值: " + $finalSteam)
A ''
A ("================ 结果：通过 " + $pass + " 项，失败 " + $fail + " 项 ================")

$out -join "`r`n" | Set-Content "$env:TEMP\locate_full.txt" -Encoding UTF8
Write-Output 'done'
