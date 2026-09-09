// apply_patch5.js - 注入 F8 桥接(window.__RH_MOD__) + 防御性Wa（v3.21 语义自适应版）
// 桥接能力：jumpToTopFloor / unlockAllFloors / unlockToFloor / restoreFloors /
//           restoreProgressFloor / instantWin / forceExit（面板按键经 index.js 面板调用）
// 所有组件变量名由 rh_resolve.resolveCtx 从语义锚点解析，桥接文本按解析结果拼装。
// 语义锚点：rh-tower-exploration-root（注入点）/ chapter_cleared":"evacuated（Wa）
// 双模式：模块导出 patch({src,ctx,log})；CLI: node apply_patch5.js <TE.js>
'use strict';
const fs = require('fs');
const { PatchError, expectOne, escRe } = require('./rh_resolve.js');

const PATCH = 'F8桥接';

function buildBridge(c) {
  const { react: R, phase: A, nodeId: T, cfg: CFG, enter: ENTER, setMeta: SETMETA, meta: META, victory: VICTORY, setPhase: SETPHASE } = c;
  return R + '.useEffect(()=>{window.__RH_MOD__={' +
    'jumpToTopFloor:()=>{try{var node=' + A + '.activeNodeId??' + T + ',rg=' + CFG + '(node);if(!rg||!Number.isFinite(rg.endFloor)){console.warn("[MOD]jump:no-region",node);return}' + ENTER + '(rg.endFloor)}catch(e){console.error("[MOD]jumpTop",e)}},' +
    'unlockAllFloors:()=>{try{window.__RH_UNLOCK_ALL__=!0;window.__RH_UNLOCK_TO__=0;' + SETMETA + '({...' + META + ',rhMod:{...(' + META + '.rhMod||{}),towerAllFloorsUnlocked:!0,unlockToFloor:0}})}catch(e){console.error("[MOD]unlockAll",e)}},' +
    'unlockToFloor:n=>{try{var fn=Math.max(1,Math.floor(Number(n)||0));window.__RH_UNLOCK_ALL__=!1;window.__RH_UNLOCK_TO__=fn;' + SETMETA + '({...' + META + ',rhMod:{...(' + META + '.rhMod||{}),towerAllFloorsUnlocked:!1,unlockToFloor:fn}})}catch(e){console.error("[MOD]unlockTo",e)}},' +
    'restoreFloors:()=>{try{window.__RH_UNLOCK_ALL__=!1;window.__RH_UNLOCK_TO__=0;' + SETMETA + '({...' + META + ',rhMod:{...(' + META + '.rhMod||{}),towerAllFloorsUnlocked:!1,unlockToFloor:0}})}catch(e){console.error("[MOD]restore",e)}},' +
    'restoreProgressFloor:n=>{try{var node=' + T + '||' + A + '.activeNodeId,tg=Math.max(0,Math.floor(Number(n)||0));window.__RH_UNLOCK_ALL__=!1;window.__RH_UNLOCK_TO__=0;try{' + SETMETA + '({...' + META + ',rhMod:{...(' + META + '.rhMod||{}),towerAllFloorsUnlocked:!1,unlockToFloor:0}})}catch(e0){}var S=window.__RH_UE__;if(typeof S!=="function"){window.__RH_RESTORE_RESULT__={node:node,err:"全局状态接口未就绪，请先进游戏界面再试"};return}S(function(prev){try{if(!prev||!prev.p2){window.__RH_RESTORE_RESULT__={node:node,err:"无p2状态（需在第二阶段游戏中）"};return prev}var ex=prev.p2.exploration||{},tcp=Object.assign({},ex.towerChapterProgress||{}),cur=tcp[node]||{},old=Math.max(0,Math.floor(Number(cur.bestLocalFloor)||0)),nn=Math.min(old,tg);if(nn===old){window.__RH_RESTORE_RESULT__={node:node,old:old,set:nn,changed:!1};return prev}var oa=Math.max(0,Math.floor(Number(cur.bestAbsoluteFloor)||0));tcp[node]=Object.assign({},cur,{bestLocalFloor:nn,bestAbsoluteFloor:Math.max(0,oa-(old-nn))});window.__RH_RESTORE_RESULT__={node:node,old:old,set:nn,changed:!0};return Object.assign({},prev,{p2:Object.assign({},prev.p2,{exploration:Object.assign({},ex,{towerChapterProgress:tcp})})})}catch(e2){window.__RH_RESTORE_RESULT__={node:node,err:String(e2)};return prev}})}catch(e){console.error("[MOD]restoreProgress",e)}},' +
    'instantWin:()=>{var c=' + A + '.combatState;if(!c||c.encounterType==="boss")return;' + VICTORY + '({...c,victory:!0,playerHp:c.playerMaxHp||c.playerHp,round:1,rounds:1,combatLog:[]})},' +
    'forceExit:()=>{' + SETPHASE + '({...' + A + ',phase:"evacuation"})}};return()=>{window.__RH_MOD__=null}},[' + ENTER + ',' + SETPHASE + ',' + SETMETA + ',' + META + ',' + A + ',' + VICTORY + ',' + CFG + ',' + T + ']);';
}

function patch({ src, ctx, log }) {
  log = log || (() => {});
  if (!ctx || !ctx.react) throw new PatchError(PATCH, '上下文', '需要 rh_resolve 解析的 ctx', []);
  const { react, jsx, phase, nodeId, metaSave, setMetaSave, enterFloor, combatVictory, regionCfg } = ctx;

  // 已应用检测（幂等）
  if (src.includes('window.__RH_MOD__={')) { log('桥接已存在，跳过'); return src; }

  // ---- P1: 注入桥接（return JSX 前） ----
  const anchorRe = new RegExp('return ' + escRe(jsx || react) + '\\.jsxs\\("div",\\{className:"rh-tower-exploration-root');
  const m = expectOne(src, anchorRe, PATCH, '桥接注入点 rh-tower-exploration-root');
  const bridge = buildBridge({
    react, phase, nodeId, cfg: regionCfg, enter: enterFloor,
    setMeta: setMetaSave, meta: metaSave, victory: combatVictory, setPhase: ctx.setPhase,
  });
  src = src.slice(0, m.index) + bridge + src.slice(m.index);
  log(`桥接注入 OK (enter=${enterFloor} victory=${combatVictory} cfg=${regionCfg} setMeta=${setMetaSave})`);

  // ---- P2: 防御性Wa —— 已废弃（Wa 保持游戏原版"战报确认进三选一"），跳过 ----

  // ---- P3: 防御性 Wa（撤离结算防 undefined 崩溃） ----
  // 形态: Wa=s.useCallback(n=>{const c=xa(a)&&a.clearedFloorThisRun>=Ae.floor?"chapter_cleared":"evacuated";Ue(so(a,c,n))},[Ue,Ae.floor,a])
  const reW = new RegExp(
    '([A-Za-z_$][\\w$]*)=' + escRe(react) + '\\.useCallback\\(([A-Za-z_$][\\w$]*)=>\\{const ([A-Za-z_$][\\w$]*)=([A-Za-z_$][\\w$]*)\\(' +
    escRe(phase) + '\\)&&' + escRe(phase) + '\\.clearedFloorThisRun>=([A-Za-z_$][\\w$]*)\\.floor\\?"chapter_cleared":"evacuated";' +
    '([A-Za-z_$][\\w$]*)\\(([A-Za-z_$][\\w$]*)\\(' + escRe(phase) + ',\\3,\\2\\)\\)\\},\\[([^\\]]+)\\]\\)');
  const w = expectOne(src, reW, PATCH, '撤离结算 Wa');
  const [ , wName, wParam, wLocal, wPred, wFloor, wFinish, wSo, wDeps] = w;
  const wTo = `${wName}=${react}.useCallback(${wParam}=>{try{const ${wLocal}=${wPred}(${phase})&&${phase}.clearedFloorThisRun>=${wFloor}.floor?"chapter_cleared":"evacuated";${wFinish}(${wSo}(${phase},${wLocal},${wParam}))}catch(e){console.error("[MOD]Da",e);${wFinish}(${wSo}(${phase},"evacuated",[],{consumeActionHours:!1,threatGain:0}))}},[${wFinish},${wSo},${wFloor}.floor,${phase}])`;
  src = src.slice(0, w.index) + wTo + src.slice(w.index + w[0].length);
  log(`防御性Wa OK (${wName}, finish=${wFinish} so=${wSo})`);

  ctx.bridge = bridge; // 供 patch6 复用
  return src;
}

module.exports = { patch };

// ---------- CLI 兼容模式 ----------
if (require.main === module) {
  const file = process.argv[2];
  if (!file) { console.error('用法: node apply_patch5.js <TowerExploration-*.js>'); process.exit(1); }
  let src = fs.readFileSync(file, 'utf8');
  try {
    const { resolveCtx } = require('./rh_resolve.js');
    const ctx = resolveCtx(src);
    src = patch({ src, ctx, log: m => console.log('[' + PATCH + '] ' + m) });
    fs.writeFileSync(file, src, 'utf8');
    console.log(`[${PATCH}] 写入完成: ${file}`);
  } catch (e) {
    console.error(String(e.message || e));
    process.exit(1);
  }
}
