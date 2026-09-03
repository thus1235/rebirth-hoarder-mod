# install_mod.ps1 - 末世：我有一辆房车 MOD 安装器（脚本版·免环境）
# 仅使用 Windows 10/11 自带的 PowerShell 5.1 + .NET Framework，无需安装任何环境。
# 流程：备份 app.asar -> 纯 PS 解包 -> 补齐原生模块 -> 替换补丁文件；失败自动还原原版。
param([string]$GameDir = "", [switch]$Force)

$ErrorActionPreference = 'Stop'
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path

# 适配版本（2026-09 / 3.5.0）
$EXPECTED_ASAR = 1461937281   # 原版 app.asar 字节数
$EXPECTED_TE   = 246347       # TowerExploration-*.js 原版字节数
$EXPECTED_IDX  = 2053319      # index-*.js 原版字节数
$EXPECTED_AC   = 3972544      # AppContent-*.js 原版字节数

function Write-Step($m) { Write-Host "[MOD] $m" -ForegroundColor Cyan }
function Write-Err($m) { Write-Host "[错误] $m" -ForegroundColor Red }

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
    $patchTe = Join-Path $scriptDir 'patched\TowerExploration-b523983e.js'
    $patchIdx = Join-Path $scriptDir 'patched\index-5398c699.js'
    $patchAc = Join-Path $scriptDir 'patched\AppContent-478ba388.js'
    if (-not (Test-Path $patchTe) -or -not (Test-Path $patchIdx) -or -not (Test-Path $patchAc)) {
        Write-Err '缺少 patched 补丁文件，安装包不完整。'
        return $false
    }
    Copy-Item $patchTe $te.FullName -Force
    Copy-Item $patchIdx $idx.FullName -Force
    Copy-Item $patchAc $ac.FullName -Force
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
    if (Test-Path 'D:\桌面\末世：我有一辆房车\Rebirth Hoarder.exe') {
        $GameDir = 'D:\桌面\末世：我有一辆房车'
    } else {
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
#  · 已装过（解包目录 app\ 在）：直接覆盖更新补丁到最新版，无需解包、无需输入。
$appInPlace = Test-Path "$res\app"
if ($appInPlace) {
    if (Test-Path "$res\app.asar") {
        Write-Host '检测到游戏已更新（app.asar 重新出现），当前 MOD 已失效。' -ForegroundColor Yellow
        Write-Host '请先运行「还原MOD.bat」清理，再重新安装。' -ForegroundColor Yellow
        Read-Host '按回车退出'
        exit 0
    }
    # 解包目录已存在（MOD 已装）：自动覆盖更新到最新补丁
    Write-Host '检测到已安装过 MOD，正在覆盖更新到最新补丁（无需重新解包）...' -ForegroundColor Cyan
    $ok = Update-Patches $res
    if (-not $ok) { Read-Host '按回车退出' }
    exit 0
}

# ============ 4. 版本提示（非阻断） ============
$asar = Join-Path $res 'app.asar'
if (-not (Test-Path $asar)) {
    Write-Err '找不到 app.asar（游戏文件可能已被改动）'
    Read-Host '按回车退出'
    exit 1
}
$sz = (Get-Item $asar).Length
if ($sz -ne $EXPECTED_ASAR) {
    Write-Host "[警告] 当前 app.asar 大小($sz) 与制作本 MOD 的版本($EXPECTED_ASAR)不一致，游戏可能已更新。" -ForegroundColor Yellow
    Write-Host '继续安装可能失败；若失败会自动还原原版，不影响游戏。按回车继续，或关闭窗口取消。' -ForegroundColor Yellow
    Read-Host '继续'
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

# ============ 8. 替换补丁文件（带版本校验） ============
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
    Write-Err "游戏文件版本不匹配（TowerExploration=$($te.Length) index=$($idx.Length) AppContent=$($ac.Length)），本 MOD 需适配对应版本。正在还原原版..."
    Restore-Original $res
    Read-Host '按回车退出'
    exit 1
}
$patchTe = Join-Path $scriptDir 'patched\TowerExploration-b523983e.js'
$patchIdx = Join-Path $scriptDir 'patched\index-5398c699.js'
$patchAc = Join-Path $scriptDir 'patched\AppContent-478ba388.js'
if (-not (Test-Path $patchTe) -or -not (Test-Path $patchIdx) -or -not (Test-Path $patchAc)) {
    Write-Err '缺少 patched 补丁文件，安装包不完整。正在还原原版...'
    Restore-Original $res
    Read-Host '按回车退出'
    exit 1
}
Copy-Item $patchTe $te.FullName -Force
Copy-Item $patchIdx $idx.FullName -Force
Copy-Item $patchAc $ac.FullName -Force
Write-Step '补丁文件已写入'

Write-Host ''
Write-Host '============================================================' -ForegroundColor Green
Write-Host ' 安装成功！' -ForegroundColor Green
Write-Host ' 启动游戏，进入废墟探索后按 F8 打开修改面板。' -ForegroundColor Green
Write-Host ' 还原原版请运行「还原MOD.bat」。' -ForegroundColor Green
Write-Host '============================================================' -ForegroundColor Green
Read-Host '按回车退出'
exit 0
