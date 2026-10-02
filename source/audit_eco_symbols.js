// audit_eco_symbols.js - 独立验证 apply_eco 解析出的符号语义正确性
// 手法一（当前实现）：锚点前 26000 字符窗口内，首个 `key:value` 优先
// 手法二（精确）：从锚点向前做花括号配平，定位「锚点所在的那个 props 解构对象」，只在该对象内解析
// 两者对比：不一致 => 当前实现可能取了别处的同名键（错名 => 功能静默失效）
'use strict';
const fs = require('fs');

const ac = fs.readFileSync('_test/v4/orig/AppContent-540e8fef.js', 'utf8');
const anchorRe = /syncAndSaveGallery:[\w$]+\}\),/g;
const m = anchorRe.exec(ac);
if (!m) { console.error('未找到锚点'); process.exit(1); }
const anchorIdx = m.index;
console.log('锚点: ' + m[0] + ' @' + anchorIdx);

const WANT = ['setGameState', 'ensureFarmState', 'harvestPlant', 'normalizeIncubatorState',
  'getAnimalDisplayInfo', 'placeAnimal', 'addFeed', 'applyWater', 'applyFertilizer'];

// ---- 手法一：窗口法（复刻当前实现）----
function windowMethod(s, idx) {
  const seg = s.slice(Math.max(0, idx - 26000), idx + 40);
  const re = /([A-Za-z_$][\w$]*):([\w$]+)(?=[,}])/g;
  const map = {};
  let mm;
  while ((mm = re.exec(seg))) if (!(mm[1] in map)) map[mm[1]] = mm[2];
  return map;
}
const winMap = windowMethod(ac, anchorIdx);

// ---- 手法二：精确定位 props 解构对象 ----
function exactObject(s, idx) {
  // 从 idx 向前做反向花括号配平；跳过长字符串（粗略：只按引号成对跳过）
  let depth = 0;
  for (let i = idx; i >= 0; i--) {
    const c = s[i];
    if (c === '}') depth++;
    else if (c === '{') {
      if (depth === 0) return { start: i };   // 找到包裹锚点的最内层对象起点
      depth--;
    }
  }
  return null;
}
const objStart = exactObject(ac, anchorIdx);
let exactMap = {};
let objEnd = -1;
if (objStart) {
  // 正向找配对的结束位置
  let depth = 0;
  for (let i = objStart.start; i < ac.length; i++) {
    const c = ac[i];
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) { objEnd = i; break; } }
  }
  const body = ac.slice(objStart.start, objEnd + 1);
  const re = /([A-Za-z_$][\w$]*):([\w$]+)(?=[,}])/g;
  let mm;
  while ((mm = re.exec(body))) if (!(mm[1] in exactMap)) exactMap[mm[1]] = mm[2];
  console.log('props 解构对象范围: @' + objStart.start + '..' + objEnd + '（' + body.length + ' 字符）');
}

console.log('\n=== 符号解析对比 ===');
let diff = 0;
for (const k of WANT) {
  const a = winMap[k], b = exactMap[k];
  const flag = a === b ? '一致' : '★不一致';
  if (a !== b) diff++;
  console.log(`  ${k.padEnd(24)} 窗口法=${String(a).padEnd(6)} 精确法=${String(b).padEnd(6)} ${flag}`);
}
console.log('\n差异数: ' + diff);

// ---- 手法三：语义验证：这些符号的函数体是否真是对应功能 ----
console.log('\n=== 符号函数体语义抽查（用精确法的结果）===');
const FEATURES = {
  setGameState: null,
  ensureFarmState: ['hydroponics', 'farm'],
  harvestPlant: ['mature', 'stage'],
  normalizeIncubatorState: ['pendingHatches', 'hatch'],
  getAnimalDisplayInfo: ['animal', 'name'],
  placeAnimal: ['animal', 'row'],
  addFeed: ['feedStock'],
  applyWater: ['watered'],
  applyFertilizer: ['fertilized'],
};
for (const k of WANT) {
  const sym = exactMap[k];
  if (!sym) { console.log('  ' + k + ': 未解析'); continue; }
  // 找该符号的定义：`function sym(` 或 `sym=function` 或 `sym=(` 形式
  const pats = [
    new RegExp('function\\s+' + sym + '\\s*\\('),
    new RegExp('\\b' + sym + '\\s*=\\s*function'),
    new RegExp('\\b' + sym + '\\s*=\\s*\\('),
  ];
  let pos = -1, form = '';
  for (const p of pats) { const r = p.exec(ac); if (r && (pos < 0 || r.index < pos)) { pos = r.index; form = p.source; } }
  if (pos < 0) { console.log('  ' + k + ' (' + sym + '): 未找到函数定义'); continue; }
  const body = ac.slice(pos, pos + 320);
  const feats = FEATURES[k] || [];
  const got = feats.filter(f => body.includes(f));
  console.log(`  ${k} (${sym}) @${pos}  期望特征[${feats.join(',')}] 命中[${got.join(',') || '无'}]`);
}
