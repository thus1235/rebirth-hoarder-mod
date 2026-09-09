// apply_patch3.js - 向 index.js 头部注入 F8 面板（v3.21：双模式）
// 面板本体（mod_panel.js）只通过 window.__RH_MOD__ / window.__RH_UE__ 桥接，不依赖压缩变量名。
'use strict';
const fs = require('fs');
const path = require('path');

const PATCH = 'F8面板';

function patch({ src, log }) {
  log = log || (() => {});
  if (src.includes('/*==RH_MOD_PANEL==*/')) {
    log('面板已存在，跳过');
    return src;
  }
  const panelSrc = fs.readFileSync(path.join(__dirname, 'mod_panel.js'), 'utf8').trim();
  return '/*==RH_MOD_PANEL==*/\n' + panelSrc + '\n' + src;
}

module.exports = { patch };

// ---------- CLI 兼容模式 ----------
if (require.main === module) {
  const file = process.argv[2];
  if (!file) { console.error('用法: node apply_patch3.js <index-*.js>'); process.exit(1); }
  let src = fs.readFileSync(file, 'utf8');
  try {
    src = patch({ src, log: m => console.log('[' + PATCH + '] ' + m) });
    fs.writeFileSync(file, src, 'utf8');
    console.log(`[${PATCH}] 写入完成: ${file}`);
  } catch (e) {
    console.error(String(e.message || e));
    process.exit(1);
  }
}
