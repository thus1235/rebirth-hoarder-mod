// apply_patch5.js - 注入完整桥接(F8面板调用) + 防御性Ea/Da（适配新版变量名）
const fs = require('fs');
const teFile = process.argv[2];
let te = fs.readFileSync(teFile, 'utf8');
let ok = true;

// ---- P1: 在 return JSX 前注入桥接（此时所有回调已定义，无 TDZ；分号分隔语句） ----
const anchor = 'return e.jsxs("div",{className:"rh-tower-exploration-root';
const bridge = 'i.useEffect(()=>{window.__RH_MOD__={jumpToTopFloor:()=>{de(s=>{var c=ao(s.activeNodeId);if(!c||!Number.isFinite(c.endFloor))return s;return{...s,currentFloor:c.endFloor,maxFloorReached:c.endFloor,clearedFloorThisRun:c.endFloor-1,currentBuilding:null,phase:"tower_map"}})},unlockAllFloors:()=>{v({...r,rhMod:{...(r.rhMod||{}),towerAllFloorsUnlocked:!0}}),p(g=>{var ids=["ruin_1","ruin_2","ruin_3","ruin_4","ruin_5"],exp=g.exploration||{},prog={...(exp.towerChapterProgress||{})},cleared=[...(exp.clearedNodes||[])],unlocked=[...(exp.unlockedNodes||[])],any=!1;for(var i=0;i<ids.length;i++){var id=ids[i],c=ao(id);if(!c||!Number.isFinite(c.endFloor))continue;var prev=prog[id];prog[id]={bestLocalFloor:c.endFloor,bestAbsoluteFloor:Math.max(prev&&Number.isFinite(prev.bestAbsoluteFloor)?prev.bestAbsoluteFloor:0,c.worldFloorEnd||0)};cleared.indexOf(id)<0&&cleared.push(id);unlocked.indexOf(id)<0&&unlocked.push(id);any=!0}return any?{...g,exploration:{...exp,clearedNodes:cleared,unlockedNodes:unlocked,towerChapterProgress:prog}}:g})},instantWin:()=>{var c=a.combatState;if(!c||c.encounterType==="boss")return;Ia({...c,victory:!0,playerHp:c.playerMaxHp||c.playerHp,round:1,rounds:1,combatLog:[]})},forceExit:()=>{de({...a,phase:"evacuation"})}};return()=>{window.__RH_MOD__=null}},[de,p,v,r,a,Ia,Et,so]);';
{
  const cnt = te.split(anchor).length - 1;
  if (cnt !== 1) { console.error('[P1 桥接] 锚点匹配 ' + cnt + ' 处'); ok = false; }
  else { te = te.split(anchor).join(bridge + anchor); console.log('[P1 桥接注入] OK'); }
}

// ---- P2: 防御性 Ea（对 apply_patches 注入的自动开箱版加 try/catch） ----
const eaFrom = 'Ea=i.useCallback(()=>{k(n=>{let x={...n,battleReportState:null};if(x.lootBoxState&&!x.lootBoxState.allOpened){const items=(x.lootBoxState.boxes||[]).flatMap(b=>b.items||[]);const crystals=(x.lootBoxState.boxes||[]).reduce((s,b)=>s+(b.crystals||0),0);x={...x,lootStash:Tt(x.lootStash,items),totalCrystals:(x.totalCrystals||0)+crystals,lootBoxState:{...x.lootBoxState,boxes:x.lootBoxState.boxes.map(b=>({...b,opened:true})),allOpened:true}}}if(!x.exitFloorPending)return{...x,phase:"floor_explore"};if(x.pendingCardRewardChoices&&x.pendingCardRewardChoices.length>0){const d=Qe(x.pendingCardRewardChoices);if(d){const cards=(d.choices||[]).slice(0,1);if(cards.length>0){const col=cards.reduce((b,id)=>to(b,id,"white",1),we);v({...r,towerCardCollection:col})}x={...x,cardRewardState:d,pendingCardRewardChoices:null}}return Kt(x)}return Kt(x)}),a.exitFloorPending&&!a.pendingCardRewardChoices?.length&&(z?.(Kt({...a,battleReportState:null})))},[Qe,z,k,Tt,Kt,to,we,v,r,a])';
const eaTo = 'Ea=i.useCallback(()=>{k(n=>{let x={...n,battleReportState:null};if(x.lootBoxState&&!x.lootBoxState.allOpened){try{const items=(x.lootBoxState.boxes||[]).flatMap(b=>b.items||[]);const crystals=(x.lootBoxState.boxes||[]).reduce((s,b)=>s+(b.crystals||0),0);x={...x,lootStash:Tt(x.lootStash,items),totalCrystals:(x.totalCrystals||0)+crystals,lootBoxState:{...x.lootBoxState,boxes:x.lootBoxState.boxes.map(b=>({...b,opened:true})),allOpened:true}}}catch(e){console.error("[MOD]Ea box",e)}}if(!x.exitFloorPending)return{...x,phase:"floor_explore"};if(x.pendingCardRewardChoices&&x.pendingCardRewardChoices.length>0){try{const d=Qe(x.pendingCardRewardChoices);if(d){const cards=(d.choices||[]).slice(0,1);if(cards.length>0){const col=cards.reduce((b,id)=>to(b,id,"white",1),we);v({...r,towerCardCollection:col})}x={...x,cardRewardState:d,pendingCardRewardChoices:null}}}catch(e){console.error("[MOD]Ea card",e)}}return Kt(x)}),a.exitFloorPending&&!a.pendingCardRewardChoices?.length&&(z?.(Kt({...a,battleReportState:null})))},[Qe,z,k,Tt,Kt,to,we,v,r,a])';
{
  const cnt = te.split(eaFrom).length - 1;
  if (cnt !== 1) { console.error('[P2 Ea] 匹配 ' + cnt + ' 处'); ok = false; }
  else { te = te.split(eaFrom).join(eaTo); console.log('[P2 防御性Ea] OK'); }
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
