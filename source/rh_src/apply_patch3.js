// apply_patch3.js - 仅向 index.js 注入 F8 面板（桥接改由 apply_patch5 注入）
const fs = require('fs');
const panelSrc = fs.readFileSync(__dirname + '/mod_panel.js', 'utf8').trim();

const idxFile = process.argv[2];
let idx = fs.readFileSync(idxFile, 'utf8');
if (idx.includes('/*==RH_MOD_PANEL==*/')) {
  console.log('[index.js] 面板已存在，跳过');
} else {
  const inject = '/*==RH_MOD_PANEL==*/\n' + panelSrc + '\n';
  idx = inject + idx;
  fs.writeFileSync(idxFile, idx, 'utf8');
  console.log('[index.js] 面板已注入 (' + panelSrc.length + ' 字节)');
}
console.log('完成');
