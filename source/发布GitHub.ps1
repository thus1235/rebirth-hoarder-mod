# 发布GitHub.ps1 - 把工具库最新内容同步到本地 github_repo 并推送到 GitHub 公开仓库
# 用法: powershell -NoProfile -ExecutionPolicy Bypass -File 发布GitHub.ps1
# 依赖: 已克隆的 github_repo（首次运行前先手工 git clone 一次），credential.helper=manager 已配置
$ErrorActionPreference = 'Stop'
$root = 'D:\桌面\末世房车MOD工具库'
$gh = "$root\github_repo"
$repo = 'https://github.com/thus1235/rebirth-hoarder-mod.git'

function Write-Step($m) { Write-Host "[发布] $m" -ForegroundColor Cyan }
function Write-Err($m) { Write-Host "[错误] $m" -ForegroundColor Red }

# ---------- 1. 检查 github_repo 是否存在 ----------
if (-not (Test-Path "$gh\.git")) {
    Write-Err "未找到本地仓库 $gh。请先执行一次克隆："
    Write-Host "  git clone $repo $gh"
    exit 1
}
if (-not (Test-Path "D:\桌面\末世：我有一辆房车\Rebirth Hoarder.exe")) {
    Write-Err "未找到游戏目录（用于校验工具版本）。请确认游戏仍在 D:\桌面\末世：我有一辆房车。"
    exit 1
}

# ---------- 2. 组装内容（保留 patched/ 子目录结构） ----------
Write-Step '组装最新内容到 github_repo/mod ...'
if (Test-Path "$gh\mod") { Remove-Item "$gh\mod" -Recurse -Force }
New-Item -ItemType Directory -Force -Path "$gh\mod\patched" | Out-Null
Get-ChildItem "$root\修改器" -File | Where-Object { $_.Extension -notin '.log' } | ForEach-Object { Copy-Item $_.FullName "$gh\mod" -Force }
Get-ChildItem "$root\修改器\patched" -File | ForEach-Object { Copy-Item $_.FullName "$gh\mod\patched" -Force }
if (Test-Path "$root\分享包\末世房车MOD-脚本版.zip") {
    Copy-Item "$root\分享包\末世房车MOD-脚本版.zip" "$gh\mod" -Force
} else {
    Write-Host '  (提示) 未找到分享包 zip，跳过' -ForegroundColor DarkGray
}

Write-Step '组装最新内容到 github_repo/source ...'
if (Test-Path "$gh\source") { Remove-Item "$gh\source" -Recurse -Force }
New-Item -ItemType Directory -Force -Path "$gh\source\csharp-src","$gh\source\rh_src" | Out-Null
Get-ChildItem "$root\开发源码" -File | ForEach-Object { Copy-Item $_.FullName "$gh\source" -Force }
Get-ChildItem "$root\开发源码\rh_src" -File | ForEach-Object { Copy-Item $_.FullName "$gh\source\rh_src" -Force }
Get-ChildItem "$root\源代码\存档修改器-源代码" -File | ForEach-Object { Copy-Item $_.FullName "$gh\source\csharp-src" -Force }

# source 里保留已用的 README（不覆盖 GitHub 上的 README）
Write-Step '内容组装完成。'

# ---------- 3. git add / commit / push ----------
Push-Location $gh
try {
    git add -A
    $stat = git status --short
    if (-not $stat) {
        Write-Step '没有内容变化，无需提交。'
        Pop-Location
        exit 0
    }
    git add --renormalize . 2>$null   # 规范化换行，避免虚假 diff
    git add -A
    $date = Get-Date -Format 'yyyy-MM-dd HH:mm'
    $msg = "更新 $date：自动同步工具库内容"
    git commit -m $msg
    Write-Step "已提交：$msg"
    git push origin main
    Write-Step "已推送到 GitHub：$repo"
} finally {
    Pop-Location
}

Write-Host ''
Write-Host '========== 发布完成 ==========' -ForegroundColor Green
Write-Host "GitHub: $repo" -ForegroundColor Green
Write-Host '==============================' -ForegroundColor Green
exit 0
