# install_mod.ps1 - 末世：我有一辆房车 MOD 安装器（脚本版·免环境）
# 仅使用 Windows 10/11 自带的 PowerShell 5.1 + .NET Framework，无需安装任何环境。
# 流程：备份 app.asar -> 纯 PS 解包 -> 补齐原生模块 -> 替换补丁文件；失败自动还原原版。
#
# 【v3.7 / 2026-09-05 更新】
#  · 补丁文件按文件名模式自动匹配（patched\TowerExploration-*.js 等），
#    以后游戏更新只需替换 patched\ 里的文件和本脚本头部的字节数常量。
#  · "游戏更新导致 MOD 失效"（app\ 与 app.asar 同时存在）时，可直接自动重装，
#    不再要求先手动跑还原脚本。
#  · 版本字节数不一致时改为询问是否继续（不再直接中止）。
#  · 安装完成后校验 3 个文件里的 MOD 标记（面板/战斗桥接/生态注入），缺失自动还原。
param([string]$GameDir = "", [switch]$Force)

$ErrorActionPreference = 'Stop'
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path

# 适配版本（2026-09-05 / app.asar = 1461942822；游戏再次更新后改这里 4 个数字即可）
$EXPECTED_ASAR = 1461942822   # 原版 app.asar 字节数
$EXPECTED_TE   = 246347       # TowerExploration-*.js 原版字节数
$EXPECTED_IDX  = 2054469      # index-*.js 原版字节数
$EXPECTED_AC   = 3976935      # AppContent-*.js 原版字节数

function Write-Step($m) { Write-Host "[MOD] $m" -ForegroundColor Cyan }
function Write-Err($m) { Write-Host "[错误] $m" -ForegroundColor Red }

# 按模式在 patched\ 里找补丁文件（哈希名随游戏版本变，模式不变）
function Get-PatchFile {
    param([string]$Pattern)
    $dir = Join-Path $scriptDir 'patched'
    if (-not (Test-Path $dir)) { return $null }
    return Get-ChildItem $dir -Filter $Pattern | Select-Object -First 1
}

# y/n 询问
function Ask-Continue {
    param([string]$Message)
    Write-Host $Message -ForegroundColor Yellow
    $ans = Read-Host '是否继续？(Y=继续 / N=取消)'
    return ($ans -match '^[Yy]')
}

# 安装完成后校验 MOD 标记是否真实存在（防止补丁与游戏版本不匹配仍显示"成功"）
function Test-ModMarkers {
    param([string]$AssetsDir)
    $te  = Get-ChildItem $AssetsDir -Filter 'TowerExploration-*.js' | Select-Object -First 1
    $idx = Get-ChildItem $AssetsDir -Filter 'index-*.js'            | Select-Object -First 1
    $ac  = Get-ChildItem $AssetsDir -Filter 'AppContent-*.js'       | Select-Object -First 1
    if (-not $te -or -not $idx -or -not $ac) { return $false }
    try {
        if (-not (Select-String -Path $idx.FullName -Pattern 'RH_MOD_PANEL' -SimpleMatch -Quiet)) { return $false }
        if (-not (Select-String -Path $te.FullName  -Pattern '__RH_MOD__={' -SimpleMatch -Quiet)) { return $false }
        if (-not (Select-String -Path $ac.FullName  -Pattern 'RH_ECO_INJECT' -SimpleMatch -Quiet)) { return $false }
    } catch { return $false }
    return $true
}

# 还原原版：删除 app 目录，把备份改回 app.asar
function Restore-Original {
    param($res)
    if (Test-Path "$res\app") { Remove-Item "$res\app" -Recurse -Force }
    if ((Test-Path "$res\app.asar.bak") -and -not (Test-Path "$res\app.asar")) {
        Move-Item "$res\app.asar.bak" "$res\app.asar" -Force
    }
}

# 覆盖更新补丁（MOD 已装、解包目录在用时，快速替换 3 个 js 到最新版）
# 返回 $true 表示成功（已提示完成），$false 表示失败（已提示原因）
function Update-Patches {
    param($res)
    $assets = Join-Path $res 'app\dist_steam\assets'
    $te = Get-ChildItem $assets -Filter 'TowerExploration-*.js' | Select-Object -First 1
    $idx = Get-ChildItem $assets -Filter 'index-*.js' | Select-Object -First 1
    $ac = Get-ChildItem $assets -Filter 'AppContent-*.js' | Select-Object -First 1
    if (-not $te -or -not $idx -or -not $ac) {
        Write-Err '未找到补丁目标文件，游戏代码结构可能已变化。建议先运行「还原MOD.bat」再重新安装。'
        return $false
    }
    $patchTe = Get-PatchFile 'TowerExploration-*.js'
    $patchIdx = Get-PatchFile 'index-*.js'
    $patchAc = Get-PatchFile 'AppContent-*.js'
    if (-not $patchTe -or -not $patchIdx -or -not $patchAc) {
        Write-Err '缺少 patched 补丁文件，安装包不完整。'
        return $false
    }
    Copy-Item $patchTe.FullName $te.FullName -Force
    Copy-Item $patchIdx.FullName $idx.FullName -Force
    Copy-Item $patchAc.FullName $ac.FullName -Force
    # 拷贝后校验：确保 3 个补丁文件完整写入
    foreach ($pair in @(@($patchTe.FullName, $te.FullName), @($patchIdx.FullName, $idx.FullName), @($patchAc.FullName, $ac.FullName))) {
        if ((Get-Item $pair[1]).Length -ne (Get-Item $pair[0]).Length) {
            Write-Err "补丁写入校验失败：$($pair[1])（与 patched 源文件大小不一致）。建议先运行「还原MOD.bat」再重新安装。"
            return $false
        }
    }
    if (-not (Test-ModMarkers $assets)) {
        Write-Err '补丁已写入，但未检测到 MOD 标记 —— 补丁可能与当前游戏版本不匹配，功能可能失效。'
        Write-Host '建议反馈作者重新适配；游戏仍可正常运行，也可用「还原MOD.bat」还原。' -ForegroundColor Yellow
    }
    Write-Host ''
    Write-Host '============================================================' -ForegroundColor Green
    Write-Host ' MOD 已更新到最新版！' -ForegroundColor Green
    Write-Host ' 启动游戏，进入废墟探索后按 F8 打开修改面板。' -ForegroundColor Green
    Write-Host '============================================================' -ForegroundColor Green
    return $true
}

# ============ asar 解析（纯 PowerShell + .NET，无需 node） ============
function Get-AsarFiles {
    param($node, $prefix)
    $result = @()
    foreach ($prop in $node.PSObject.Properties) {
        $child = $prop.Value
        $p = if ($prefix) { "$prefix/$($prop.Name)" } else { $prop.Name }
        if ($child.PSObject.Properties['files']) {
            $result += Get-AsarFiles $child.files $p
        } elseif ($child.PSObject.Properties['offset']) {
            $result += [pscustomobject]@{ path = $p; size = [int64]$child.size; offset = [string]$child.offset }
        }
    }
    return $result
}

function Extract-Asar {
    param([string]$Archive, [string]$OutDir)
    $fs = [System.IO.File]::OpenRead($Archive)
    try {
        $br = New-Object System.IO.BinaryReader($fs)
        $null = $br.ReadUInt32()                       # 前 4 字节（固定值 4）
        $headerSize = $br.ReadUInt32()                 # 头部总大小（含 8 字节 pickle 前缀）
        $headerBytes = $br.ReadBytes([int]$headerSize)
        $strLen = [BitConverter]::ToUInt32($headerBytes, 4)
        $json = [System.Text.Encoding]::UTF8.GetString($headerBytes, 8, [int]$strLen)
        $header = $json | ConvertFrom-Json  # PS 5.1 解析无深度限制（-Depth 仅 PS6+ 支持）
        $dataStart = 8L + [int64]$headerSize

        $files = @(Get-AsarFiles $header.files '')
        $count = 0
        foreach ($f in $files) {
            if ($f.offset -eq 'unpacked') { continue }  # 内容在 app.asar.unpacked，稍后整体复制
            $target = Join-Path $OutDir ($f.path -replace '/', '\')
            $dir = [System.IO.Path]::GetDirectoryName($target)
            if ($dir -and -not (Test-Path $dir)) { [System.IO.Directory]::CreateDirectory($dir) | Out-Null }
            $buf = New-Object byte[] ([int]$f.size)
            $fs.Position = $dataStart + [int64]$f.offset
            $read = 0
            while ($read -lt $f.size) {
                $n = $fs.Read($buf, $read, [int]($f.size - $read))
                if ($n -le 0) { throw "读取失败: $($f.path)" }
                $read += $n
            }
            [System.IO.File]::WriteAllBytes($target, $buf)
            $count++
            if ($count % 300 -eq 0) { Write-Host "  已解包 $count 个文件..." }
        }
        Write-Step "解包完成：$count 个文件（跳过 unpacked 原生模块）"
    } finally {
        $fs.Close()
    }
}

# ============ 1. 定位游戏目录 ============
if (-not $GameDir -or -not (Test-Path "$GameDir\Rebirth Hoarder.exe")) {
    # 优先正式版目录，其次副本目录
    $candidates = @(
        'D:\桌面\末世：我有一辆房车',
        'D:\桌面\末世：我有一辆房车 - 副本'
    )
    foreach ($c in $candidates) {
        if (Test-Path "$c\Rebirth Hoarder.exe") { $GameDir = $c; break }
    }
    if (-not $GameDir -or -not (Test-Path "$GameDir\Rebirth Hoarder.exe")) {
        Write-Host '未自动找到游戏，请手动输入游戏安装目录：' -ForegroundColor Yellow
        $GameDir = Read-Host '游戏目录'
    }
}
if (-not (Test-Path "$GameDir\Rebirth Hoarder.exe")) {
    Write-Err "未找到 $GameDir\Rebirth Hoarder.exe"
    Read-Host '按回车退出'
    exit 1
}
$res = Join-Path $GameDir 'resources'
if (-not (Test-Path $res)) { Write-Err '未找到 resources 目录，游戏可能不完整'; Read-Host '按回车退出'; exit 1 }
Write-Step "游戏目录: $GameDir"

# ============ 2. 游戏进程检查 ============
if (Get-Process 'Rebirth Hoarder' -ErrorAction SilentlyContinue) {
    Write-Err '检测到游戏正在运行！请先完全关闭游戏再安装。'
    Read-Host '按回车退出'
    exit 1
}

# ============ 3. 已安装检测 ============
# 本安装器设计为：双击「安装MOD.bat」总是把最新版 MOD 装好——
#  · 首次安装（原版 app.asar 在）：走完整解包流程；
#  · 已装过且游戏没更新（解包目录 app\ 在、app.asar 不在）：直接覆盖更新补丁，几秒完成；
#  · 已装过且游戏更新了（app\ 与 app.asar 同时在）：询问后自动重装（清理旧解包目录重新来）。
$appInPlace = Test-Path "$res\app"
if ($appInPlace -and (Test-Path "$res\app.asar")) {
    Write-Host '检测到游戏已更新（app.asar 重新出现），旧 MOD 已失效。' -ForegroundColor Yellow
    if (-not (Ask-Continue '是否自动清理旧 MOD 并按新版本重新安装？（需重新解包，约 1~3 分钟）')) {
        Write-Host '已取消。如需还原原版请运行「还原MOD.bat」。'
        Read-Host '按回车退出'
        exit 0
    }
    Remove-Item "$res\app" -Recurse -Force
    if (Test-Path "$res\app.asar.bak") { Remove-Item "$res\app.asar.bak" -Force }   # 旧备份让位给新版原版
    Write-Step '已清理旧 MOD 解包目录，开始重新安装...'
    $appInPlace = $false
}
if ($appInPlace) {
    # 解包目录已存在（MOD 已装、游戏未更新）：自动覆盖更新到最新补丁
    Write-Host '检测到已安装过 MOD，正在覆盖更新到最新补丁（无需重新解包）...' -ForegroundColor Cyan
    $ok = Update-Patches $res
    if (-not $ok) { Read-Host '按回车退出' }
    exit 0
}

# ============ 4. 版本提示 ============
$asar = Join-Path $res 'app.asar'
if (-not (Test-Path $asar)) {
    Write-Err '找不到 app.asar（游戏文件可能已被改动）'
    Read-Host '按回车退出'
    exit 1
}
$sz = (Get-Item $asar).Length
if ($sz -ne $EXPECTED_ASAR) {
    Write-Host "[提示] 当前 app.asar 大小($sz) 与本 MOD 适配版本($EXPECTED_ASAR)不一致，游戏可能已更新。" -ForegroundColor Yellow
    if (-not $Force -and -not (Ask-Continue '继续安装可能失败（失败会自动还原原版，不影响游戏）。是否继续？')) {
        Read-Host '已取消，按回车退出'
        exit 0
    }
}

# ============ 5. 备份原版 ============
if (Test-Path "$res\app.asar.bak") { Remove-Item "$res\app.asar.bak" -Force }
Move-Item $asar "$res\app.asar.bak" -Force
Write-Step '已备份原版 app.asar -> app.asar.bak'

# ============ 6. 解包 ============
Write-Step '正在解包游戏资源（约 1.4GB，需 1~3 分钟，请勿关闭窗口）...'
try {
    Extract-Asar -Archive "$res\app.asar.bak" -OutDir "$res\app"
} catch {
    Write-Err "解包失败：$_"
    Restore-Original $res
    Write-Host '已自动还原原版，游戏不受影响。' -ForegroundColor Yellow
    Read-Host '按回车退出'
    exit 1
}

# ============ 7. 补齐 unpacked 原生模块（steamworks 等） ============
if (Test-Path "$res\app.asar.unpacked") {
    Copy-Item "$res\app.asar.unpacked\*" "$res\app\" -Recurse -Force
    Write-Step '已补齐原生模块（steamworks.js 等）'
}

# ============ 8. 替换补丁文件（带版本校验与标记校验） ============
$assets = Join-Path $res 'app\dist_steam\assets'
$te = Get-ChildItem $assets -Filter 'TowerExploration-*.js' | Select-Object -First 1
$idx = Get-ChildItem $assets -Filter 'index-*.js' | Select-Object -First 1
$ac = Get-ChildItem $assets -Filter 'AppContent-*.js' | Select-Object -First 1
if (-not $te -or -not $idx -or -not $ac) {
    Write-Err '未找到补丁目标文件，游戏代码结构可能已变化。正在还原原版...'
    Restore-Original $res
    Read-Host '按回车退出'
    exit 1
}
if ($te.Length -ne $EXPECTED_TE -or $idx.Length -ne $EXPECTED_IDX -or $ac.Length -ne $EXPECTED_AC) {
    Write-Err "游戏文件版本不匹配（TowerExploration=$($te.Length) index=$($idx.Length) AppContent=$($ac.Length)），本 MOD 适配的是 TowerExploration=$EXPECTED_TE index=$EXPECTED_IDX AppContent=$EXPECTED_AC 的版本。"
    if (-not (Ask-Continue '强装可能导致 MOD 功能失效（游戏本体不受影响，可随时还原）。是否仍要继续？')) {
        Restore-Original $res
        Write-Host '已取消并还原原版，游戏不受影响。'
        Read-Host '按回车退出'
        exit 0
    }
}
$patchTe = Get-PatchFile 'TowerExploration-*.js'
$patchIdx = Get-PatchFile 'index-*.js'
$patchAc = Get-PatchFile 'AppContent-*.js'
if (-not $patchTe -or -not $patchIdx -or -not $patchAc) {
    Write-Err '缺少 patched 补丁文件，安装包不完整。正在还原原版...'
    Restore-Original $res
    Read-Host '按回车退出'
    exit 1
}
foreach ($pair in @(@($patchTe.FullName, $te.FullName), @($patchIdx.FullName, $idx.FullName), @($patchAc.FullName, $ac.FullName))) {
    Copy-Item $pair[0] $pair[1] -Force
    if ((Get-Item $pair[1]).Length -ne (Get-Item $pair[0]).Length) {
        Write-Err "补丁写入校验失败：$($pair[1])。正在还原原版..."
        Restore-Original $res
        Read-Host '按回车退出'
        exit 1
    }
}
Write-Step '补丁文件已写入并通过大小校验'

# ============ 9. MOD 标记校验（防"装了但没生效"） ============
if (-not (Test-ModMarkers $assets)) {
    Write-Err '未检测到 MOD 标记 —— 补丁与当前游戏版本不匹配。正在还原原版...'
    Restore-Original $res
    Write-Host '已还原原版，游戏不受影响。请把本提示反馈给作者重新适配。' -ForegroundColor Yellow
    Read-Host '按回车退出'
    exit 1
}
Write-Step 'MOD 标记校验通过（面板 / 战斗桥接 / 生态注入 均已就位）'

Write-Host ''
Write-Host '============================================================' -ForegroundColor Green
Write-Host ' 安装成功！' -ForegroundColor Green
Write-Host ' 启动游戏，进入废墟探索后按 F8 打开修改面板。' -ForegroundColor Green
Write-Host ' 还原原版请运行「还原MOD.bat」。' -ForegroundColor Green
Write-Host '============================================================' -ForegroundColor Green
Read-Host '按回车退出'
exit 0
