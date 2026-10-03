# diagnose_save.ps1 - 末世：我有一辆房车 存档修改器 一键诊断（v1.0）
# 用法：双击同目录的「诊断存档问题.bat」
# 作用：只读体检，不改动任何游戏文件；生成「诊断报告.txt」并自动打开，便于发给作者排查。
param([switch]$NoPause)

$ErrorActionPreference = 'Continue'
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$report = Join-Path $scriptDir '诊断报告.txt'
$GAME = 'Rebirth Hoarder'
# 极少数环境 APPDATA 为空（精简系统 / 特殊启动方式），这里兜底
if (-not $env:APPDATA) { $env:APPDATA = [Environment]::GetFolderPath('ApplicationData') }
$lines = New-Object System.Collections.ArrayList

function Say($m, $c) {
    if ($c) { Write-Host $m -ForegroundColor $c } else { Write-Host $m }
    [void]$lines.Add($m)
}
function Head($m) { Say ''; Say ('=' * 62); Say "  $m"; Say ('=' * 62) }

# 调用「存档修改器.exe」自身的 C# 算法校验一个存档文件。
# 复制到临时目录再校验，绝不污染存档目录；返回 @{Result;Computed;Stored;Revision;Slot;Dropped} 或 $null
function Check-Save([string]$path) {
    $exe = Join-Path $scriptDir '存档修改器.exe'
    if (-not (Test-Path -LiteralPath $exe)) { return $null }
    $tmpDir = Join-Path $env:TEMP ('rh_diag_' + [Guid]::NewGuid().ToString('N').Substring(0, 8))
    try {
        New-Item -ItemType Directory -Path $tmpDir -Force | Out-Null
        $copy = Join-Path $tmpDir 'save.json'
        Copy-Item -LiteralPath $path -Destination $copy -Force
        try { Start-Process -FilePath $exe -ArgumentList @('--check', ('"' + $copy + '"')) -Wait -NoNewWindow -ErrorAction Stop } catch {}
        $rep = $copy + '.rhcheck.txt'
        if (-not (Test-Path -LiteralPath $rep)) { return $null }
        $r = @{ Dropped = @() }
        foreach ($ln in ((Get-Content -LiteralPath $rep -Raw -Encoding UTF8) -split "`r?`n")) {
            $t = $ln.Trim()
            if     ($t -match '^result\s*:\s*(.+)$')            { $r.Result   = $Matches[1].Trim() }
            elseif ($t -match '^!\s*会丢弃\s*:\s*(.+)$')         { $r.Dropped += $Matches[1].Trim() }
            elseif ($t -match '^computed\s*:\s*(\S+)')          { $r.Computed = $Matches[1] }
            elseif ($t -match '^stored\s*:\s*(\S+)')            { $r.Stored   = $Matches[1] }
            elseif ($t -match '^revision\s*:\s*(\S+)')          { $r.Revision = $Matches[1] }
            elseif ($t -match '^slot\s*:\s*(\S+)')              { $r.Slot     = $Matches[1] }
        }
        return $r
    } catch { return $null }
    finally { Remove-Item -LiteralPath $tmpDir -Recurse -Force -ErrorAction SilentlyContinue }
}

# ---------- 0. 基本信息 ----------
Head '0. 基本信息'
$os = Get-CimInstance Win32_OperatingSystem -ErrorAction SilentlyContinue
Say ("系统      : " + $(if ($os) { $os.Caption + '  ' + $os.Version } else { '未知' }))
Say ("用户名    : $env:USERNAME")
Say ("APPDATA   : $env:APPDATA")
Say ("当前时间  : " + (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'))

$netRel = 0
try { $netRel = (Get-ItemProperty 'HKLM:\SOFTWARE\Microsoft\NET Framework Setup\NDP\v4\Full' -Name Release -ErrorAction SilentlyContinue).Release } catch {}
$netName = switch ($netRel) {
    { $_ -ge 533320 } { '4.8.1+'; break }
    { $_ -ge 528040 } { '4.8'; break }
    { $_ -ge 461808 } { '4.7.2'; break }
    { $_ -ge 394802 } { '4.6.2'; break }
    { $_ -ge 378389 } { '4.5'; break }
    default { '未检测到 .NET Framework 4.5 以上' }
}
Say (".NET      : $netName (Release=$netRel)")
if ($netRel -lt 378389) { Say '  !!! 系统缺 .NET Framework，修改器会闪退/打不开，需装 4.8 运行库' 'Red' }

# ---------- 1. 游戏进程 ----------
Head '1. 游戏是否正在运行'
$procs = @()
try { $procs = @(Get-Process -Name $GAME -ErrorAction SilentlyContinue) } catch {}
if ($procs.Count -gt 0) {
    Say ("发现游戏进程 " + $procs.Count + " 个（PID: " + (($procs | ForEach-Object { $_.Id }) -join ', ') + '）') 'Red'
    Say '  !!! 游戏开着时改「红色标签」页（当前局/P2/物品/角色属性/装备/命途/医疗舱）会被游戏自动保存覆盖' 'Red'
    Say '      → 这些项必须：完全退出游戏 → 改 → 写 → 再启动游戏' 'Yellow'
} else { Say '未发现游戏进程（已完全关闭）' 'Green' }

# ---------- 2. 定位游戏目录 ----------
Head '2. 游戏目录 / 版本'
$gameDir = $null
$steamPath = $null
try { $steamPath = (Get-ItemProperty 'HKCU:\Software\Valve\Steam' -Name SteamPath -ErrorAction SilentlyContinue).SteamPath } catch {}
if (-not $steamPath) {
    foreach ($p in @('C:\Program Files (x86)\Steam', 'C:\Program Files\Steam', 'D:\Steam', 'D:\Program Files (x86)\Steam', 'E:\Steam', 'D:\SteamLibrary')) {
        if (Test-Path $p) { $steamPath = $p; break }
    }
}
$appId = $null
if ($steamPath) {
    Say ("Steam 目录: $steamPath")
    $libs = @($steamPath)
    $vdf = Join-Path $steamPath 'steamapps\libraryfolders.vdf'
    if (Test-Path $vdf) {
        Select-String -Path $vdf -Pattern '"path"\s+"(.+)"' -AllMatches -ErrorAction SilentlyContinue | ForEach-Object {
            foreach ($m in $_.Matches) { $libs += ($m.Groups[1].Value -replace '\\\\', '\') }
        }
    }
    foreach ($lib in ($libs | Select-Object -Unique)) {
        $cand = Join-Path $lib "steamapps\common\$GAME"
        if (Test-Path (Join-Path $cand "$GAME.exe")) { $gameDir = $cand; break }
        # 注意：Steam 里的目录名可能是中文（实测「末世：我有一辆房车」），
        # 所以不能只按英文名找，要遍历 common 下所有子目录、以「含 exe」为唯一判据。
        $common = Join-Path $lib 'steamapps\common'
        if (Test-Path -LiteralPath $common) {
            foreach ($sub in (Get-ChildItem -LiteralPath $common -Directory -ErrorAction SilentlyContinue | Sort-Object Name)) {
                if (Test-Path (Join-Path $sub.FullName "$GAME.exe")) { $gameDir = $sub.FullName; break }
            }
        }
        if ($gameDir) { break }
    }
    if ($gameDir) {
        $manDir = Split-Path (Split-Path $gameDir -Parent) -Parent
        foreach ($f in @(Get-ChildItem -Path $manDir -Filter 'appmanifest_*.acf' -ErrorAction SilentlyContinue)) {
            $t = ''
            try { $t = Get-Content $f.FullName -Raw -ErrorAction SilentlyContinue } catch {}
            if ($t -and $t -match '"name"\s+"([^"]+)"' -and $Matches[1] -eq $GAME) {
                if ($t -match '"appid"\s+"(\d+)"') { $appId = $Matches[1] }
            }
        }
    }
}
if (-not $gameDir) {
    $keys = @('HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*',
              'HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*',
              'HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*')
    foreach ($k in $keys) {
        $it = Get-ItemProperty $k -ErrorAction SilentlyContinue | Where-Object { $_.DisplayName -like "*$GAME*" -or $_.DisplayName -like '*房车*' }
        if ($it -and $it.InstallLocation -and (Test-Path (Join-Path $it.InstallLocation "$GAME.exe"))) { $gameDir = $it.InstallLocation; break }
    }
}
if (-not $gameDir) {
    # 盘根 + 常见子目录 + 用户外壳目录（桌面/下载/文档）。
    # 同样不按目录名匹配：只认「目录下存在 <游戏>.exe」这个硬事实。
    $roots = New-Object System.Collections.ArrayList
    foreach ($k in @('Desktop', 'Personal', '{374DE290-123F-4565-9164-39C4925E467B}')) {
        try {
            $v = (Get-ItemProperty 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\User Shell Folders' -ErrorAction SilentlyContinue).$k
            if ($v) { [void]$roots.Add([Environment]::ExpandEnvironmentVariables($v)) }
        } catch {}
    }
    foreach ($v in @($env:USERPROFILE,
                     (Join-Path $env:USERPROFILE 'Desktop'),
                     (Join-Path $env:USERPROFILE 'Downloads'),
                     (Join-Path $env:USERPROFILE 'Documents'))) {
        if ($v) { [void]$roots.Add($v) }
    }
    foreach ($d in (Get-PSDrive -PSProvider FileSystem -ErrorAction SilentlyContinue | ForEach-Object { $_.Root })) {
        [void]$roots.Add($d)
        foreach ($sub in @('Games', '游戏', '单机游戏', 'PC Games', 'SteamLibrary\steamapps\common', 'Steam\steamapps\common', 'Program Files', 'Program Files (x86)')) {
            [void]$roots.Add((Join-Path $d $sub))
        }
    }
    foreach ($r in ($roots | Select-Object -Unique)) {
        if (-not $r -or -not (Test-Path -LiteralPath $r)) { continue }
        if (Test-Path (Join-Path $r "$GAME.exe")) { $gameDir = $r; break }
        foreach ($sub in (Get-ChildItem -LiteralPath $r -Directory -ErrorAction SilentlyContinue | Sort-Object Name)) {
            if (Test-Path (Join-Path $sub.FullName "$GAME.exe")) { $gameDir = $sub.FullName; break }
            if ($sub.Name -match '(?i)房车|rebirth|hoarder') {
                foreach ($s2 in (Get-ChildItem -LiteralPath $sub.FullName -Directory -ErrorAction SilentlyContinue)) {
                    if (Test-Path (Join-Path $s2.FullName "$GAME.exe")) { $gameDir = $s2.FullName; break }
                }
            }
            if ($gameDir) { break }
        }
        if ($gameDir) { break }
    }
}
if (-not $gameDir) {
    Say '未自动找到游戏目录（版本/云同步检查跳过，不影响存档检查）' 'Yellow'
} else {
    Say "游戏目录  : $gameDir" 'Green'
    $asar = Join-Path $gameDir 'resources\app.asar'
    if (Test-Path $asar) {
        $f = Get-Item $asar
        Say ("app.asar  : " + $f.Length + ' 字节，修改时间 ' + $f.LastWriteTime.ToString('yyyy-MM-dd HH:mm'))
        Say '             （此数字仅供参考。是否适配以下面第 6 项的「实测校验」为准，不再用字节数判断）'
    } elseif (Test-Path (Join-Path $gameDir 'resources\app.asar.bak')) {
        $bak = Get-Item (Join-Path $gameDir 'resources\app.asar.bak')
        Say ('app.asar  : 不存在（原版已备份为 app.asar.bak，' + $bak.Length + ' 字节 —— 说明 MOD 曾安装，属正常）') 'Green'
    } else {
        Say 'app.asar  : 未找到（游戏可能不完整，或用了别的分发形式）' 'Yellow'
    }
    if (Test-Path (Join-Path $gameDir 'resources\rhmod_installed.json')) {
        Say 'MOD 状态  : 已安装' 'Green'
    } else {
        Say 'MOD 状态  : 未安装 → 修改器「绿色标签」的局内自动重载不生效，需关游戏改' 'Yellow'
    }
}

# ---------- 3. 存档体检（核心） ----------
Head '3. 存档体检（最关键）'
$root = Join-Path $env:APPDATA $GAME
$defaultDir = Join-Path $root 'steam-cloud\saves'
Say ("修改器默认目录 : $defaultDir")
Say ("游戏数据根目录 : $root")
if (-not (Test-Path $root)) {
    Say '  !!! 该目录不存在：此电脑从未产生过存档，或游戏用了别的用户账户/便携模式' 'Red'
}
$saves = @()
if (Test-Path $root) {
    $saves = @(Get-ChildItem -Path $root -Recurse -Filter 'progress-*.json' -File -ErrorAction SilentlyContinue |
               Where-Object { $_.Name -notlike '*.tmp*' -and $_.Name -notlike '*tmp-*' })
}
if ($saves.Count -eq 0) {
    Say '  !!! 一个 progress-*.json 都没找到：先进游戏玩到第一次自动存档，再来改' 'Red'
} else {
    Say ("共找到 $($saves.Count) 个进度档，按修改时间倒序：")
    Say ('-' * 62)
    foreach ($f in ($saves | Sort-Object LastWriteTime -Descending)) {
        $rev = '?'; $sum = ''
        try {
            $sr = New-Object System.IO.StreamReader($f.FullName)
            $buf = New-Object char[] 4000
            $n = $sr.Read($buf, 0, 4000)
            $head = New-Object string ($buf, 0, $n)
            $sr.Close()
            if ($head -match '"revision"\s*:\s*([0-9]+)') { $rev = $Matches[1] }
            if ($head -match '"checksum"\s*:\s*"([0-9a-f]{8})') { $sum = $Matches[1] }
        } catch {}
        $mark = '[其它]'
        if ($f.DirectoryName -eq $defaultDir) { $mark = '[默认]' }
        Say ("  $mark " + $f.Name.PadRight(22) + ' 版本=' + $rev.PadLeft(6) + ' 校验=' + $sum.PadRight(8) + ' ' + $f.Length.ToString().PadLeft(8) + 'B  ' + $f.LastWriteTime.ToString('MM-dd HH:mm:ss'))
        Say ('         路径: ' + $f.FullName)
    }
    Say ('-' * 62)
    $newest = $saves | Sort-Object LastWriteTime -Descending | Select-Object -First 1
    if ($newest.DirectoryName -ne $defaultDir) {
        Say '  !!! 关键：游戏最近在用的档 不在 修改器默认目录 → 改错地方了' 'Red'
        Say ('     游戏实际在用  : ' + $newest.FullName) 'Red'
        Say ('     修改器改的是  : ' + (Join-Path $defaultDir 'progress-current.json')) 'Red'
        Say '     这就是「写入成功但游戏里没变」的常见原因。' 'Red'
        Say '     解决：修改器顶部「浏览…」指向上面「游戏实际在用」的那个文件夹，再读取/修改。' 'Yellow'
    } else {
        Say '  游戏最近在用的档在修改器默认目录下（目录没选错）' 'Green'
        $manuals = @($saves | Where-Object { $_.Name -notlike '*current*' })
        if ($manuals.Count -gt 0) {
            Say '  · 但仍需核对槽位：如果你在游戏里读的是「手动存档1/2/3」，' 'Yellow'
            Say '    修改器顶部「槽位」也要切到对应档；默认停在 current，改它对手存档无效。' 'Yellow'
        }
    }
}

# ---------- 4. Steam 云同步 ----------
Head '4. Steam 云同步（Steam 正版必看）'
if (-not $steamPath) {
    Say '未检测到 Steam（非 Steam 版忽略此项）'
} else {
    $cloud = $null
    $ud = Join-Path $steamPath 'userdata'
    if ($appId -and (Test-Path $ud)) {
        foreach ($cfg in @(Get-ChildItem -Path $ud -Filter 'localconfig.vdf' -Recurse -ErrorAction SilentlyContinue)) {
            $t = ''
            try { $t = Get-Content $cfg.FullName -Raw -ErrorAction SilentlyContinue } catch {}
            if ($t -and $t -match ('"' + $appId + '"\s*\{[^}]*?"cloudenabled"\s*"(\d)"')) { $cloud = $Matches[1]; break }
        }
    }
    if ($appId) { Say ("游戏 AppID: $appId") } else { Say '游戏 AppID: 未识别到（无法自动判断云同步，请手动确认）' 'Yellow' }
    if ($cloud -eq '1') {
        Say '  !!! Steam 云同步：已开启 → 改完一开游戏，云端旧档会被拉回来覆盖本地修改' 'Red'
        Say '     解决①：Steam → 库 → 右键游戏 → 属性 → 通用 → 取消「保持此游戏的跨设备同步」' 'Yellow'
        Say '     解决②：Steam 弹出「存档冲突」时选「使用本地并上传」' 'Yellow'
    } elseif ($cloud -eq '0') {
        Say 'Steam 云同步：已关闭（不会覆盖本地修改）' 'Green'
    } else {
        Say '云同步状态：未能自动识别，请手动确认（游戏属性 → 通用 → 跨设备同步）' 'Yellow'
    }
}

# ---------- 5. 修改器自身 ----------
Head '5. 修改器文件检查'
$exe = Join-Path $scriptDir '存档修改器.exe'
if (Test-Path $exe) {
    Say ("修改器    : $exe")
    try {
        $ads = Get-Content -Path $exe -Stream Zone.Identifier -ErrorAction SilentlyContinue
        if ($ads) { Say '  !!! 文件带「来自互联网」标记，可能被 SmartScreen / 杀软拦截：右键 exe → 属性 → 解除锁定' 'Yellow' }
        else { Say '  无网络下载标记（正常）' }
    } catch { Say '  （无法读取区域标记，忽略）' }
    $log = Join-Path $scriptDir 'rh_editor.log'
    if (Test-Path $log) {
        Say '  !!! 发现 rh_editor.log（上次运行出过异常），末尾 20 行：' 'Yellow'
        Get-Content $log -Tail 20 -ErrorAction SilentlyContinue | ForEach-Object { Say ('     ' + $_) }
    }
    $wt = Join-Path $scriptDir '.__wtest'
    try {
        try { [IO.File]::WriteAllText($wt, 'x'); Say '  程序所在目录可写：是' }
        catch { Say '  · 目录写入测试未通过（权限或安全软件限制）；若修改器本身能正常写入可忽略' 'Yellow' }
    } finally { try { [IO.File]::Delete($wt) } catch {} }
} else {
    Say '未在同目录找到 存档修改器.exe（本脚本应与修改器放同一文件夹）' 'Yellow'
}
if (Test-Path $defaultDir) {
    $wt2 = Join-Path $defaultDir '.__wtest'
    try {
        try { [IO.File]::WriteAllText($wt2, 'x'); Say '  默认存档目录可写：是' }
        catch { Say '  · 存档目录写入测试未通过（权限或安全软件限制）；若修改器能正常写入可忽略' 'Yellow' }
    } finally { try { [IO.File]::Delete($wt2) } catch {} }
}

# ---------- 6. 存档被游戏判定损坏（关键证据） ----------
Head '6. 游戏是否把存档判为损坏'
$corruptDirs = @()
if (Test-Path $root) {
    $corruptDirs = @(Get-ChildItem -Path $root -Recurse -Directory -ErrorAction SilentlyContinue | Where-Object { $_.Name -eq 'corrupt' })
}
if ($corruptDirs.Count -eq 0) {
    Say '未发现 corrupt 隔离目录（没有存档被游戏判为损坏）' 'Green'
} else {
    foreach ($cd in $corruptDirs) {
        Say ("隔离目录: " + $cd.FullName)
        $recent = @(Get-ChildItem -Path $cd.FullName -File -ErrorAction SilentlyContinue | Where-Object { $_.LastWriteTime -gt (Get-Date).AddDays(-7) })
        $all = @(Get-ChildItem -Path $cd.FullName -File -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending)
        Say ("  共 $($all.Count) 个被隔离文件，其中最近 7 天内 $($recent.Count) 个")
        foreach ($f in ($all | Select-Object -First 5)) {
            Say ('   · ' + $f.Name + '  ' + $f.Length + 'B  ' + $f.LastWriteTime.ToString('MM-dd HH:mm:ss'))
        }
        if ($recent.Count -gt 0) {
            Say '  !!! 最近有存档被游戏判为损坏并隔离 —— 这就是「提示写入成功、进游戏数值没变」的直接原因' 'Red'
            Say '     （游戏校验不通过时会丢弃该档并回退旧档，所以看起来像没生效）' 'Red'
        } else {
            Say '  · 被隔离的都是 7 天前的旧文件（历史遗留，与本次问题无关）' 'Green'
        }

        # ---- 实测：用修改器自身的算法复算，判断到底哪一环对不上 ----
        if (Test-Path (Join-Path $scriptDir '存档修改器.exe')) {
            Say ''
            Say '  ---- 实测 A：游戏在用的存档，能否被修改器算法校验通过 ----'
            $liveFiles = @(Get-ChildItem -Path $defaultDir -File -Filter 'progress-*.json' -ErrorAction SilentlyContinue |
                           Sort-Object LastWriteTime -Descending | Select-Object -First 2)
            if ($liveFiles.Count -eq 0) { Say '     （未找到游戏在用的存档）' 'Yellow' }
            $liveBad = 0
            foreach ($f in $liveFiles) {
                $r = Check-Save $f.FullName
                if (-not $r -or -not $r.Result) { Say ('     · ' + $f.Name + '  (未能校验)') 'Yellow'; continue }
                Say ('     · ' + $f.Name + '   slot=' + $r.Slot + '  revision=' + $r.Revision + '  ' + $r.Result)
                if ($r.Result -eq 'CHECKSUM MISMATCH') { $liveBad++ }
            }
            if ($liveBad -gt 0) {
                Say '     !!! 连游戏自己写的档都算不出正确的校验和 → 修改器的校验算法与当前游戏版本不一致' 'Red'
                Say '         这是根因：只要算法对不上，修改器写出去的档必然被游戏判损坏。' 'Red'
            } else {
                Say '     结论：修改器的校验算法与「游戏自己写的档」完全一致（算法没问题）' 'Green'
            }

            Say ''
            Say '  ---- 实测 B：被隔离的那几个档，到底哪里不合法 ----'
            $checked = 0
            $dropTotal = 0
            $mismatchTotal = 0
            foreach ($f in ($all | Select-Object -First 3)) {
                $r = Check-Save $f.FullName
                if (-not $r -or -not $r.Result) { Say ('     · ' + $f.Name + '  (未能校验)') 'Yellow'; continue }
                $checked++
                Say ('     · ' + $f.Name + '   slot=' + $r.Slot + '  revision=' + $r.Revision + '  ' + $r.Result)
                if ($r.Result -eq 'CHECKSUM MISMATCH') {
                    $mismatchTotal++
                    Say '         → 该文件的校验和与自身内容对不上：它被写过，但校验和没同步更新（或被截断）' 'Yellow'
                }
                if ($r.Dropped.Count -gt 0) {
                    $dropTotal++
                    Say ('         → 用修改器重写此档会丢弃 ' + $r.Dropped.Count + ' 个字段（白名单没覆盖这种结构）：') 'Red'
                    foreach ($d in ($r.Dropped | Select-Object -First 8)) { Say ('            ' + $d) 'Red' }
                }
            }
            Say ''
            Say '  ---- 结论 ----'
            if ($checked -eq 0) {
                Say '     未能完成实测（修改器 exe 缺失或无法运行）' 'Yellow'
            } elseif ($dropTotal -gt 0) {
                Say '     根因：存档结构与修改器的字段白名单不一致 —— 写档时丢字段导致游戏判损坏。' 'Red'
                Say '     请把本报告发给作者，需要扩充白名单后重新适配。' 'Yellow'
            } elseif ($mismatchTotal -gt 0) {
                Say '     这些被隔离的档，校验和与内容不符：属于「写入过程被中断/被杀软拦截/被云同步覆盖」这一类。' 'Yellow'
                Say '     建议按顺序排查：① 完全退出游戏再改；② 关闭 Steam 云同步；' 'Yellow'
                Say '     ③ 把修改器目录加入杀软白名单；④ 确认写入后不要立即用游戏覆盖。' 'Yellow'
            } else {
                Say '     这几个隔离档的校验和都能对上 —— 隔离原因不在修改器的校验和逻辑。' 'Yellow'
                Say '     更可能是游戏自身的存档对写（并发）或云同步冲突导致。' 'Yellow'
            }
        } else {
            Say '  · 同目录未找到「存档修改器.exe」，跳过实测（把它与本脚本放同一文件夹可获得精确结论）' 'Yellow'
        }
    }
}

# ---------- 输出 ----------
try { [IO.File]::WriteAllLines($report, $lines, [Text.Encoding]::UTF8) } catch { Write-Host "报告写入失败: $_" -ForegroundColor Red }
Head '诊断完成'
Say ("报告已保存: $report")
Say '请把这个「诊断报告.txt」发给作者（thus）。'
try { Start-Process notepad.exe $report -ErrorAction SilentlyContinue } catch {}
if (-not $NoPause) { Read-Host '按回车关闭' | Out-Null }
