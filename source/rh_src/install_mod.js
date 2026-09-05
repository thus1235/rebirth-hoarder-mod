// install_mod.js - 自适应安装/重装 MOD
// 用法: node install_mod.js <游戏目录> [--force]
// 功能: 版本检测(asar hash) -> 解包 -> 打补丁 -> 失败自动还原 -> 记录版本
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const GAME = process.argv[2];
const FORCE = process.argv.includes('--force');
const SCRIPT_DIR = __dirname;
const ASSETS = path.join(GAME, 'resources', 'app', 'dist_steam', 'assets');
const BAK = path.join(GAME, 'resources', 'app.asar.bak');
const ASAR = path.join(GAME, 'resources', 'app.asar');
const APP_DIR = path.join(GAME, 'resources', 'app');
const REC = path.join(GAME, 'resources', 'rhmod_installed.json');
const PATCH_VERSION = 'v2.3-20260905'; // 补丁版本（与补丁脚本配套）

function log(m) { console.log('[MOD] ' + m); }
function fail(m) { console.error('[错误] ' + m); process.exit(1); }

function sha256(file) {
  const h = crypto.createHash('sha256');
  const fd = fs.openSync(file, 'r');
  const size = fs.fstatSync(fd).size;
  const buf = Buffer.alloc(1024 * 1024);
  let pos = 0;
  while (pos < size) { const n = fs.readSync(fd, buf, 0, buf.length, pos); h.update(buf.subarray(0, n)); pos += n; }
  fs.closeSync(fd);
  return h.digest('hex');
}

function runNode(script, args) {
  execFileSync(process.execPath, [script, ...args], { stdio: 'inherit', cwd: SCRIPT_DIR });
}

function findAsset(pattern) {
  let files = [];
  try { files = fs.readdirSync(ASSETS); } catch (e) { return null; }
  const hit = files.filter(f => pattern.test(f));
  return hit.length ? path.join(ASSETS, hit[0]) : null;
}

function restoreOriginal() {
  log('正在还原原版...');
  try { fs.rmSync(APP_DIR, { recursive: true, force: true }); } catch (e) {}
  if (fs.existsSync(BAK) && !fs.existsSync(ASAR)) {
    try { fs.renameSync(BAK, ASAR); } catch (e) {}
  }
}

// ---- 1. 参数检查 ----
if (!GAME) fail('请传入游戏目录');
if (!fs.existsSync(path.join(GAME, 'resources'))) fail('未找到游戏目录: ' + GAME);

// ---- 2. 备份原版 asar ----
if (!fs.existsSync(BAK)) {
  if (fs.existsSync(ASAR)) { fs.renameSync(ASAR, BAK); log('已备份原版 app.asar -> app.asar.bak'); }
  else fail('找不到 app.asar 或 app.asar.bak');
}

// ---- 3. 版本检测 ----
const asarHash = sha256(BAK);
let prev = null;
try { prev = JSON.parse(fs.readFileSync(REC, 'utf8')); } catch (e) {}
const alreadyInstalled = prev && prev.asarHash === asarHash && fs.existsSync(APP_DIR);

if (alreadyInstalled && !FORCE) {
  log('检测到 MOD 已安装且游戏版本未变化，跳过安装（加 --force 可强制重装）');
  process.exit(0);
}
if (prev && prev.asarHash !== asarHash) {
  log('检测到游戏已更新（app.asar 内容变化），开始自动重装...');
} else {
  log('开始安装...');
}

// ---- 4. 解包 ----
log('解包游戏资源...');
try { fs.rmSync(APP_DIR, { recursive: true, force: true }); } catch (e) {}
runNode(path.join(SCRIPT_DIR, 'asar_extract_all.js'), [BAK, APP_DIR]);

// ---- 5. 打补丁（自动匹配文件名）----
const teFile = findAsset(/^TowerExploration-.*\.js$/);
const idxFile = findAsset(/^index-.*\.js$/);
const acFile = findAsset(/^AppContent-.*\.js$/);
if (!teFile || !idxFile || !acFile) { restoreOriginal(); fail('未找到补丁目标文件，已还原原版'); }

const patches = [
  ['apply_patches.js', [teFile]],
  ['apply_patch2.js', [teFile]],
  ['apply_patch3.js', [idxFile]],
  ['apply_patch4.js', [teFile]],
  ['apply_patch5.js', [teFile]],
  ['apply_patch6.js', [teFile]],
  ['apply_eco.js', [acFile]],
];
log('打补丁中...');
for (const [script, args] of patches) {
  const sp = path.join(SCRIPT_DIR, script);
  if (!fs.existsSync(sp)) { restoreOriginal(); fail('缺少补丁脚本 ' + script + '，已还原原版'); }
  try { runNode(sp, args); }
  catch (e) { restoreOriginal(); fail('补丁 ' + script + ' 失败：游戏版本可能已重构，本 MOD 需等待适配版。已自动还原原版。'); }
}

// ---- 6. 记录版本 ----
try {
  fs.writeFileSync(REC, JSON.stringify({ asarHash, patchVersion: PATCH_VERSION, installedAt: Date.now() }, null, 2));
} catch (e) {}

log('安装成功！启动游戏，进废墟后按 F8 打开面板。');
