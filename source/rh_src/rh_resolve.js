// rh_resolve.js - 语义锚点解析：从压缩后的游戏代码里反查变量名（v3.21 自动适配核心）
// 原理：字符串字面量/对象字段名/prop 名不会被压缩改名，用它们定位代码位置，
//       再用正则捕获邻近的压缩标识符。任何一步失败都抛 PatchError（带诊断信息）。
'use strict';

class PatchError extends Error {
  // patch: 补丁名; anchor: 锚点说明; detail: 具体原因; fuzzy: [{desc, re, src}] 宽松搜索建议
  constructor(patch, anchor, detail, fuzzy) {
    super(`[${patch}] ${anchor}: ${detail}`);
    this.patch = patch; this.anchor = anchor; this.detail = detail; this.fuzzy = fuzzy || [];
  }
}

// ---------- 基础工具 ----------
// 标识符 → 正则字面量转义（压缩名可能含 $）
function escRe(id) { return id.replace(/[$()*+.?[\\\]^{|}]/g, '\\$&'); }
function countOf(src, re) {
  const r = new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g');
  let n = 0; while (r.exec(src)) n++;
  return n;
}
function expectOne(src, re, patch, anchor) {
  const g = new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g');
  const hits = [...src.matchAll(g)];
  if (hits.length !== 1) {
    throw new PatchError(patch, anchor, `匹配 ${hits.length} 处，期望 1 处`, [{ desc: anchor, re, src }]);
  }
  return hits[0];
}
// 在 from 之前向后找最近的 `X=REACT.useCallback(`，返回回调变量名
function findCallbackBefore(src, pos, react, patch, anchor) {
  const seg = src.slice(Math.max(0, pos - 8000), pos);
  const re = new RegExp('([A-Za-z_$][\\w$]*)=' + escRe(react) + '\\.useCallback\\(', 'g');
  let m, last = null;
  while ((m = re.exec(seg))) last = m;
  if (!last) throw new PatchError(patch, anchor, '前方 8000 字符内未找到 useCallback 定义', []);
  return last[1];
}
function modeOf(src, re, group) {
  const counts = {};
  for (const m of src.matchAll(re)) {
    const k = m[group];
    if (k) counts[k] = (counts[k] || 0) + 1;
  }
  let best = null, bestN = 0;
  for (const k of Object.keys(counts)) if (counts[k] > bestN) { best = k; bestN = counts[k]; }
  return { name: best, count: bestN, dist: counts };
}

// ---------- TE(TowerExploration) 全量上下文解析 ----------
function resolveCtx(te) {
  const ctx = { file: 'TowerExploration' };
  const P = 'ctx';

  // React 导入名：`X.useState(` 的最高频标识符（须显著占优）
  const react = modeOf(te, /([A-Za-z_$][\w$]*)\.useState\(/g, 1);
  if (!react.name || react.count < 3) throw new PatchError(P, 'React 导入名', '未找到稳定的 .useState( 调用', []);
  ctx.react = react.name;

  // JSX 运行时导入：`X.jsxs(` 的最高频标识符（与 React 导入名不同，如 e.jsx/e.jsxs）
  const jsx = modeOf(te, /([A-Za-z_$][\w$]*)\.jsxs\(/g, 1);
  if (!jsx.name || jsx.count < 3) throw new PatchError(P, 'JSX 运行时', '未找到稳定的 .jsxs( 调用', []);
  ctx.jsx = jsx.name;

  // 主组件 props：nodeId / metaSave / p2Data（语义 prop 名相邻出现）
  const pm = expectOne(te, /nodeId:([A-Za-z_$][\w$]*),metaSave:([A-Za-z_$][\w$]*),p2Data:([A-Za-z_$][\w$]*),/, P, '主组件 props (nodeId/metaSave/p2Data)');
  ctx.nodeId = pm[1]; ctx.metaSave = pm[2]; ctx.p2Data = pm[3];

  // setMetaSave：与 metaSave prop 同一解构里的 onUpdateMetaSave
  {
    const re = new RegExp('onUpdateMetaSave:([A-Za-z_$][\\w$]*)', 'g');
    let m, first = null;
    while ((m = re.exec(te))) { if (!first) first = m[1]; }
    if (!first) throw new PatchError(P, 'onUpdateMetaSave', '未找到', []);
    ctx.setMetaSave = first;
  }

  // 阶段状态：[a,setter]=REACT.useState(()=>factory(nodeId,p2Data.towerExploration))
  const ps = expectOne(te, new RegExp(
    '\\[([A-Za-z_$][\\w$]*),([A-Za-z_$][\\w$]*)\\]=' + ctx.react + '\\.useState\\(\\(\\)=>([A-Za-z_$][\\w$]*)\\(' +
    ctx.nodeId + ',' + ctx.p2Data + '\\.towerExploration\\)\\)'), P, '阶段状态 useState (towerExploration)');
  ctx.phase = ps[1]; ctx.setPhase = ps[2]; ctx.phaseFactory = ps[3];

  // 进入楼层回调：noticeMissingLocatorTitle 所在的 useCallback
  const nmi = te.indexOf('noticeMissingLocatorTitle');
  if (nmi < 0) throw new PatchError(P, 'noticeMissingLocatorTitle', '语义串不存在', []);
  ctx.enterFloor = findCallbackBefore(te, nmi, ctx.react, P, '进入楼层回调');

  // 战斗结算回调：enemy.exp??0 所在的 useCallback
  const ei = te.indexOf('enemy.exp??0');
  if (ei < 0) throw new PatchError(P, 'enemy.exp??0', '语义串不存在', []);
  ctx.combatVictory = findCallbackBefore(te, ei, ctx.react, P, '战斗结算回调');
  {
    const seg = te.slice(Math.max(0, ei - 8000), ei);
    if (!seg.includes('combatState')) throw new PatchError(P, '战斗结算回调', '附近未见 combatState，疑似定位错误', []);
  }

  // 区域配置函数：`X(x).chapterIndex` 最高频标识符（即 index.js 的 az 导入别名）
  const rc = modeOf(te, /([A-Za-z_$][\w$]*)\([A-Za-z_$][\w$]*\)\.chapterIndex/g, 1);
  if (!rc.name || rc.count < 2) throw new PatchError(P, '区域配置函数(chapterIndex)', '高频解析失败', []);
  ctx.regionCfg = rc.name;

  // 调试标志：X=!!p2Data.debugTowerFullFloorJump
  const dbg = expectOne(te, new RegExp('([A-Za-z_$][\\w$]*)=!!(' + escRe(ctx.p2Data) + ')\\.debugTowerFullFloorJump'), P, '调试标志 debugTowerFullFloorJump');
  ctx.debugFlag = dbg[1];

  return ctx;
}

module.exports = { PatchError, countOf, expectOne, findCallbackBefore, modeOf, resolveCtx, escRe };
