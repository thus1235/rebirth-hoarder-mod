# finalize.ps1 - 更新后自动整理：清理修改器目录 + 重建分享包 + 校验
# 每次 MOD / 存档修改器更新后自动执行；也可随时手动运行。
$ErrorActionPreference = 'Stop'
$root = 'D:\桌面\末世房车MOD工具库'
$dst = "$root\修改器"
$zip = "$root\分享包\末世房车MOD-脚本版.zip"

Write-Host '[整理] 1/4 清理修改器目录中的临时文件...' -ForegroundColor Cyan
if (Test-Path "$dst\rh_backups") {
    Remove-Item "$dst\rh_backups" -Recurse -Force
    Write-Host '  已删除 rh_backups（修改器自动备份，下次写入时会重建）' -ForegroundColor DarkGray
}
Get-ChildItem $dst -Filter '*.zip' -ErrorAction SilentlyContinue | ForEach-Object {
    Remove-Item $_.FullName -Force
    Write-Host "  已删除嵌套压缩包 $($_.Name)" -ForegroundColor DarkGray
}

Write-Host '[整理] 2/4 重建分享包...' -ForegroundColor Cyan
if (Test-Path $zip) { Remove-Item $zip -Force }
tar -a -c -f $zip --exclude="rh_backups" --exclude="*.zip" --exclude="*.log" -C $root '修改器'
if ($LASTEXITCODE -ne 0) { Write-Host '[错误] 打包失败' -ForegroundColor Red; exit 1 }

Write-Host '[整理] 3/4 校验分享包...' -ForegroundColor Cyan
Add-Type -AssemblyName System.IO.Compression.FileSystem
$z = [System.IO.Compression.ZipFile]::OpenRead($zip)
$bad = @($z.Entries | Where-Object { $_.FullName -match 'rh_backups|\.zip$|\.log$' })
$exeEntry = $z.Entries | Where-Object { $_.FullName -eq '修改器/存档修改器.exe' }
$readmeEntry = $z.Entries | Where-Object { $_.FullName -eq '修改器/使用说明.txt' }
$exeLocal = Get-Item "$dst\存档修改器.exe" -ErrorAction SilentlyContinue
$readmeLocal = Get-Item "$dst\使用说明.txt" -ErrorAction SilentlyContinue
$z.Dispose()

if ($bad.Count -gt 0) {
    Write-Host "[错误] 分享包包含不该有的文件: $($bad -join ', ')" -ForegroundColor Red
    exit 1
}
$ok = $true
if (-not ($exeEntry -and $exeLocal -and $exeEntry.Length -eq $exeLocal.Length)) {
    Write-Host '[警告] zip 内 exe 与修改器不一致' -ForegroundColor Yellow
    $ok = $false
} else {
    Write-Host "  zip 内 exe 一致 ($($exeEntry.Length) 字节)" -ForegroundColor DarkGray
}
if (-not ($readmeEntry -and $readmeLocal -and $readmeEntry.Length -eq $readmeLocal.Length)) {
    Write-Host '[警告] zip 内使用说明与修改器不一致' -ForegroundColor Yellow
    $ok = $false
} else {
    Write-Host "  zip 内使用说明一致 ($($readmeEntry.Length) 字节)" -ForegroundColor DarkGray
}

Write-Host '[整理] 4/4 完成' -ForegroundColor Cyan
$f = Get-Item $zip
Write-Host ''
Write-Host '========== 整理完成 ==========' -ForegroundColor Green
Write-Host "修改器目录: $dst" -ForegroundColor Green
Write-Host "分享包    : $zip" -ForegroundColor Green
Write-Host "           $([math]::Round($f.Length/1KB,0)) KB ($($f.Length) 字节)" -ForegroundColor Green
Write-Host '===============================' -ForegroundColor Green
if (-not $ok) { exit 2 }
exit 0
