// install_now.js - 用 Node 完成 MOD 安装（等价于 install_mod.ps1 的行为）
// 用法: node install_now.js <游戏目录>
// 流程: 备份 app.asar -> app.asar.bak，解包到 resources/app，补齐 unpacked 原生模块，
//       用 修改器/patched/ 下对应文件覆盖 dist_steam/assets 里的目标 js。
const fs = require('fs');
const path = require('path');

const GAME = process.argv[2] || 'D:/桌面/末世：我有一辆房车';
const RES = path.join(GAME, 'resources');
const ASAR = path.join(RES, 'app.asar');
const BAK = path.join(RES, 'app.asar.bak');
const APP = path.join(RES, 'app');
const UNPACKED = path.join(RES, 'app.asar.unpacked');
const PATCHED = 'D:/桌面/末世房车MOD工具库/修改器/patched';

function log(m) { console.log('[MOD] ' + m); }
function fail(m) { console.error('[错误] ' + m); process.exit(1); }

if (!fs.existsSync(path.join(GAME, 'Rebirth Hoarder.exe'))) fail('未找到 Rebirth Hoarder.exe: ' + GAME);
if (fs.existsSync(APP)) fail('resources\\app 已存在，请先还原原版再安装。');
if (!fs.existsSync(ASAR)) fail('未找到 app.asar，游戏文件不完整。');

// ---------- 1. 备份 ----------
log('备份 app.asar -> app.asar.bak');
if (fs.existsSync(BAK)) fs.rmSync(BAK, { force: true });
fs.renameSync(ASAR, BAK);

// ---------- 2. 解包 ----------
log('解包中（约 1.4GB，请稍候）...');
try {
  const fd = fs.openSync(BAK, 'r');
  const sizeBuf = Buffer.alloc(8);
  fs.readSync(fd, sizeBuf, 0, 8, null);
  const headerSize = sizeBuf.readUInt32LE(4);
  const pickle = Buffer.alloc(headerSize);
  fs.readSync(fd, pickle, 0, headerSize, 8);
  const strLen = pickle.readUInt32LE(4);
  const header = JSON.parse(pickle.slice(8, 8 + strLen).toString('utf8'));
  const dataStart = 8 + headerSize;

  let files = 0, skipped = 0;
  fs.mkdirSync(APP, { recursive: true });
  (function walk(node, prefix) {
    for (const name of Object.keys(node.files || {})) {
      const child = node.files[name];
      const p = prefix ? prefix + '/' + name : name;
      if (child.files) { walk(child, p); continue; }
      if (child.offset === 'unpacked' || child.unpacked === true) { skipped++; continue; }
      const size = child.size;
      const offset = parseInt(child.offset, 10);
      const target = path.join(APP, p);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      const buf = Buffer.alloc(size);
      let pos = 0;
      while (pos < size) {
        const n = fs.readSync(fd, buf, pos, size - pos, dataStart + offset + pos);
        if (n <= 0) throw new Error('read fail: ' + p);
        pos += n;
      }
      fs.writeFileSync(target, buf);
      files++;
      if (files % 500 === 0) log('  已解包 ' + files + ' 个文件...');
    }
  })(header, '');
  fs.closeSync(fd);
  log('解包完成: ' + files + ' 个文件（跳过 unpacked ' + skipped + '）');
} catch (e) {
  // 失败还原
  if (fs.existsSync(APP)) fs.rmSync(APP, { recursive: true, force: true });
  if (!fs.existsSync(ASAR) && fs.existsSync(BAK)) fs.renameSync(BAK, ASAR);
  fail('解包失败: ' + e.message);
}

// ---------- 3. 补齐 unpacked 原生模块 ----------
if (fs.existsSync(UNPACKED)) {
  fs.cpSync(UNPACKED, APP, { recursive: true });
  log('已补齐原生模块 (app.asar.unpacked)');
}

// ---------- 4. 覆盖补丁文件 ----------
const assets = path.join(APP, 'dist_steam', 'assets');
if (!fs.existsSync(assets)) fail('未找到 dist_steam/assets，游戏结构异常。');
const all = fs.readdirSync(assets);
const map = [
  [/^TowerExploration-.*\.js$/, /^TowerExploration-.*\.js$/],
  [/^index-.*\.js$/, /^index-.*\.js$/],
  [/^AppContent-.*\.js$/, /^AppContent-.*\.js$/],
];
let ok = true;
for (const [targetRe, patchRe] of map) {
  const tgt = all.find(f => targetRe.test(f));
  const patchFile = fs.readdirSync(PATCHED).find(f => patchRe.test(f));
  if (!tgt) { console.error('[错误] 游戏中未找到匹配 ' + targetRe); ok = false; continue; }
  if (!patchFile) { console.error('[错误] patched 目录中未找到匹配 ' + patchRe); ok = false; continue; }
  const srcP = path.join(PATCHED, patchFile);
  const dstP = path.join(assets, tgt);
  fs.copyFileSync(srcP, dstP);
  const a = fs.statSync(srcP).size, b = fs.statSync(dstP).size;
  log('补丁: ' + patchFile + ' -> ' + tgt + '  (' + a + ' / ' + b + ' 字节)');
  if (a !== b) { console.error('[错误] 大小校验失败: ' + tgt); ok = false; }
}
if (!ok) fail('补丁写入校验失败，请检查。');

log('');
log('============================================');
log(' 安装完成！');
log(' 启动游戏，进入废墟探索后按 F8 打开修改面板。');
log('============================================');
