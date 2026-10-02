// audit_install_integrity.js - 校验已安装 app 目录 vs 原版 asar 的完整性
// 关注：全量解包是否漏文件；app.asar.unpacked 的原生模块是否补齐
'use strict';
process.noAsar = true;
const fs = require('fs');
const path = require('path');

const RES = 'D:/桌面/末世：我有一辆房车/resources';
const ASAR = path.join(RES, 'app.asar.bak');
const APP = path.join(RES, 'app');
const UNPACKED = path.join(RES, 'app.asar.unpacked');

// ---- 读 asar 清单 ----
function listAsar(archive) {
  const fd = fs.openSync(archive, 'r');
  try {
    const sizeBuf = Buffer.alloc(8);
    fs.readSync(fd, sizeBuf, 0, 8, null);
    const headerSize = sizeBuf.readUInt32LE(4);
    const pickle = Buffer.alloc(headerSize);
    fs.readSync(fd, pickle, 0, headerSize, 8);
    const strLen = pickle.readUInt32LE(4);
    const header = JSON.parse(pickle.slice(8, 8 + strLen).toString('utf8'));
    const packed = [], unpacked = [];
    (function walk(node, prefix) {
      for (const name of Object.keys(node.files || {})) {
        const child = node.files[name];
        const p = prefix ? prefix + '/' + name : name;
        if (child.files) { walk(child, p); continue; }
        if (child.offset === 'unpacked' || child.unpacked === true) unpacked.push({ p, size: child.size });
        else packed.push({ p, size: child.size });
      }
    })(header, '');
    return { packed, unpacked };
  } finally { fs.closeSync(fd); }
}

const asarList = listAsar(ASAR);
console.log('原版 asar: 常规文件 ' + asarList.packed.length + ' 个，unpacked 文件 ' + asarList.unpacked.length + ' 个');

// ---- 列 app 目录实际文件 ----
function listDir(root) {
  const out = [];
  (function walk(d, prefix) {
    for (const name of fs.readdirSync(d)) {
      const full = path.join(d, name);
      const rel = prefix ? prefix + '/' + name : name;
      const st = fs.statSync(full);
      if (st.isDirectory()) walk(full, rel);
      else out.push({ p: rel, size: st.size });
    }
  })(root, '');
  return out;
}
const appFiles = listDir(APP);
console.log('已安装 app 目录: ' + appFiles.length + ' 个文件');
const appMap = new Map(appFiles.map(f => [f.p, f.size]));

// ---- 校验 1：asar 常规文件是否都在 app 目录 ----
console.log('\n=== 1. 原版常规文件覆盖检查 ===');
const missing = asarList.packed.filter(f => !appMap.has(f.p));
console.log('  缺失: ' + missing.length + ' 个');
if (missing.length) for (const m of missing.slice(0, 20)) console.log('    [缺] ' + m.p + ' (' + m.size + ')');

// ---- 校验 2：unpacked 原生模块是否补齐 ----
console.log('\n=== 2. unpacked 原生模块补齐检查 ===');
const missUnpacked = asarList.unpacked.filter(f => !appMap.has(f.p));
console.log('  asar 声明 unpacked ' + asarList.unpacked.length + ' 个，app 目录缺失 ' + missUnpacked.length + ' 个');
for (const m of asarList.unpacked.slice(0, 10)) {
  const has = appMap.has(m.p);
  console.log('    ' + (has ? '[有]' : '[缺]') + ' ' + m.p + ' (' + m.size + ')');
}
if (missUnpacked.length) for (const m of missUnpacked.slice(0, 10)) console.log('    [缺!] ' + m.p);

// ---- 校验 3：三个目标文件是否已打补丁 ----
console.log('\n=== 3. 补丁标记检查（已安装文件）===');
const checks = [
  ['TowerExploration-c892950e.js', ['window.__RH_MOD__={', 'restoreProgressFloor', '[MOD]Da', '__RH_UNLOCK_ALL__']],
  ['index-7a404b5b.js', ['/*==RH_MOD_PANEL==*/', '__RH_PANEL_READY__']],
  ['AppContent-540e8fef.js', ['__RH_ECO__', 'RH_ECO_INJECT']],
];
for (const [f, marks] of checks) {
  const full = path.join(APP, 'dist_steam', 'assets', f);
  if (!fs.existsSync(full)) { console.log('  [缺文件] ' + f); continue; }
  const s = fs.readFileSync(full, 'utf8');
  const r = marks.map(m => (s.includes(m) ? '✓' : '✗') + m).join('  ');
  console.log('  ' + f + ': ' + r);
}

// ---- 校验 4：干扰文件未被注入 ----
console.log('\n=== 4. 再导出壳文件未被误注入 ===');
const shell = path.join(APP, 'dist_steam', 'assets', 'index-ad130a48.js');
if (fs.existsSync(shell)) {
  const s = fs.readFileSync(shell, 'utf8');
  console.log('  index-ad130a48.js: 面板标记=' + s.includes('/*==RH_MOD_PANEL==*/') + ' (应为 false) 大小=' + s.length);
} else console.log('  (无此文件)');

// ---- 校验 5：app 目录里额外的 .map 等无关文件 ----
console.log('\n=== 5. app 目录文件总量对比 ===');
const asarTotal = asarList.packed.length + asarList.unpacked.length;
console.log('  asar 声明总数 ' + asarTotal + ' vs app 实际 ' + appFiles.length + '  → 差 ' + (appFiles.length - asarTotal));
const extra = appFiles.filter(f => !asarList.packed.some(a => a.p === f.p) && !asarList.unpacked.some(a => a.p === f.p));
console.log('  app 目录中 asar 未声明的文件: ' + extra.length + ' 个');
for (const e of extra.slice(0, 15)) console.log('    [+] ' + e.p + ' (' + e.size + ')');
