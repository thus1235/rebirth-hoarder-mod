// apply_patch6.js - 自动秒杀模式（适配新版变量名）
const fs = require('fs');
const teFile = process.argv[2];
let te = fs.readFileSync(teFile, 'utf8');
let ok = true;

// ---- P1: 桥接增加 autoWin 方法（forceExit 已改为打开撤离确认界面 k({phase:"evacuation"})，确认后正常带出掉落） ----
const from1 = 'forceExit:()=>{de({...a,phase:"evacuation"})}};';
const to1 = 'forceExit:()=>{de({...a,phase:"evacuation"})},setAutoWin:(on)=>{v({...r,rhMod:{...(r.rhMod||{}),autoWin:!!on}}),window.__RH_MOD_AUTOWIN__=!!on},getAutoWin:()=>!!(r.rhMod?.autoWin||window.__RH_MOD_AUTOWIN__)};';
{
  const cnt = te.split(from1).length - 1;
  if (cnt !== 1) { console.error('[P1 autoWin桥接] 匹配 ' + cnt + ' 处'); ok = false; }
  else { te = te.split(from1).join(to1); console.log('[P1 桥接setAutoWin/getAutoWin] OK'); }
}

// ---- P2: 自动秒杀 effect（跳过守关BOSS：秒杀会跳过其正常击杀/通关流程，导致战利品结算卡死） ----
const anchor = 'return e.jsxs("div",{className:"rh-tower-exploration-root';
const effect = 'i.useEffect(()=>{if(a.phase!=="combat"||!a.combatState)return;if(!(r.rhMod?.autoWin||window.__RH_MOD_AUTOWIN__))return;if(a.combatState.encounterType==="boss")return;var t=setTimeout(function(){try{Ia({...a.combatState,victory:!0,playerHp:a.combatState.playerMaxHp||a.combatState.playerHp,round:1,rounds:1,combatLog:[]})}catch(e){console.error("[MOD]autoWin",e)}},400);return function(){clearTimeout(t)}},[a.phase,a.combatState,r.rhMod]);';
{
  const cnt = te.split(anchor).length - 1;
  if (cnt !== 1) { console.error('[P2 自动秒杀effect] 锚点匹配 ' + cnt + ' 处'); ok = false; }
  else { te = te.split(anchor).join(effect + anchor); console.log('[P2 自动秒杀effect] OK'); }
}

if (!ok) { console.error('存在失败补丁，未写入'); process.exit(1); }
fs.writeFileSync(teFile, te, 'utf8');
console.log('写入完成');
