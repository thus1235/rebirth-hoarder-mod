# install_mod.ps1 - 末世：我有一辆房车 MOD 安装器（v3.22 自动适配版·薄启动器）
#
# 本脚本只做三件事：定位游戏目录 -> 用游戏自带内核运行 mod_patcher.js -> 显示结果。
# 解包 / 语义打补丁 / 校验 / 安装 / 失败自动还原 / 诊断报告 全部由 mod_src\mod_patcher.js 完成，
# 无需玩家安装 Node.js（优先用游戏自带的 Electron 内核，失败时回退系统 node）。
# 游戏更新后无需等新版补丁文件，安装时现场适配；锚点失效则安全中止并生成诊断报告。
param([string]$GameDir = "", [switch]$NoPause)

$ErrorActionPreference = 'Stop'
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$modSrc = Join-Path $scriptDir 'mod_src'

function Write-Step($m) { Write-Host "[MOD] $m" -ForegroundColor Cyan }
function Write-Err($m) { Write-Host "[错误] $m" -ForegroundColor Red }
function Pause-End { if (-not $NoPause) { Read-Host '按回车退出' | Out-Null } }


# ---------- 游戏定位辅助（分享给他人时对方路径各不相同，必须多线索自动查找） ----------
# 判定标准统一为「目录下存在 Rebirth Hoarder.exe」——这是唯一不会随玩家环境变化的硬事实。

function Get-GameDirFrom([string]$path) {
    # 接受：目录 / 目录下的 exe 文件 / 带引号或空格的路径；并兼容多套了一层文件夹
    if ([string]::IsNullOrWhiteSpace($path)) { return $null }
    $p = $path.Trim().Trim('"').Trim("'")
    $p = $p -replace '/', '\'
    if ($p -match '(?i)\.exe$') { $p = Split-Path -Parent $p }
    $p = $p.TrimEnd([char[]]@('\', '/'))
    if ($p -match '^[A-Za-z]:$') { $p = $p + '\' }     # 保护盘根，避免 "D:" 被当成相对路径
    if (-not $p -or -not (Test-Path -LiteralPath $p)) { return $null }
    if (Test-Path (Join-Path $p 'Rebirth Hoarder.exe')) {
        try { return (Resolve-Path -LiteralPath $p).Path } catch { return $p }
    }
    try {
        foreach ($sub in (Get-ChildItem -LiteralPath $p -Directory -ErrorAction SilentlyContinue | Sort-Object Name)) {
            if (Test-Path (Join-Path $sub.FullName 'Rebirth Hoarder.exe')) { return $sub.FullName }
        }
        # 名字像本游戏的子目录，再多看一层：
        # 覆盖「D:\下载\末世房车\Rebirth Hoarder\」这类解压后多套一层的常见结构。
        # 只对名字命中的目录深入，因此盘根扫描不会变慢。
        foreach ($sub in (Get-ChildItem -LiteralPath $p -Directory -ErrorAction SilentlyContinue | Sort-Object Name)) {
            if ($sub.Name -notmatch '(?i)rebirth|hoarder|房车') { continue }
            if (Test-Path (Join-Path $sub.FullName 'Rebirth Hoarder.exe')) { return $sub.FullName }
            try {
                foreach ($sub2 in (Get-ChildItem -LiteralPath $sub.FullName -Directory -ErrorAction SilentlyContinue)) {
                    if (Test-Path (Join-Path $sub2.FullName 'Rebirth Hoarder.exe')) { return $sub2.FullName }
                }
            } catch {}
        }
    } catch {}
    return $null
}

function Get-ShellFolder([string]$key) {
    try {
        $v = (Get-ItemProperty 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\User Shell Folders' -ErrorAction SilentlyContinue).$key
        if ($v) { return [Environment]::ExpandEnvironmentVariables($v) }
    } catch {}
    return $null
}

function Get-SteamGameDir {
    # Steam 可能装在任意盘（实测作者机为 E:\Games\Steam），因此必须读注册表，不能猜常见路径
    $roots = New-Object System.Collections.ArrayList
    foreach ($k in @('HKCU:\Software\Valve\Steam', 'HKLM:\SOFTWARE\WOW6432Node\Valve\Steam', 'HKLM:\SOFTWARE\Valve\Steam')) {
        try {
            $ip = Get-ItemProperty $k -ErrorAction SilentlyContinue
            foreach ($v in @($ip.SteamPath, $ip.InstallPath)) {
                if ($v) { [void]$roots.Add([Environment]::ExpandEnvironmentVariables($v)) }
            }
        } catch {}
    }
    $libs = New-Object System.Collections.ArrayList
    foreach ($r in $roots) {
        $r = $r.TrimEnd([char[]]@('\', '/'))
        if (-not $r) { continue }
        [void]$libs.Add($r)
        $vdf = Join-Path $r 'steamapps\libraryfolders.vdf'
        if (Test-Path -LiteralPath $vdf) {
            try {
                $txt = Get-Content -LiteralPath $vdf -Raw -Encoding UTF8 -ErrorAction SilentlyContinue
                # vdf 里的路径是 VDF 风格转义（\\ 表示一个反斜杠）
                foreach ($m in [regex]::Matches($txt, '"path"\s*"([^"]+)"')) {
                    [void]$libs.Add(($m.Groups[1].Value -replace '\\\\', '\'))
                }
            } catch {}
        }
    }
    foreach ($lib in ($libs | Select-Object -Unique)) {
        $lib = $lib.TrimEnd([char[]]@('\', '/'))
        if (-not $lib -or -not (Test-Path -LiteralPath $lib)) { continue }
        # 库根目录本身、以及 steamapps\common 下的每个游戏目录
        foreach ($cand in @($lib, (Join-Path $lib 'steamapps\common'))) {
            $g = Get-GameDirFrom $cand
            if ($g) { return $g }
        }
    }
    return $null
}

function Get-CommonPlaceGameDir {
    # 覆盖非 Steam / 学习版 / 手动解压到桌面或下载目录的情况
    $roots = New-Object System.Collections.ArrayList
    foreach ($k in @('Desktop', 'Personal', '{374DE290-123F-4565-9164-39C4925E467B}')) {
        $v = Get-ShellFolder $k
        if ($v) { [void]$roots.Add($v) }
    }
    foreach ($v in @($env:USERPROFILE,
                     (Join-Path $env:USERPROFILE 'Desktop'),
                     (Join-Path $env:USERPROFILE 'Downloads'),
                     (Join-Path $env:USERPROFILE 'Documents'),
                     (Join-Path $env:USERPROFILE 'Saved Games'))) {
        if ($v) { [void]$roots.Add($v) }
    }
    $drives = @()
    try {
        $drives = @([System.IO.DriveInfo]::GetDrives() |
            Where-Object { $_.IsReady -and ($_.DriveType -eq 'Fixed' -or $_.DriveType -eq 'Removable') } |
            ForEach-Object { $_.Name.TrimEnd([char[]]@('\', '/')) })
    } catch {
        $drives = @(Get-PSDrive -PSProvider FileSystem -ErrorAction SilentlyContinue | ForEach-Object { $_.Name + ':' })
    }
    foreach ($d in $drives) {
        if (-not $d) { continue }
        [void]$roots.Add($d)
        foreach ($sub in @('Games', '游戏', '单机游戏', 'PC Games', 'SteamLibrary\steamapps\common',
                           'Program Files', 'Program Files (x86)', 'Programs')) {
            [void]$roots.Add((Join-Path $d $sub))
        }
    }
    foreach ($root in ($roots | Select-Object -Unique)) {
        if (-not $root -or -not (Test-Path -LiteralPath $root)) { continue }
        $g = Get-GameDirFrom $root      # 已覆盖「根目录下」与「根目录的直接子目录下」两层
        if ($g) { return $g }
    }
    return $null
}


# ============ 1. 基础检查 ============
if (-not (Test-Path (Join-Path $modSrc 'mod_patcher.js'))) {
    Write-Err '安装包不完整：缺少 mod_src\mod_patcher.js，请重新解压完整安装包。'
    Pause-End; exit 1
}

# ============ 2. 定位游戏目录 ============
# 多线索自动定位。教训：此前这里写死了作者的机器路径，别人运行必然落空、只能手输。
# 现按可靠性依次尝试：参数/拖放 -> 运行中的进程 -> 上次缓存 -> 安装包附近 -> Steam 库 -> 常见位置 -> 手动指定
$cacheFile = Join-Path $env:LOCALAPPDATA 'RHModLauncher\gamedir.txt'
$GameDir = $null

# (1) 命令行参数；或把游戏文件夹直接拖到「安装MOD.bat」图标上
$GameDir = Get-GameDirFrom $GameDir
if ($GameDir) { Write-Step "按指定路径定位: $GameDir" }

# (2) 游戏正在运行时，直接从进程路径反推（最可靠的线索）
if (-not $GameDir) {
    try {
        $procs = @(Get-Process -Name 'Rebirth Hoarder' -ErrorAction SilentlyContinue)
        if ($procs.Count -gt 0 -and $procs[0].Path) {
            $GameDir = Get-GameDirFrom (Split-Path -Parent $procs[0].Path)
            if ($GameDir) { Write-Step "从运行中的游戏定位: $GameDir" }
        }
    } catch {}
}

# (3) 上次安装记录下来的路径（换机/挪动后自动失效，由 Get-GameDirFrom 校验）
if (-not $GameDir -and (Test-Path -LiteralPath $cacheFile)) {
    try { $GameDir = Get-GameDirFrom (Get-Content -LiteralPath $cacheFile -Raw -ErrorAction SilentlyContinue) } catch {}
    if ($GameDir) { Write-Step "沿用上次的路径: $GameDir" }
}

# (4) 安装包自身所在目录及上两级（把安装包解压到游戏文件夹旁边的情形）
if (-not $GameDir) {
    $d = $scriptDir
    for ($i = 0; $i -lt 3; $i++) {
        if (-not $d) { break }
        $GameDir = Get-GameDirFrom $d
        if ($GameDir) { Write-Step "在安装包附近找到游戏: $GameDir"; break }
        $d = Split-Path -Parent $d
    }
}

# (5) Steam 游戏库（正版玩家；Steam 本身可能装在任意盘）
if (-not $GameDir) {
    Write-Host '[MOD] 正在查找 Steam 游戏库…' -ForegroundColor DarkGray
    $GameDir = Get-SteamGameDir
    if ($GameDir) { Write-Step "在 Steam 库中找到游戏: $GameDir" }
}

# (6) 常见安装位置（非 Steam / 学习版 / 手动解压到桌面或下载目录）
if (-not $GameDir) {
    Write-Host '[MOD] 正在查找常见安装位置…' -ForegroundColor DarkGray
    $GameDir = Get-CommonPlaceGameDir
    if ($GameDir) { Write-Step "在常见位置找到游戏: $GameDir" }
}

# (7) 仍未找到 -> 引导玩家手动指定（支持把文件夹直接拖进本窗口）
if (-not $GameDir) {
    Write-Host ''
    Write-Host '未自动找到游戏，请手动指定游戏安装目录。' -ForegroundColor Yellow
    Write-Host '  · 怎么找：Steam 里右键该游戏 -> 管理 -> 浏览本地文件，' -ForegroundColor Yellow
    Write-Host '    复制打开的那个文件夹的路径（或直接把文件夹拖进本窗口后回车）。' -ForegroundColor Yellow
    Write-Host '  · 正确的文件夹里应当能看到 Rebirth Hoarder.exe 这个文件。' -ForegroundColor Yellow
    Write-Host ''
    for ($attempt = 1; $attempt -le 3; $attempt++) {
        $in = (Read-Host '游戏目录（可直接拖入文件夹）').Trim()
        if ($in) { $GameDir = Get-GameDirFrom $in }
        if ($GameDir) { break }
        Write-Err "这个位置没有找到 Rebirth Hoarder.exe：$in"
        $GameDir = $null
    }
}
if (-not $GameDir) {
    Write-Err '无法确定游戏目录，安装已取消（游戏未做任何改动）。'
    Pause-End; exit 1
}

# 记住本次结果，下次直接复用
try {
    $cacheDir = Split-Path -Parent $cacheFile
    if (-not (Test-Path -LiteralPath $cacheDir)) { New-Item -ItemType Directory -Path $cacheDir -Force | Out-Null }
    Set-Content -LiteralPath $cacheFile -Value $GameDir -Encoding UTF8
} catch {}

if (-not (Test-Path (Join-Path $GameDir 'Rebirth Hoarder.exe'))) {
    Write-Err "未找到 $GameDir\Rebirth Hoarder.exe"
    Pause-End; exit 1
}


$res = Join-Path $GameDir 'resources'
if (-not (Test-Path (Join-Path $res 'app.asar')) -and -not (Test-Path (Join-Path $res 'app.asar.bak'))) {
    Write-Err '未找到 resources\app.asar（或备份 app.asar.bak），游戏可能不完整或已被改动。'
    Pause-End; exit 1
}
Write-Step "游戏目录: $GameDir"

# ============ 3. 游戏进程检查 ============
if (Get-Process 'Rebirth Hoarder' -ErrorAction SilentlyContinue) {
    Write-Err '检测到游戏正在运行！请先完全关闭游戏再安装。'
    Pause-End; exit 1
}

# ============ 4. 运行 mod_patcher.js ============
$patcher = Join-Path $modSrc 'mod_patcher.js'
$outLog = Join-Path $env:TEMP 'rh_mod_install_out.log'
$errLog = Join-Path $env:TEMP 'rh_mod_install_err.log'

# -- 成功判定：mod_patcher.js 完整安装后会写入 rhmod_installed.json 和 app 目录 --
$recJson = Join-Path $res 'rhmod_installed.json'
$appDir = Join-Path $res 'app'
Remove-Item $recJson -ErrorAction SilentlyContinue

function Invoke-Patcher {
    param([string]$NodeExe, [bool]$IsElectron)
    if ($IsElectron) { $env:ELECTRON_RUN_AS_NODE = '1' }
    try {
        $p = Start-Process -FilePath $NodeExe `
            -ArgumentList @('"' + $patcher + '"', '"' + $GameDir + '"') `
            -Wait -PassThru -NoNewWindow `
            -RedirectStandardOutput $outLog -RedirectStandardError $errLog
        return $p.ExitCode
    } finally {
        if ($IsElectron) { Remove-Item Env:\ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue }
    }
}

function Show-Log {
    if (Test-Path $outLog) { Get-Content $outLog -Encoding UTF8 | ForEach-Object { Write-Host $_ } }
    if ((Test-Path $errLog) -and ((Get-Item $errLog).Length -gt 0)) {
        Get-Content $errLog -Encoding UTF8 | ForEach-Object { Write-Host $_ -ForegroundColor Yellow }
    }
}

function Test-Installed {
    return (Test-Path $recJson) -and (Test-Path (Join-Path $appDir 'dist_steam\assets'))
}

Write-Step '正在自动适配并安装 MOD（首次约 1~3 分钟）…'
$code = Invoke-Patcher -NodeExe (Join-Path $GameDir 'Rebirth Hoarder.exe') -IsElectron $true
Show-Log
$ok = (Test-Installed)

# -- 回退：游戏内核启动失败（个别分发版壳程序不支持 RunAsNode）时尝试系统 node --
if (-not $ok) {
    $sysNode = Get-Command 'node' -ErrorAction SilentlyContinue
    if ($sysNode -and $code -ne 2) {
        Write-Step '游戏内核运行失败，改用系统 Node.js 重试…'
        $code = Invoke-Patcher -NodeExe $sysNode.Path -IsElectron $false
        Show-Log
        $ok = (Test-Installed)
    }
}

# ============ 5. 结果展示 ============
if ($ok -and $code -eq 0) {
    Write-Host ''
    Write-Host '============================================================' -ForegroundColor Green
    Write-Host ' MOD 安装成功！（自动适配架构 v3.22）' -ForegroundColor Green
    Write-Host ' 启动游戏，进入废墟探索后按 F8 打开修改面板。' -ForegroundColor Green
    Write-Host ' 如需还原原版，请运行「还原MOD.bat」。' -ForegroundColor Green
    Write-Host '============================================================' -ForegroundColor Green
    Pause-End; exit 0
}

if ($code -eq 2) {
    Write-Err '游戏更新后代码结构变化超出自动适配能力，已安全中止，游戏未受影响。'
    Write-Host ("请把诊断文件发给 MOD 作者：" + (Join-Path $res 'MOD适配诊断.txt')) -ForegroundColor Yellow
} elseif (-not $ok) {
    Write-Err '安装失败（已自动还原原版）。详情见上方日志；若反复失败请把 resources\MOD适配诊断.txt 发给作者。'
}
Pause-End
exit 1
