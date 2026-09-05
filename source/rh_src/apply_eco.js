// apply_eco.js - 注入一键收获/宰杀/烹饪（window.__RH_ECO__）到 AppContent 主容器组件（props 解构处）的 const 多声明内部
// 用 IIFE 作为 const 的第二个声明符（不破坏语句结构）：
//   const {...}=t, __rhEcoModBind9=(function(){ window.__RH_ECO__={...}; return 1; })(), de=...
// 组件渲染时执行，ue(props.setGameState 全局 setter) 与模块级函数 k0/vl/Vi/xr 均在闭包作用域内。
//
// 【2026-09-05 版本自适应改造】压缩变量名每次游戏更新都会变（v3.5: Lee / v4 / R2  ->  新版: qee / T4 / L2），
// 故改为在打补丁时从目标文件里解析出真实标识符，再替换 eco_inject.js 中的占位符：
//   - 注入锚点     ：正则匹配 syncAndSaveGallery:<xxx>}),
//   - __RH_FN_SLAUGHTER__：含 raw_chicken 产物映射、函数头为 (list,id) 的宰杀函数
//   - __RH_FN_RECIPES__  ：灶台菜谱查询函数（形如 const A=(dev.level||0)+1,B=FN(A)）
// 这样后续游戏小幅更新只要结构不变，无需再改脚本。
const fs = require('fs');
const path = require('path');

const file = process.argv[2];
if (!file) { console.error('用法: node apply_eco.js <AppContent.js>'); process.exit(1); }

const src = fs.readFileSync(file, 'utf8');
if (src.indexOf('/*==RH_ECO_INJECT==*/') >= 0) {
  console.log('[skip] RH_ECO_INJECT 已存在，跳过');
  process.exit(0);
}

// ---------- 1. 解析注入锚点 ----------
const anchorMatches = src.match(/syncAndSaveGallery:[\w$]+\}\),/g) || [];
if (anchorMatches.length !== 1) {
  console.error('[fail] 注入锚点 syncAndSaveGallery:<x>}), 匹配 ' + anchorMatches.length + ' 处，期望 1');
  process.exit(1);
}
const anchor = anchorMatches[0];
const anchorIdx = src.indexOf(anchor);
const insertAt = anchorIdx + anchor.length;
console.log('[锚点] ' + anchor + ' @' + anchorIdx);

// ---------- 2. 解析宰杀函数 ----------
function resolveSlaughter(s) {
  const mi = s.indexOf('raw_chicken');
  if (mi < 0) return null;
  const re = /function\s+([\w$]+)\(([\w$]+),([\w$]+)\)\{/g;
  let m, found = null;
  while ((m = re.exec(s))) {
    if (m.index >= mi) break;
    const body = s.slice(m.index, mi + 300);
    if (body.indexOf('isMature') >= 0 && body.indexOf('raw_chicken') >= 0) found = m[1];
  }
  return found;
}

// ---------- 3. 解析菜谱函数 ----------
function resolveRecipes(s) {
  // 形态：const At=(xt.level||0)+1,Ct=R2(At)   -> 菜谱函数 = R2 / L2
  const re = /const\s+(\w+)=\((\w+)\.level\|\|0\)\+1,\w+=([\w$]+)\(\1\)/g;
  const seen = {};
  let m;
  while ((m = re.exec(s))) { seen[m[3]] = (seen[m[3]] || 0) + 1; }
  let found = null, best = 0;
  for (const k of Object.keys(seen)) { if (seen[k] > best) { best = seen[k]; found = k; } }
  return found;
}

const fnSlaughter = resolveSlaughter(src);
const fnRecipes = resolveRecipes(src);
if (!fnSlaughter) { console.error('[fail] 未能解析宰杀函数（未找到含 raw_chicken 的 (list,id) 函数）'); process.exit(1); }
if (!fnRecipes) { console.error('[fail] 未能解析菜谱函数（未找到 (dev.level||0)+1 调用形态）'); process.exit(1); }
console.log('[符号] 宰杀=' + fnSlaughter + '  菜谱=' + fnRecipes);

// ---------- 4. 注入 ----------
const injectRaw = fs.readFileSync(path.join(__dirname, 'eco_inject.js'), 'utf8').trim();
const inject = injectRaw
  .split('__RH_FN_SLAUGHTER__').join(fnSlaughter)
  .split('__RH_FN_RECIPES__').join(fnRecipes);
if (inject.indexOf('__RH_FN_') >= 0) {
  console.error('[fail] 占位符未完全替换');
  process.exit(1);
}
// 注入体以逗号衔接（不结束 const 多声明）：...}), __rhEcoModBind9=(function(){...})(), vM=...
// 注意：注入体本身不能以分号结尾，否则会切断外层 const 声明（ESM 严格模式报 ReferenceError）
const wrapped = '\n' + inject + ',\n';
const out = src.slice(0, insertAt) + wrapped + src.slice(insertAt);
fs.writeFileSync(file, out, 'utf8');
console.log('[ok] RH_ECO_INJECT 已注入 @' + insertAt + '，文件 ' + file + ' 大小 ' + out.length);
