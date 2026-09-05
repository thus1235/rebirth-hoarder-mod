// apply_patch5.js - 注入完整桥接(F8面板调用) + 防御性Ea/Da（适配新版变量名）
// 【2026-09 修复】unlockAllFloors / jumpToTopFloor 原实现误用 ao()：
//   ao 是 AppContent 导出的数组常量 ["inventory","stash","lootStash"]（被复用命名），
//   并非"节点配置查询"函数 → 调用抛 TypeError / 返回 undefined，功能无效。
//   区域配置查询应为 ar(nodeId)（index.js az），返回 {startFloor,endFloor,...}；
//   进入楼层的正规入口是 Ct(floor)（楼层选择 onEnterFloor），它会 clamp 到
//   已解锁上限并置 phase:"loadout"。据此重写：
//   · unlockAllFloors = 仅置 rhMod.towerAllFloorsUnlocked 标志（Dt 读取时经
//     patch4 返回 ar(t).endFloor → 地图界面可选中最高层，无需写假 exploration 字段）
//   · jumpToTopFloor = 调 Ct(ar(当前区域).endFloor) 走游戏正规进入流程
const fs = require('fs');
const teFile = process.argv[2];
let te = fs.readFileSync(teFile, 'utf8');
let ok = true;

// ---- P1: 在 return JSX 前注入桥接（此时所有回调已定义，无 TDZ；分号分隔语句） ----
const anchor = 'return e.jsxs("div",{className:"rh-tower-exploration-root';
const bridge = 'i.useEffect(()=>{window.__RH_MOD__={jumpToTopFloor:()=>{try{var node=a.activeNodeId??t,rg=ar(node);if(!rg||!Number.isFinite(rg.endFloor)){console.warn("[MOD]jump:no-region",node);return}Ct(rg.endFloor)}catch(e){console.error("[MOD]jumpTop",e)}},unlockAllFloors:()=>{try{window.__RH_UNLOCK_ALL__=!0;window.__RH_UNLOCK_TO__=0;v({...r,rhMod:{...(r.rhMod||{}),towerAllFloorsUnlocked:!0,unlockToFloor:0}})}catch(e){console.error("[MOD]unlockAll",e)}},unlockToFloor:n=>{try{var fn=Math.max(1,Math.floor(Number(n)||0));window.__RH_UNLOCK_ALL__=!1;window.__RH_UNLOCK_TO__=fn;v({...r,rhMod:{...(r.rhMod||{}),towerAllFloorsUnlocked:!1,unlockToFloor:fn}})}catch(e){console.error("[MOD]unlockTo",e)}},restoreFloors:()=>{try{window.__RH_UNLOCK_ALL__=!1;window.__RH_UNLOCK_TO__=0;v({...r,rhMod:{...(r.rhMod||{}),towerAllFloorsUnlocked:!1,unlockToFloor:0}})}catch(e){console.error("[MOD]restore",e)}},restoreProgressFloor:n=>{try{var node=t||a.activeNodeId,tg=Math.max(0,Math.floor(Number(n)||0));window.__RH_UNLOCK_ALL__=!1;window.__RH_UNLOCK_TO__=0;try{v({...r,rhMod:{...(r.rhMod||{}),towerAllFloorsUnlocked:!1,unlockToFloor:0}})}catch(e0){}var S=window.__RH_UE__;if(typeof S!=="function"){window.__RH_RESTORE_RESULT__={node:node,err:"全局状态接口未就绪，请先进游戏界面再试"};return}S(function(prev){try{if(!prev||!prev.p2){window.__RH_RESTORE_RESULT__={node:node,err:"无p2状态（需在第二阶段游戏中）"};return prev}var ex=prev.p2.exploration||{},tcp=Object.assign({},ex.towerChapterProgress||{}),cur=tcp[node]||{},old=Math.max(0,Math.floor(Number(cur.bestLocalFloor)||0)),nn=Math.min(old,tg);if(nn===old){window.__RH_RESTORE_RESULT__={node:node,old:old,set:nn,changed:!1};return prev}var oa=Math.max(0,Math.floor(Number(cur.bestAbsoluteFloor)||0));tcp[node]=Object.assign({},cur,{bestLocalFloor:nn,bestAbsoluteFloor:Math.max(0,oa-(old-nn))});window.__RH_RESTORE_RESULT__={node:node,old:old,set:nn,changed:!0};return Object.assign({},prev,{p2:Object.assign({},prev.p2,{exploration:Object.assign({},ex,{towerChapterProgress:tcp})})})}catch(e2){window.__RH_RESTORE_RESULT__={node:node,err:String(e2)};return prev}})}catch(e){console.error("[MOD]restoreProgress",e)}},instantWin:()=>{var c=a.combatState;if(!c||c.encounterType==="boss")return;Ia({...c,victory:!0,playerHp:c.playerMaxHp||c.playerHp,round:1,rounds:1,combatLog:[]})},forceExit:()=>{de({...a,phase:"evacuation"})}};return()=>{window.__RH_MOD__=null}},[Ct,de,v,r,a,Ia,ar,t]);';
{
  const cnt = te.split(anchor).length - 1;
  if (cnt !== 1) { console.error('[P1 桥接] 锚点匹配 ' + cnt + ' 处'); ok = false; }
  else { te = te.split(anchor).join(bridge + anchor); console.log('[P1 桥接注入] OK'); }
}

// ---- P2: 防御性 Ea（【2026-09 回退】Ea 已恢复为原版“战报确认进 loot_box 三选一”，
//     不再附带自动开箱逻辑，故无需防御性包装；此段 no-op，保留原版 Ea。） ----
{
  console.log('[P2 防御性Ea] 已跳过（Ea 为原版三选一）');
}

// ---- P3: 防御性 Da ----
const daFrom = 'Da=i.useCallback(n=>{const d=ha(a)&&a.clearedFloorThisRun>=ke.floor?"chapter_cleared":"evacuated";Et(so(a,d,n))},[Et,ke.floor,a])';
const daTo = 'Da=i.useCallback(n=>{try{const d=ha(a)&&a.clearedFloorThisRun>=ke.floor?"chapter_cleared":"evacuated";Et(so(a,d,n))}catch(e){console.error("[MOD]Da",e);Et(so(a,"evacuated",[],{consumeActionHours:!1,threatGain:0}))}},[Et,so,ke.floor,a])';
{
  const cnt = te.split(daFrom).length - 1;
  if (cnt !== 1) { console.error('[P3 Da] 匹配 ' + cnt + ' 处'); ok = false; }
  else { te = te.split(daFrom).join(daTo); console.log('[P3 防御性Da] OK'); }
}

if (!ok) { console.error('存在失败补丁，未写入'); process.exit(1); }
fs.writeFileSync(teFile, te, 'utf8');
console.log('写入完成');
