// apply_eco.js - 注入一键生态打理（window.__RH_ECO__）到 AppContent 主容器组件（props 解构处）的 const 多声明内部
// 用 IIFE 作为 const 的第二个声明符（不破坏语句结构）：
//   const {...}=t, __rhEcoModBind9=(function(){ window.__RH_ECO__={...}; return 1; })(), de=...
// 组件渲染时执行，ue(props.setGameState 全局 setter) 与模块级函数 k0/vl/Vi/xr 均在闭包作用域内。
//
// 【2026-09-06 全面自适应改造】压缩变量名每次游戏更新都会变，硬编码名字极易"同名不同义"
// （v3.15 教训：喂食 _4 实为清定时器、浇水 by 实为广告查询、孵化误用放入函数 b9）。
// 现在所有符号都在打补丁时从目标文件解析：
//   1) 语义键  ：组件 props 解构的大对象里存在语义键名（setGameState/harvestPlant/applyWater/addFeed...），
//                键名是源码里的英文标识，压缩后依然保留 → 用它反查压缩名，最稳。
//   2) 形态匹配：语义键里没有的（放蛋 _9 / 蛋映射 ef / 动物配置 xo / 菜谱），按函数体特征正则解析。
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

// ---------- 2. 语义键解析（组件 props 解构对象：key -> 压缩名） ----------
function resolveSemanticKeys(s, idx) {
  const seg = s.slice(Math.max(0, idx - 26000), idx + 40);
  const re = /([A-Za-z_$][\w$]*):([\w$]+)(?=[,}])/g;
  const map = {};
  let m;
  while ((m = re.exec(seg))) if (!(m[1] in map)) map[m[1]] = m[2]; // 首次出现优先（同一对象内的键）
  return map;
}
const keys = resolveSemanticKeys(src, anchorIdx);
const WANT = [
  ['setGameState', '__RH_FN_SETSTATE__'],
  ['ensureFarmState', '__RH_FN_FARMSTATE__'],
  ['harvestPlant', '__RH_FN_HARVEST__'],
  ['normalizeIncubatorState', '__RH_FN_INCUB__'],
  ['getAnimalDisplayInfo', '__RH_FN_ANIMALINFO__'],
  ['placeAnimal', '__RH_FN_PLACE__'],
  ['addFeed', '__RH_FN_ADDFEED__'],
  ['applyWater', '__RH_FN_WATER__'],
  ['applyFertilizer', '__RH_FN_FERT__'],
];
const sym = {};
for (const [key, ph] of WANT) {
  if (!keys[key]) { console.error('[fail] 语义键 ' + key + ' 未找到'); process.exit(1); }
  sym[ph] = keys[key];
}

// ---------- 3. 放蛋（孵化）函数 + 蛋映射 ----------
// 形态：function X(t,e,n){const s=Vi(t),r=ef(e);return r?{...s,pendingHatches:[...]}:null}
function resolveHatch(s, viName) {
  const loose = new RegExp('function ([\\w$]+)\\([\\w$]+,[\\w$]+,[\\w$]+\\)\\{[\\s\\S]{0,260}?' + viName +
    '\\([\\w$]+\\)[\\s\\S]{0,120}?pendingHatches');
  const m = loose.exec(s);
  if (!m) return null;
  const body = s.slice(m.index, m.index + 600);
  const eggMap = /,[\w$]+=([\w$]+)\([\w$]+\);return/.exec(body);
  return { fn: m[1], eggMap: eggMap ? eggMap[1] : null };
}
const hatch = resolveHatch(src, sym['__RH_FN_INCUB__']);
if (!hatch || !hatch.fn || !hatch.eggMap) {
  console.error('[fail] 未能解析放蛋(孵化)函数 / 蛋映射');
  process.exit(1);
}
sym['__RH_FN_HATCH__'] = hatch.fn;
sym['__RH_FN_EGGMAP__'] = hatch.eggMap;

// ---------- 4. 动物配置对象（xo）：从 placeAnimal 函数体里取 ----------
const placeBody = src.slice(src.indexOf('function ' + sym['__RH_FN_PLACE__'] + '('), src.indexOf('function ' + sym['__RH_FN_PLACE__'] + '(') + 400);
const cfgMatch = /!([\w$]+)\[[\w$]+\]/.exec(placeBody);
if (!cfgMatch) { console.error('[fail] 未能解析动物配置对象'); process.exit(1); }
sym['__RH_FN_ANIMALCFG__'] = cfgMatch[1];

// ---------- 5. 宰杀函数（含 raw_chicken 产物映射、函数头 (list,id)） ----------
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
const fnSlaughter = resolveSlaughter(src);
if (!fnSlaughter) { console.error('[fail] 未能解析宰杀函数'); process.exit(1); }
sym['__RH_FN_SLAUGHTER__'] = fnSlaughter;

// ---------- 6. 菜谱函数（形如 const A=(dev.level||0)+1,B=FN(A)） ----------
function resolveRecipes(s) {
  const re = /const\s+(\w+)=\((\w+)\.level\|\|0\)\+1,\w+=([\w$]+)\(\1\)/g;
  const seen = {};
  let m;
  while ((m = re.exec(s))) { seen[m[3]] = (seen[m[3]] || 0) + 1; }
  let found = null, best = 0;
  for (const k of Object.keys(seen)) { if (seen[k] > best) { best = seen[k]; found = k; } }
  return found;
}
const fnRecipes = resolveRecipes(src);
if (!fnRecipes) { console.error('[fail] 未能解析菜谱函数'); process.exit(1); }
sym['__RH_FN_RECIPES__'] = fnRecipes;

console.log('[符号] ' + Object.keys(sym).map(k => k.replace('__RH_FN_', '').replace('__', '') + '=' + sym[k]).join('  '));

// ---------- 7. 注入 ----------
const injectRaw = fs.readFileSync(path.join(__dirname, 'eco_inject.js'), 'utf8').trim();
let inject = injectRaw;
for (const ph of Object.keys(sym)) inject = inject.split(ph).join(sym[ph]);
if (inject.indexOf('__RH_FN_') >= 0) {
  const left = (inject.match(/__RH_FN_[\w]+__/g) || []).filter((v, i, a) => a.indexOf(v) === i);
  console.error('[fail] 占位符未完全替换: ' + left.join(', '));
  process.exit(1);
}
// 注入体以逗号衔接（不结束 const 多声明）：...}), __rhEcoModBind9=(function(){...})(), vM=...
// 注意：注入体本身不能以分号结尾，否则会切断外层 const 声明（ESM 严格模式报 ReferenceError）
const wrapped = '\n' + inject + ',\n';
const out = src.slice(0, insertAt) + wrapped + src.slice(insertAt);
fs.writeFileSync(file, out, 'utf8');
console.log('[ok] RH_ECO_INJECT 已注入 @' + insertAt + '，文件 ' + file + ' 大小 ' + out.length);
