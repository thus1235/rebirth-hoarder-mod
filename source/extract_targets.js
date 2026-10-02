// extract_targets.js —— 从 app.asar 里只提取 MOD 需要的 3 个 js
// 用法: node extract_targets.js <app.asar 路径> <输出目录>
'use strict';
process.noAsar = true;
const fs = require('fs');
const path = require('path');

const archive = process.argv[2];
const outDir = process.argv[3];
if (!archive || !outDir) { console.error('用法: node extract_targets.js <app.asar> <outDir>'); process.exit(1); }

const RE = [
  { key: 'te', re: /^dist_steam\/assets\/TowerExploration-.*\.js$/ },
  { key: 'idx', re: /^dist_steam\/assets\/index-.*\.js$/ },
  { key: 'ac', re: /^dist_steam\/assets\/AppContent-.*\.js$/ },
];

const fd = fs.openSync(archive, 'r');
try {
  const sizeBuf = Buffer.alloc(8);
  fs.readSync(fd, sizeBuf, 0, 8, null);
  const headerSize = sizeBuf.readUInt32LE(4);
  const pickle = Buffer.alloc(headerSize);
  fs.readSync(fd, pickle, 0, headerSize, 8);
  const strLen = pickle.readUInt32LE(4);
  const header = JSON.parse(pickle.slice(8, 8 + strLen).toString('utf8'));
  const dataStart = 8 + headerSize;
  console.log('asar 总字节 =', fs.statSync(archive).size, ' headerSize =', headerSize);

  const found = {};
  (function walk(node, prefix) {
    for (const name of Object.keys(node.files || {})) {
      const child = node.files[name];
      const p = prefix ? prefix + '/' + name : name;
      if (child.files) { walk(child, p); continue; }
      for (const t of RE) {
        if (!found[t.key] && typeof child.offset === 'string' && t.re.test(p)) {
          found[t.key] = { path: p, size: child.size, offset: parseInt(child.offset, 10) };
        }
      }
    }
  })(header, '');

  fs.mkdirSync(outDir, { recursive: true });
  for (const t of RE) {
    const f = found[t.key];
    if (!f) { console.error('未找到 ' + t.re); continue; }
    const buf = Buffer.alloc(f.size);
    let pos = 0;
    while (pos < f.size) {
      const n = fs.readSync(fd, buf, pos, f.size - pos, dataStart + f.offset + pos);
      if (n <= 0) throw new Error('read fail ' + f.path);
      pos += n;
    }
    const name = path.basename(f.path);
    fs.writeFileSync(path.join(outDir, name), buf);
    console.log('已提取', t.key, name, f.size, '字节');
  }
} finally { fs.closeSync(fd); }
