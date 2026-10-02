// audit_index_match.js - 审计 index-*.js 多文件匹配风险
// 关注点：TARGETS 的 fileRe = /^dist_steam\/assets\/index-.*\.js$/ 会同时匹配
//         index-7a404b5b.js 与 index-ad130a48.js；而 patcher 用 readdirSync().find() 只取第一个。
'use strict';
process.noAsar = true;
const fs = require('fs');
const path = require('path');

const asar = 'D:/桌面/末世：我有一辆房车/resources/app.asar.bak'; // 新版原版
const fd = fs.openSync(asar, 'r');
const sizeBuf = Buffer.alloc(8);
fs.readSync(fd, sizeBuf, 0, 8, null);
const headerSize = sizeBuf.readUInt32LE(4);
const pickle = Buffer.alloc(headerSize);
fs.readSync(fd, pickle, 0, headerSize, 8);
const strLen = pickle.readUInt32LE(4);
const header = JSON.parse(pickle.slice(8, 8 + strLen).toString('utf8'));
fs.closeSync(fd);

const hits = [];
(function walk(node, prefix) {
  for (const name of Object.keys(node.files || {})) {
    const child = node.files[name];
    const p = prefix ? prefix + '/' + name : name;
    if (child.files) { walk(child, p); continue; }
    if (/^dist_steam\/assets\/index-.*\.js$/.test(p)) hits.push({ path: p, size: child.size });
  }
})(header, '');

console.log('=== asar 内匹配 /^dist_steam\/assets\/index-.*\.js$/ 的文件 ===');
for (const h of hits) console.log('  ', h.path, h.size, '字节');
console.log('命中数量:', hits.length);

// 复现 patcher 的 find 逻辑（--from-dir 模式）
const fromDirs = [
  'D:/桌面/末世房车MOD工具库/开发源码/_test/v4/orig',
  'D:/桌面/末世房车MOD工具库/开发源码/_test/v4/patched',
];
const fileRe = /index-.*\.js$/; // 取自 TARGETS.idx.fileRe.source.split('/').pop()
for (const d of fromDirs) {
  if (!fs.existsSync(d)) { console.log('\n[跳过] ' + d + ' 不存在'); continue; }
  const all = fs.readdirSync(d).filter(f => fileRe.test(f));
  console.log('\n=== readdir 顺序 ( ' + d + ' ) ===');
  console.log('  全部匹配:', JSON.stringify(all));
  const chosen = fs.readdirSync(d).find(f => fileRe.test(f));
  console.log('  find() 选中:', chosen);
}

// 安装态目录
const inst = 'D:/桌面/末世：我有一辆房车/resources/app/dist_steam/assets';
if (fs.existsSync(inst)) {
  const all = fs.readdirSync(inst).filter(f => fileRe.test(f));
  console.log('\n=== 已安装目录 readdir 顺序 ===');
  console.log('  全部匹配:', JSON.stringify(all));
  console.log('  find() 选中:', fs.readdirSync(inst).find(f => fileRe.test(f)));
  const idxA = path.join(inst, 'index-7a404b5b.js');
  const idxB = path.join(inst, 'index-ad130a48.js');
  for (const f of [idxA, idxB]) {
    if (!fs.existsSync(f)) continue;
    const s = fs.readFileSync(f, 'utf8');
    console.log('  ' + path.basename(f) + ': 含面板标记=' + s.includes('/*==RH_MOD_PANEL==*/') +
                ' 大小=' + s.length + ' 头部=' + JSON.stringify(s.slice(0, 60)));
  }
}
