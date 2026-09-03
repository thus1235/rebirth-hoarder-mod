// 注入一键收获/宰杀/烹饪（window.__RH_ECO__）到 AppContent 主容器组件（props 解构处）的 const 多声明内部
// 用 IIFE 作为 const 的第二个声明符（不破坏语句结构）：
//   const {...}=t, __rhEcoModBind9=(function(){ window.__RH_ECO__={...}; return 1; })(), de=...
// 组件渲染时执行，ue(props.setGameState 全局 setter) 与模块级函数 k0/vl/Vi/xr/v4/R2/ze 均在闭包作用域内。
const fs = require('fs');
const path = require('path');

const file = process.argv[2];
if (!file) { console.error('用法: node apply_eco.js <AppContent.js>'); process.exit(1); }

const src = fs.readFileSync(file, 'utf8');
if (src.indexOf('/*==RH_ECO_INJECT==*/') >= 0) {
  console.log('[skip] RH_ECO_INJECT 已存在，跳过');
  process.exit(0);
}

const inject = fs.readFileSync(path.join(__dirname, 'eco_inject.js'), 'utf8').trim();
const anchor = 'syncAndSaveGallery:Lee}),';
const idx = src.indexOf(anchor);
if (idx < 0) {
  console.error('[fail] 未找到注入锚点 syncAndSaveGallery:Lee}),');
  process.exit(1);
}
const insertAt = idx + anchor.length;
// 注入体以逗号衔接（不结束 const 多声明）：...}), __rhEcoModBind9=(function(){...})(), vM=...
// 注意：注入体本身不能以分号结尾，否则会切断外层 const 声明（ESM 严格模式报 ReferenceError）
const wrapped = '\n' + inject + ',\n';
const out = src.slice(0, insertAt) + wrapped + src.slice(insertAt);
fs.writeFileSync(file, out, 'utf8');
console.log('[ok] RH_ECO_INJECT 已注入 @' + insertAt + '，文件 ' + file + ' 大小 ' + out.length);
