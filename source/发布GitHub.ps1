# 发布GitHub.ps1 - 把工具库最新内容同步到本地 github_repo 并推送到 GitHub 公开仓库
# 用法: powershell -NoProfile -ExecutionPolicy Bypass -File 发布GitHub.ps1
# 依赖: 已克隆的 github_repo（首次运行前先手工 git clone 一次）
# 凭据: 推送使用 %USERPROFILE%\.git-credentials（store 模式），已彻底禁用 GCM/凭据选择器，全程无弹窗
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
Get-ChildItem "$root\修改器" -File | Where-Object { $_.Extension -notin '.log' -and $_.Name -notmatch 'rh_editor_lang|rh_recent_items|rh_editor.log' } | ForEach-Object { Copy-Item $_.FullName "$gh\mod" -Force }
Get-ChildItem "$root\修改器\patched" -File | ForEach-Object { Copy-Item $_.FullName "$gh\mod\patched" -Force }
# 分享包 zip：优先取 分享包\ 下最新的 末世房车MOD-v*.zip（2026-09-05 起改为版本号命名）
$latestZip = Get-ChildItem "$root\分享包" -Filter '末世房车MOD-v*.zip' -ErrorAction SilentlyContinue |
    Sort-Object LastWriteTime -Descending | Select-Object -First 1
if ($latestZip) {
    Copy-Item $latestZip.FullName "$gh\mod" -Force
    Write-Step ("已纳入分享包: " + $latestZip.Name)
} elseif (Test-Path "$root\分享包\末世房车MOD-脚本版.zip") {
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
        exit 0   # finally 会负责 Pop-Location
    }
    git add --renormalize . 2>$null   # 规范化换行，避免虚假 diff
    git add -A
    # 提交信息带上 MOD 版本号（从 使用说明.txt 首部提取）
    $ver = 'unknown'
    try {
        $firstLine = (Get-Content "$gh\mod\使用说明.txt" -TotalCount 4 -Encoding UTF8 | Where-Object { $_ -match 'MOD v' } | Select-Object -First 1)
        if ($firstLine -match 'MOD\s+(v[0-9.]+)') { $ver = $Matches[1] }
    } catch {}
    $date = Get-Date -Format 'yyyy-MM-dd HH:mm'
    $msg = "$ver 更新 $date：自动同步工具库内容"
    git commit -m $msg
    Write-Step "已提交：$msg"
    # 无弹窗推送：命令行再次清空凭据 helper 链（屏蔽 GCM/选择器），仅用 %USERPROFILE%\.git-credentials
    $env:GIT_TERMINAL_PROMPT = '0'
    $env:GCM_INTERACTIVE = 'never'
    git -c credential.helper= -c credential.helper=store push origin main
    if ($LASTEXITCODE -ne 0) { throw "git push 失败 (exit=$LASTEXITCODE)：请检查网络，或 %USERPROFILE%\.git-credentials 中的 GitHub 凭据是否已失效" }
    Write-Step "已推送到 GitHub：$repo"
    # 推送后校验：远程 main 必须与本地 HEAD 一致
    $head = git rev-parse HEAD
    $remoteLine = (git ls-remote origin refs/heads/main) -join ' '
    $remoteSha = ''
    if ($remoteLine -match '^([0-9a-f]{40})') { $remoteSha = $Matches[1] }
    if ($remoteSha -eq $head) {
        Write-Step ("远程校验通过：origin/main = " + $head.Substring(0, 8))
    } else {
        Write-Err ("远程校验未通过：本地=" + $head.Substring(0, 8) + " 远程=" + $remoteSha)
    }
} finally {
    Pop-Location
}

Write-Host ''
Write-Host '========== 发布完成 ==========' -ForegroundColor Green
Write-Host "GitHub: $repo" -ForegroundColor Green
Write-Host '==============================' -ForegroundColor Green
exit 0
