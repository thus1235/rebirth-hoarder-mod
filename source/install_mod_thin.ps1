# install_mod.ps1 - 末世：我有一辆房车 MOD 安装器（v3.21 自动适配版·薄启动器）
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

# ============ 1. 基础检查 ============
if (-not (Test-Path (Join-Path $modSrc 'mod_patcher.js'))) {
    Write-Err '安装包不完整：缺少 mod_src\mod_patcher.js，请重新解压完整安装包。'
    Pause-End; exit 1
}

# ============ 2. 定位游戏目录 ============
if (-not $GameDir -or -not (Test-Path (Join-Path $GameDir 'Rebirth Hoarder.exe'))) {
    $candidates = @(
        'D:\桌面\末世：我有一辆房车',
        'D:\桌面\末世：我有一辆房车 - 副本'
    )
    $GameDir = $null
    foreach ($c in $candidates) {
        if (Test-Path (Join-Path $c 'Rebirth Hoarder.exe')) { $GameDir = $c; break }
    }
    if (-not $GameDir) {
        Write-Host '未自动找到游戏，请手动输入游戏安装目录：' -ForegroundColor Yellow
        $GameDir = (Read-Host '游戏目录').Trim('"')
    }
}
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
    Write-Host ' MOD 安装成功！（自动适配架构 v3.21）' -ForegroundColor Green
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
