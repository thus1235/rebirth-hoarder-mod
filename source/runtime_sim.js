// runtime_sim.js - 真实执行注入到游戏里的桥接代码，验证运行时逻辑（非仅语法）
// 做法：从已安装的 TE.js 里原样抠出注入的 useEffect 体，用 mock 的 React/状态跑一遍，
//       检查 window.__RH_MOD__ 七个方法是否按预期读写游戏状态。
'use strict';
const fs = require('fs');
const path = require('path');

const GAME_TE = 'D:/桌面/末世：我有一辆房车/resources/app/dist_steam/assets/TowerExploration-c892950e.js';
const te = fs.readFileSync(GAME_TE, 'utf8');

// ---- 抠出注入的 useEffect 体 ----
const i = te.indexOf('s.useEffect(()=>{window.__RH_MOD__={');
if (i < 0) { console.error('未找到注入的桥接'); process.exit(1); }
const braceStart = te.indexOf('{', i);
let depth = 0, end = braceStart;
for (; end < te.length; end++) { if (te[end] === '{') depth++; else if (te[end] === '}') { depth--; if (depth === 0) break; } }
const effectBody = te.slice(braceStart + 1, end);   // 去掉外层 {}，得到 window.__RH_MOD__={...} 及后续

// ---- 解析新版游戏变量名（与 rh_resolve 一致）----
const reactName = (te.match(/([A-Za-z_$][\w$]*)\.useState\(/) || [])[1];
const nodeId = (te.match(/nodeId:([A-Za-z_$][\w$]*),metaSave:/) || [])[1];
const metaSave = (te.match(/metaSave:([A-Za-z_$][\w$]*),p2Data:/) || [])[1];
// phase 状态：[A,SET]=react.useState(()=>factory(nodeId,p2Data.towerExploration)) -> A 即 phase
const phaseName = (() => {
  const re = new RegExp('\\[([A-Za-z_$][\\w$]*),([A-Za-z_$][\\w$]*)\\]=' + reactName +
                        '\\.useState\\(\\(\\)=>([A-Za-z_$][\\w$]*)\\(' + nodeId + ',[A-Za-z_$][\\w$]*\\.towerExploration\\)\\)', 'g');
  const mm = re.exec(te);
  return mm ? mm[1] : null;
})();
const setMetaSave = (te.match(/onUpdateMetaSave:([A-Za-z_$][\w$]*)/) || [])[1];
// 区域配置函数 + endFloor 表（用 mock 造 3 个区域，endFloor 分别 30/70/100）
// 性能：全文 3.3MB，用 split 计数会退化成 O(n²)。改为一次性扫描 + Map 计数。
const regionCfgName = (() => {
  const NAME = /[A-Za-z_$][\w$]*/g;
  // 统计形如 `obj.prop` 的 prop 出现次数（obj.prop 会被压成 obj.prop 两次 token）
  const propCount = new Map();
  for (const m of te.matchAll(/([A-Za-z_$][\w$]*)\.(chapterIndex|chapterName|endFloor|difficultyLabel)\b/g)) {
    const k = m[1] + '\u0000' + m[2];
    propCount.set(k, (propCount.get(k) || 0) + 1);
  }
  const perObj = new Map();
  for (const [k, v] of propCount) {
    const obj = k.split('\u0000')[0];
    perObj.set(obj, (perObj.get(obj) || 0) + v);
  }
  const pairs = new Map();
  for (const m of te.matchAll(/([A-Za-z_$][\w$]*)=([A-Za-z_$][\w$]*)\(([A-Za-z_$][\w$]*)\)/g)) {
    const obj = m[1], fn = m[2];
    const sc = perObj.get(obj) || 0;
    if (sc <= 0) continue;
    pairs.set(fn, (pairs.get(fn) || 0) + sc);
  }
  const top = [...pairs.entries()].sort((a, b) => b[1] - a[1])[0];
  return top ? top[0] : null;
})();
console.log('解析: react=' + reactName + ' nodeId=' + nodeId + ' metaSave=' + metaSave +
            ' setMetaSave=' + setMetaSave + ' regionCfg=' + regionCfgName + ' phase=' + phaseName);

// ---- mock 游戏环境 ----
const REGIONS = {
  n_alpha: { chapterIndex: 1, chapterName: '前哨', startFloor: 1, endFloor: 30 },
  n_bravo: { chapterIndex: 2, chapterName: '腹地', startFloor: 1, endFloor: 70 },
  n_delta: { chapterIndex: 3, chapterName: '核心', startFloor: 1, endFloor: 100 },
};
let enterCalls = [];      // 记录 enterFloor 被调用的参数
let setMetaCalls = [];    // 记录 setMetaSave 被调用的参数

const sandbox = {
  window: {},
  console: { log: () => {}, warn: () => {}, error: (m, e) => { sandbox.__lastErr = String(m); } },
  Math: Math, Number: Number, JSON: JSON, Object: Object, Array: Array, String: String, isFinite: isFinite,
};
sandbox.globalThis = sandbox;

// 模拟 React.useEffect：立即执行回调
sandbox[reactName] = { useEffect: (fn) => { fn(); } };
// 模拟游戏状态对象（对应 phase 变量名）
sandbox[nodeId] = 'n_bravo';
sandbox[metaSave] = { rhMod: { legacyFlag: 'keep-me' }, someOther: 1 };
sandbox[setMetaSave] = (v) => { setMetaCalls.push(JSON.parse(JSON.stringify(v))); };
sandbox[regionCfgName] = (id) => REGIONS[id] || null;
// 模拟进入楼层回调 enterFloor
sandbox.__enterFloor = null;   // 由运行时代码从闭包取不到，这里通过改写注入点补上

// 注入代码里用的是 ctx.enterFloor 的真实名；rh_resolve 解析为 noticeMissingLocatorTitle 前的 useCallback
// 重新解析（注意：正则必须带 g，否则 exec 每次都从开头返回同一个匹配，last[1] 拿到错误变量）
const nmi = te.indexOf('noticeMissingLocatorTitle');
const cbRe = new RegExp('([A-Za-z_$][\\w$]*)=' + reactName + '\\.useCallback\\(', 'g');
const seg = te.slice(Math.max(0, nmi - 8000), nmi);
let last = null, m;
while ((m = cbRe.exec(seg))) last = m;
if (!last) { console.error('enterFloor 变量名解析失败'); process.exit(1); }
const enterName = last[1];
console.log('enterFloor 变量名 =', enterName);
sandbox[enterName] = (floor) => { enterCalls.push(floor); };
const victoryName = (() => {
  const ei = te.indexOf('enemy.exp??0');
  if (ei < 0) return null;
  const re = new RegExp('([A-Za-z_$][\\w$]*)=' + reactName + '\\.useCallback\\(', 'g');
  const seg2 = te.slice(Math.max(0, ei - 8000), ei);
  let last2 = null, mm2;
  while ((mm2 = re.exec(seg2))) last2 = mm2;
  return last2 ? last2[1] : null;
})();
const setPhaseName = (() => {
  const re = new RegExp('\\[([A-Za-z_$][\\w$]*),([A-Za-z_$][\\w$]*)\\]=' + reactName +
                        '\\.useState\\(\\(\\)=>[A-Za-z_$][\\w$]*\\(' + nodeId + ',', 'g');
  const mm = re.exec(te);
  return mm ? mm[2] : null;
})();
console.log('combatVictory=' + victoryName + '  setPhase=' + setPhaseName);
let victoryCalls = 0, setPhaseCalls = [];
sandbox[victoryName] = () => { victoryCalls++; };
sandbox[setPhaseName] = (v) => { setPhaseCalls.push(v); };


// ---- 补全游戏运行时对象（真实游戏里由组件提供，这里造等价最小实现）----
const phaseState = {
  activeNodeId: null,            // null -> 桥接应回退到 nodeId prop
  currentFloor: 12,
  clearedFloorThisRun: 5,
  battleReportState: null,
  lootBoxState: null,
  combatState: { enemy: { hp: 10, maxHp: 100, exp: 5 } },
  bossFirstKillRewardState: null,
  towerChapterProgress: { n_bravo: { bestLocalFloor: 25 } },
};
sandbox[phaseName] = phaseState;
// instantWin 依赖的自动秒杀开关读写
sandbox.__RH_MOD_AUTOWIN__ = false;


// ---- 真正执行注入的代码 ----
// 注入体还引用了 setAutoWin 回调（on）与 metaSave（r），一并 mock。
// 做法：把 effectBody 里出现的所有自由标识符收集出来，逐个作为形参注入 undefined/mocks，
//      避免 ReferenceError（压缩代码里变量名极多，逐个列举不现实）。
const usedNames = (() => {
  const set = new Set();
  // 去掉字符串字面量与属性访问右侧，避免把 'chapterIndex' 之类当成变量
  const stripped = effectBody.replace(/'(?:[^'\\]|\\.)*'/g, "''").replace(/"(?:[^"\\]|\\.)*"/g, '""');
  for (const m of stripped.matchAll(/(^|[^.\w$])([A-Za-z_$][\w$]*)/g)) set.add(m[2]);
  return set;
})();

const RESERVED = new Set(['console', 'Math', 'Number', 'JSON', 'Object', 'Array', 'String',
  'isFinite', 'parseInt', 'parseFloat', 'Boolean', 'Error', 'Date', 'undefined', 'NaN', 'Infinity',
  'return', 'try', 'catch', 'if', 'else', 'var', 'const', 'let', 'function', 'null', 'true', 'false',
  'new', 'typeof', 'this', 'throw', 'do', 'while', 'for', 'switch', 'case', 'break', 'continue']);

const args = [];
const paramNames = [];
for (const name of usedNames) {
  if (RESERVED.has(name)) continue;
  paramNames.push(name);
  if (Object.prototype.hasOwnProperty.call(sandbox, name)) args.push(sandbox[name]);
  else args.push(undefined);
}
console.log('[注入形参] ' + paramNames.length + ' 个自由标识符');

let runner;
try {
  runner = new Function(paramNames.join(','), effectBody);
} catch (e) {
  console.error('\n[编译异常]', e.message);
  process.exit(1);
}
try {
  runner.apply(null, args);
} catch (e) {
  console.error('\n[执行异常]', e && e.message);
  process.exit(1);
}

const M = sandbox.window.__RH_MOD__;
console.log('\n=== 桥接对象已建立:', typeof M);
const methods = ['jumpToTopFloor', 'unlockAllFloors', 'unlockToFloor', 'restoreFloors', 'restoreProgressFloor', 'instantWin', 'forceExit'];
let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { pass++; console.log('  [通过] ' + name + (extra ? '  ' + extra : '')); }
  else { fail++; console.log('  [失败] ' + name + (extra ? '  ' + extra : '')); }
}

console.log('\n=== 1. 方法齐备性 ===');
for (const k of methods) check(k, typeof M[k] === 'function', 'type=' + typeof M[k]);

console.log('\n=== 2. jumpToTopFloor（跳顶楼）===');
enterCalls = [];
M.jumpToTopFloor();
check('调用了 enterFloor', enterCalls.length === 1, 'args=' + JSON.stringify(enterCalls));
check('进入区域顶楼 70', enterCalls[0] === 70, 'got=' + enterCalls[0]);

console.log('\n=== 3. unlockAllFloors ===');
setMetaCalls = [];
M.unlockAllFloors();
check('窗口标志 __RH_UNLOCK_ALL__=true', sandbox.window.__RH_UNLOCK_ALL__ === true);
check('写入 setMetaSave', setMetaCalls.length === 1);
const u = setMetaCalls[0] || {};
check('rhMod.towerAllFloorsUnlocked=true', u.rhMod && u.rhMod.towerAllFloorsUnlocked === true);
check('rhMod.unlockToFloor=0', u.rhMod && u.rhMod.unlockToFloor === 0);
check('保留原有 rhMod 字段', u.rhMod && u.rhMod.legacyFlag === 'keep-me', JSON.stringify(u.rhMod));
check('保留 metaSave 其他字段', u.someOther === 1);

console.log('\n=== 4. unlockToFloor(45) ===');
setMetaCalls = [];
M.unlockToFloor(45);
check('__RH_UNLOCK_ALL__=false', sandbox.window.__RH_UNLOCK_ALL__ === false);
check('__RH_UNLOCK_TO__=45', sandbox.window.__RH_UNLOCK_TO__ === 45);
check('rhMod.unlockToFloor=45', setMetaCalls[0] && setMetaCalls[0].rhMod.unlockToFloor === 45);
check('rhMod.towerAllFloorsUnlocked=false', setMetaCalls[0] && setMetaCalls[0].rhMod.towerAllFloorsUnlocked === false);

console.log('\n=== 5. unlockToFloor 非法输入归一 ===');
setMetaCalls = [];
M.unlockToFloor('abc');
check('非数字→归一为 1', setMetaCalls[0] && setMetaCalls[0].rhMod.unlockToFloor === 1, 'got=' + (setMetaCalls[0] && setMetaCalls[0].rhMod.unlockToFloor));
M.unlockToFloor(0);
check('0→归一为 1', setMetaCalls[1] && setMetaCalls[1].rhMod.unlockToFloor === 1, 'got=' + (setMetaCalls[1] && setMetaCalls[1].rhMod.unlockToFloor));
M.unlockToFloor(30.7);
check('30.7→向下取整 30', setMetaCalls[2] && setMetaCalls[2].rhMod.unlockToFloor === 30, 'got=' + (setMetaCalls[2] && setMetaCalls[2].rhMod.unlockToFloor));

console.log('\n=== 6. restoreFloors（仅还原MOD解锁）===');
setMetaCalls = [];
M.restoreFloors();
check('__RH_UNLOCK_ALL__=false', sandbox.window.__RH_UNLOCK_ALL__ === false);
check('__RH_UNLOCK_TO__=0', sandbox.window.__RH_UNLOCK_TO__ === 0);
check('rhMod 两标志归零', setMetaCalls[0] && setMetaCalls[0].rhMod.towerAllFloorsUnlocked === false && setMetaCalls[0].rhMod.unlockToFloor === 0);

console.log('\n=== 7. jumpToTopFloor 未知区域容错 ===');
const savedRegions = { ...REGIONS };
for (const k of Object.keys(REGIONS)) delete REGIONS[k];
enterCalls = [];
let threw2 = null;
try { M.jumpToTopFloor(); } catch (e) { threw2 = e.message; }
check('未知区域不抛异常', threw2 === null, threw2 || '');
check('未知区域不调 enterFloor', enterCalls.length === 0);
Object.assign(REGIONS, savedRegions);

console.log('\n=== 8. instantWin / forceExit 存在且可调用 ===');
let threw = null;
try { M.instantWin(); } catch (e) { threw = e.message; }
check('instantWin 调用不抛异常', threw === null, threw || '');
threw = null;
try { M.forceExit(); } catch (e) { threw = e.message; }
check('forceExit 调用不抛异常', threw === null, threw || '');
// instantWin = 一次性秒杀（走战斗结算回调 Bo）；BOSS 战应直接 return 不触发
let vcBefore = victoryCalls;
M.instantWin();
check('instantWin 触发战斗结算回调', victoryCalls === vcBefore + 1, 'Bo 调用 ' + (victoryCalls - vcBefore) + ' 次');
phaseState.combatState = { encounterType: 'boss', enemy: { hp: 999, maxHp: 999, exp: 0 } };
vcBefore = victoryCalls;
M.instantWin();
check('BOSS 战 instantWin 不触发结算', victoryCalls === vcBefore);
phaseState.combatState = { encounterType: 'normal', enemy: { hp: 5, maxHp: 100, exp: 3 }, playerHp: 40, playerMaxHp: 80 };
// setAutoWin / getAutoWin 开关
M.setAutoWin(true);
check('setAutoWin(true) 置位 rhMod.autoWin', setMetaCalls.length > 0 && setMetaCalls[setMetaCalls.length - 1].rhMod.autoWin === true);
check('setAutoWin(true) 置位窗口标志', sandbox.window.__RH_MOD_AUTOWIN__ === true);
check('getAutoWin 读回 true', M.getAutoWin() === true);
M.setAutoWin(false);
check('setAutoWin(false) 读回 false', M.getAutoWin() === false);
// forceExit 应切到 evacuation 阶段
setPhaseCalls = [];
M.forceExit();
check('forceExit 切阶段到 evacuation', setPhaseCalls.length === 1 && setPhaseCalls[0] && setPhaseCalls[0].phase === 'evacuated'.replace('evacuated', 'evacuation'),
      'phase=' + (setPhaseCalls[0] && setPhaseCalls[0].phase));

console.log('\n=== 9. restoreProgressFloor 存在性 ===');
check('restoreProgressFloor 是函数', typeof M.restoreProgressFloor === 'function');

console.log('\n结果：通过 ' + pass + ' 项，失败 ' + fail + ' 项');
process.exit(fail ? 1 : 0);
