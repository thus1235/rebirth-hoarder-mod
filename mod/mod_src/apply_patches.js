// apply_patches.js - TowerExploration 基础补丁（v3.21 语义自适应版）
//   P1: 移除"楼层跳转需要定位器道具"限制
//   P2: 移除 bestLocalFloor 100 层上限
//   P3a/P3b: 进图默认选中"最高已解锁楼层"（canSelectStartFloor 开启时）
//   P4: 战报确认回调 —— 仅作标记校验（v3.20 起保持游戏原版三选一行为）
// 所有锚点均为"语义骨架 + 正则捕获压缩变量名"，随游戏更新自适应。
// 双模式：模块导出 patch({src,ctx,log})；CLI: node apply_patches.js <TE.js>
'use strict';
const fs = require('fs');
const path = require('path');
const { PatchError, expectOne, escRe } = require('./rh_resolve.js');

const PATCH = '基础补丁';

function patch({ src, ctx, log }) {
  log = log || (() => {});
  let s = src;

  // ---- P1: 定位器限制 → 恒为 false ----
  {
    // 形如 `g=!xt&&!a.isActive&&c>1&&!ir.includes(c)`，调试标志须与 ctx.debugFlag 一致（交叉验证）
    const re = new RegExp(
      '([A-Za-z_$][\\w$]*)=!(?<dbg>[A-Za-z_$][\\w$]*)&&!(?<st>[A-Za-z_$][\\w$]*)\\.isActive&&(?<n>[A-Za-z_$][\\w$]*)>1&&!(?<lst>[A-Za-z_$][\\w$]*)\\.includes\\(\\k<n>\\)', 'g');
    const hits = [...s.matchAll(re)];
    const good = hits.filter(m => !ctx || m.groups.dbg === ctx.debugFlag);
    if (hits.length === 0) {
      throw new PatchError(PATCH, 'P1 定位器限制', '未找到 `X=!dbg&&!a.isActive&&n>1&&!lst.includes(n)` 形态',
        [{ desc: '宽松搜索 isActive…includes', re: /![A-Za-z_$][\w$]*&&![A-Za-z_$][\w$]*\.isActive&&[A-Za-z_$][\w$]*>1/g, src: s }]);
    }
    if (good.length !== 1) {
      throw new PatchError(PATCH, 'P1 定位器限制', `命中 ${hits.length} 处但与调试标志(${ctx && ctx.debugFlag})一致的只有 ${good.length} 处`, []);
    }
    const m = good[0];
    s = s.slice(0, m.index) + `${m[1]}=0` + s.slice(m.index + m[0].length);
    log(`P1 定位器限制 OK (${m[1]}=0)`);
  }

  // ---- P2: bestLocalFloor 100 层上限 ----
  {
    const re = /Math\.max\(0,Math\.min\(100,([A-Za-z_$][\w$]*\?\.bestLocalFloor\?\?0)\)\)/g;
    const m = expectOne(s, re, PATCH, 'P2 100层上限');
    s = s.slice(0, m.index) + `Math.max(0,${m[1]})` + s.slice(m.index + m[0].length);
    log(`P2 100层上限 OK`);
  }

  // ---- P3a/P3b: 楼层地图组件 Ms 内部"进图默认选中最高已解锁楼层" ----
  {
    // 锚点：Ms 组件的箭头函数解构（props 值全为简单标识符；JSX 调用点因
    // nodeId:<表达式> 等复杂值不会误匹配；lazy 间隔兼容未来 props 顺序变化）
    const dm = expectOne(s,
      /\(\{nodeId:([A-Za-z_$][\w$]*),[^{}]*?currentFloor:([A-Za-z_$][\w$]*),[^{}]*?historyBestLocalFloor:([A-Za-z_$][\w$]*),[^{}]*?canSelectStartFloor:([A-Za-z_$][\w$]*),[^{}]*?\}\)=>/,
      PATCH, 'P3 楼层地图组件解构');
    const NODEID = dm[1], CURF = dm[2], HBF = dm[3], CANSEL = dm[4];
    const react = ctx ? ctx.react : [...s.matchAll(/([A-Za-z_$][\w$]*)\.useState\(/g)][0][1];

    // P3a: [ce,O]=REACT.useState(()=>Math.max(G.startFloor,Math.min(a,CURF)))
    const reA = new RegExp(
      '\\[([A-Za-z_$][\\w$]*),([A-Za-z_$][\\w$]*)\\]=' + escRe(react) +
      '\\.useState\\(\\(\\)=>Math\\.max\\(([A-Za-z_$][\\w$]*)\\.startFloor,Math\\.min\\(([A-Za-z_$][\\w$]*),' + escRe(CURF) + '\\)\\)\\)', 'g');
    const hitsA = [...s.matchAll(reA)].filter(m => m.index > dm.index);
    if (hitsA.length === 0) {
      throw new PatchError(PATCH, 'P3a 进图默认楼层 useState',
        `组件解构(@${dm.index})之后未找到 useState(()=>Math.max(X.startFloor,Math.min(Y,${CURF}))) 形态`, []);
    }
    if (hitsA.length > 1) {
      throw new PatchError(PATCH, 'P3a 进图默认楼层 useState', `命中 ${hitsA.length} 处，无法唯一确定`, []);
    }
    const mA = hitsA[0];
    const [ , ST, SETF, MAPCFG, MAXF ] = mA;
    const repA = `[${ST},${SETF}]=${react}.useState(()=>Math.max(${MAPCFG}.startFloor,Math.min(${MAXF},${CANSEL}?Math.max(${CURF},${HBF}):${CURF})))`;
    s = s.slice(0, mA.index) + repA + s.slice(mA.index + mA[0].length);
    log(`P3a 进图默认楼层 OK (${CANSEL}?max(${CURF},${HBF}):${CURF})`);

    // P3b: 同步 useEffect（沿用 P3a 解析出的 MAPCFG/MAXF 交叉验证）
    const reB = new RegExp(
      escRe(react) + '\\.useEffect\\(\\(\\)=>\\{const ([A-Za-z_$][\\w$]*)=Math\\.max\\(' + escRe(MAPCFG) +
      '\\.startFloor,Math\\.min\\(' + escRe(MAXF) + ',' + escRe(CURF) + '\\)\\);' + escRe(SETF) + '\\(\\1\\),([A-Za-z_$][\\w$]*)\\(String\\(\\1\\)\\)\\},\\[' +
      escRe(MAPCFG) + '\\.startFloor,' + escRe(CURF) + ',' + escRe(NODEID) + ',' + escRe(MAXF) + '\\]\\)');
    const mB = expectOne(s, reB, PATCH, 'P3b 楼层同步 useEffect');
    const repB = `${react}.useEffect(()=>{const ${mB[1]}=Math.max(${MAPCFG}.startFloor,Math.min(${MAXF},${CANSEL}?Math.max(${CURF},${HBF}):${CURF}));${SETF}(${mB[1]}),${mB[2]}(String(${mB[1]}))},[${MAPCFG}.startFloor,${CURF},${NODEID},${MAXF},${HBF},${CANSEL}])`;
    s = s.slice(0, mB.index) + repB + s.slice(mB.index + mB[0].length);
    log(`P3b 楼层同步 useEffect OK (deps +${HBF},${CANSEL})`);
  }

  // ---- P4: 战报确认回调标记校验（不修改；缺失仅告警） ----
  if (!s.includes('battleReportState:null,phase:"loot_box"')) {
    if (ctx) ctx.warnings = ctx.warnings || [];
    (ctx ? ctx.warnings : []).push('P4: 战报确认回调形态变化（未找到 battleReportState:null,phase:"loot_box"），战利品三选一流程可能已重构');
    log('P4 战报回调标记未命中（仅告警，继续）');
  } else {
    log('P4 战报回调标记 OK（保持原版三选一）');
  }

  return s;
}

module.exports = { patch };

// ---------- CLI 兼容模式 ----------
if (require.main === module) {
  const file = process.argv[2];
  if (!file) { console.error('用法: node apply_patches.js <TowerExploration-*.js>'); process.exit(1); }
  let src = fs.readFileSync(file, 'utf8');
  const ctx = {};
  try {
    // CLI 模式自行解析最小 ctx（debugFlag/react）
    const dbg = /([A-Za-z_$][\w$]*)=!!([A-Za-z_$][\w$]*)\.debugTowerFullFloorJump/.exec(src);
    ctx.debugFlag = dbg && dbg[1];
    ctx.react = ([...src.matchAll(/([A-Za-z_$][\w$]*)\.useState\(/g)][0] || [])[1];
    src = patch({ src, ctx, log: m => console.log('[' + PATCH + '] ' + m) });
    fs.writeFileSync(file, src, 'utf8');
    console.log(`[${PATCH}] 写入完成: ${file}`);
  } catch (e) {
    console.error(String(e.message || e));
    process.exit(1);
  }
}
