// build_mod.js - 一键构建"免环境版"MOD：解包 app.asar -> 打 6 个补丁 -> 补齐 unpacked 原生模块
// 仅在作者本机运行一次；最终交付物不需要 node。
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ASAR = 'D:/桌面/末世：我有一辆房车/resources/app.asar';
const UNPACKED_DIR = 'D:/桌面/末世：我有一辆房车/resources/app.asar.unpacked';
const OUT = 'D:/桌面/末世房车MOD-免环境版/app';
const PATCH_DIR = 'D:/桌面/末世房车MOD工具库/开发源码/rh_src';

function log(m) { console.log('[BUILD] ' + m); }
function fail(m) { console.error('[BUILD ERROR] ' + m); process.exit(1); }

// ---------- 1. 解包 ----------
log('解包 ' + ASAR);
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

const fd = fs.openSync(ASAR, 'r');
const sizeBuf = Buffer.alloc(8);
fs.readSync(fd, sizeBuf, 0, 8, null);
const headerSize = sizeBuf.readUInt32LE(4);
const pickle = Buffer.alloc(headerSize);
fs.readSync(fd, pickle, 0, headerSize, 8);
const strLen = pickle.readUInt32LE(4);
const header = JSON.parse(pickle.slice(8, 8 + strLen).toString('utf8'));
const dataStart = 8 + headerSize;

let files = 0, skippedUnpacked = 0, totalBytes = 0;
const unpackedPaths = [];
function walk(node, prefix) {
  for (const name of Object.keys(node.files || {})) {
    const child = node.files[name];
    const p = prefix ? prefix + '/' + name : name;
    if (child.files) { walk(child, p); continue; }
    if (child.offset === 'unpacked' || child.unpacked === true) {
      skippedUnpacked++; unpackedPaths.push(p); continue; // 内容在 app.asar.unpacked 中，稍后复制
    }
    files++; totalBytes += child.size;
    const offset = parseInt(child.offset, 10);
    const size = child.size;
    const target = path.join(OUT, p);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    const buf = Buffer.alloc(size);
    let pos = 0;
    while (pos < size) {
      const n = fs.readSync(fd, buf, pos, size - pos, dataStart + offset + pos);
      if (n <= 0) throw new Error('read fail at ' + p);
      pos += n;
    }
    fs.writeFileSync(target, buf);
  }
}
walk(header, '');
fs.closeSync(fd);
log(`解包完成: ${files} 个文件, ${(totalBytes / 1024 / 1024).toFixed(1)} MB (跳过 unpacked: ${skippedUnpacked})`);

// ---------- 2. 补齐 unpacked 原生模块 ----------
if (fs.existsSync(UNPACKED_DIR)) {
  fs.cpSync(UNPACKED_DIR, OUT, { recursive: true });
  log('已从 app.asar.unpacked 复制 ' + unpackedPaths.length + ' 个原生模块到 app 目录');
} else {
  log('警告: 未找到 app.asar.unpacked，跳过');
}

// ---------- 3. 定位补丁目标 ----------
const assets = path.join(OUT, 'dist_steam', 'assets');
const teFile = fs.readdirSync(assets).find(f => /^TowerExploration-.*\.js$/.test(f));
const idxFile = fs.readdirSync(assets).find(f => /^index-.*\.js$/.test(f));
const acFile = fs.readdirSync(assets).find(f => /^AppContent-.*\.js$/.test(f));
if (!teFile || !idxFile || !acFile) fail('未找到 TowerExploration / index / AppContent-*.js');
const te = path.join(assets, teFile);
const idx = path.join(assets, idxFile);
const ac = path.join(assets, acFile);
log('补丁目标: ' + teFile + ' / ' + idxFile + ' / ' + acFile);

// ---------- 4. 按 install_mod.js 相同顺序打补丁 ----------
const patches = [
  ['apply_patches.js', [te]],
  ['apply_patch2.js', [te]],
  ['apply_patch3.js', [idx]],        // 面板只进 index.js（apply_patch3 只认第 2 个参数）
  ['apply_patch4.js', [te]],
  ['apply_patch5.js', [te]],
  ['apply_patch6.js', [te]],
  ['apply_eco.js', [ac]],            // 生态打理注入 AppContent
];
for (const [script, args] of patches) {
  const sp = path.join(PATCH_DIR, script);
  log('==> ' + script);
  try {
    execFileSync(process.execPath, [sp, ...args], { stdio: 'inherit' });
  } catch (e) {
    fail('补丁 ' + script + ' 失败: ' + (e.message || e));
  }
}

// ---------- 5. 验证 ----------
let ok = true;
const teSrc = fs.readFileSync(te, 'utf8');
const idxSrc = fs.readFileSync(idx, 'utf8');
const acSrc = fs.readFileSync(ac, 'utf8');
const checks = [
  ['TowerExploration 桥接 __RH_MOD__', teSrc.includes('window.__RH_MOD__={')],
  ['TowerExploration setAutoWin', teSrc.includes('setAutoWin:(on)')],
  ['TowerExploration autoWin effect', teSrc.includes('[MOD]autoWin')],
  ['TowerExploration 战利品分流(apply_patch2)', teSrc.includes('lootBoxState:d?.enemy.encounterType==="boss"?')],
  ['TowerExploration 普通战斗自动全收', teSrc.includes('phase:re?"boss_first_kill_reward":d?.enemy.encounterType==="boss"?"loot_box":"floor_explore",')],
  ['TowerExploration Dt 标志位', teSrc.includes('towerAllFloorsUnlocked')],
  ['TowerExploration 不注入面板(禁止 RH_MOD_PANEL)', !teSrc.includes('RH_MOD_PANEL')],
  ['index.js 面板注入', idxSrc.includes('/*==RH_MOD_PANEL==*/')],
  ['index.js 面板防重复守卫', idxSrc.includes('__RH_PANEL_READY__')],
  ['index.js 面板 KEY F8', idxSrc.includes("var KEY = 'F8'")],
  ['AppContent 生态注入 __RH_ECO__', acSrc.includes('__RH_ECO__')],
  ['AppContent 生态注入标记 RH_ECO_INJECT', acSrc.includes('RH_ECO_INJECT')],
  ['AppContent 无残留占位符 __RH_FN_', !acSrc.includes('__RH_FN_')],
  ['AppContent 宰杀/菜谱函数已按版本解析', /var rr = [A-Za-z0-9_$]+\(cur, doomed\[i\]\.id\)/.test(acSrc) && /var recipes = [A-Za-z0-9_$]+\(\(stove\.level/.test(acSrc)],
];
for (const [name, pass] of checks) {
  console.log(`[VERIFY ${pass ? 'OK' : 'FAIL'}] ${name}`);
  if (!pass) ok = false;
}
if (!ok) fail('验证失败');

// ---------- 6. 构建报告 ----------
const report = {
  builtAt: new Date().toISOString(),
  gameAsar: path.basename(ASAR),
  asarBytes: fs.statSync(ASAR).size,
  teFile, idxFile,
  files, totalBytes, skippedUnpacked,
  patchOrder: patches.map(p => p[0]),
};
fs.writeFileSync(path.join(OUT, '..', 'build_report.json'), JSON.stringify(report, null, 2));
log('构建完成！交付目录: ' + path.dirname(OUT));
