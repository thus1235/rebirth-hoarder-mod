// finish_install.js - 补完 install_now.js 的第 3、4 步（补齐 unpacked + 覆盖补丁）
const fs = require('fs');
const path = require('path');

const GAME = process.argv[2] || 'D:/桌面/末世：我有一辆房车';
const RES = path.join(GAME, 'resources');
const APP = path.join(RES, 'app');
const UNPACKED = path.join(RES, 'app.asar.unpacked');
const PATCHED = 'D:/桌面/末世房车MOD工具库/修改器/patched';
function log(m) { console.log('[MOD] ' + m); }

// 3. 补齐 unpacked 原生模块（逐文件复制，避免 cpSync 异常）
if (fs.existsSync(UNPACKED)) {
  let n = 0;
  (function cp(src, dst) {
    fs.mkdirSync(dst, { recursive: true });
    for (const e of fs.readdirSync(src, { withFileTypes: true })) {
      const s = path.join(src, e.name), d = path.join(dst, e.name);
      if (e.isDirectory()) cp(s, d);
      else { fs.copyFileSync(s, d); n++; log('  原生模块: ' + e.name); }
    }
  })(UNPACKED, APP);
  log('已补齐原生模块 ' + n + ' 个文件');
}

// 4. 覆盖补丁
const assets = path.join(APP, 'dist_steam', 'assets');
const all = fs.readdirSync(assets);
const pairs = [
  [/^TowerExploration-.*\.js$/],
  [/^index-.*\.js$/],
  [/^AppContent-.*\.js$/],
];
let ok = true;
for (const [re] of pairs) {
  const tgt = all.find(f => re.test(f));
  const patchFile = fs.readdirSync(PATCHED).find(f => re.test(f));
  if (!tgt || !patchFile) { console.error('[错误] 未找到 ' + re); ok = false; continue; }
  const srcP = path.join(PATCHED, patchFile), dstP = path.join(assets, tgt);
  fs.copyFileSync(srcP, dstP);
  const a = fs.statSync(srcP).size, b = fs.statSync(dstP).size;
  log('补丁 ' + patchFile + ' -> ' + tgt + '  (' + a + '/' + b + ')');
  if (a !== b) { console.error('[错误] 校验失败'); ok = false; }
}
console.log(ok ? '\n>>> 安装完成' : '\n>>> 有失败项');
process.exit(ok ? 0 : 1);
