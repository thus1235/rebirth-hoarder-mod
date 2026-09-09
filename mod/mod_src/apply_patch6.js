// apply_patch6.js - 自动秒杀模式（v3.21 语义自适应版）
//   P1: 桥接追加 setAutoWin/getAutoWin（forceExit 打开撤离确认界面，确认后正常带出掉落）
//   P2: 自动秒杀 effect（跳过守关BOSS：秒杀会跳过其正常击杀/通关流程，导致战利品结算卡死）
// 依赖 patch5 已注入桥接（同一 ctx 的变量名）。
// 双模式：模块导出 patch({src,ctx,log})；CLI: node apply_patch6.js <TE.js>
'use strict';
const fs = require('fs');
const { PatchError, expectOne, escRe } = require('./rh_resolve.js');

const PATCH = '自动秒杀';

function patch({ src, ctx, log }) {
  log = log || (() => {});
  if (!ctx || !ctx.react) throw new PatchError(PATCH, '上下文', '需要 rh_resolve 解析的 ctx', []);
  const { react, phase, metaSave, combatVictory, setMetaSave } = ctx;

  // ---- P1: 桥接追加 setAutoWin/getAutoWin ----
  if (!src.includes('setAutoWin:(on)')) {
    const from = `forceExit:()=>{${ctx.setPhase}({...${phase},phase:"evacuation"})}};`;
    const to = `forceExit:()=>{${ctx.setPhase}({...${phase},phase:"evacuation"})},setAutoWin:(on)=>{${setMetaSave}({...${metaSave},rhMod:{...(${metaSave}.rhMod||{}),autoWin:!!on}}),window.__RH_MOD_AUTOWIN__=!!on},getAutoWin:()=>!!(${metaSave}.rhMod?.autoWin||window.__RH_MOD_AUTOWIN__)};`;
    const cnt = src.split(from).length - 1;
    if (cnt !== 1) throw new PatchError(PATCH, '桥接 forceExit 尾部', `匹配 ${cnt} 处（patch5 桥接可能未注入）`, []);
    src = src.split(from).join(to);
    log('P1 桥接 setAutoWin/getAutoWin OK');
  } else {
    log('P1 已存在，跳过');
  }

  // ---- P2: 自动秒杀 effect ----
  if (!src.includes('[MOD]autoWin')) {
    const anchorRe = new RegExp('return ' + escRe(ctx.jsx || react) + '\\.jsxs\\("div",\\{className:"rh-tower-exploration-root');
    const m = expectOne(src, anchorRe, PATCH, 'effect 注入点 rh-tower-exploration-root');
    const effect = react + '.useEffect(()=>{if(' + phase + '.phase!=="combat"||!' + phase + '.combatState)return;' +
      'if(!(' + metaSave + '.rhMod?.autoWin||window.__RH_MOD_AUTOWIN__))return;' +
      'if(' + phase + '.combatState.encounterType==="boss")return;' +
      'var t=setTimeout(function(){try{' + combatVictory + '({...' + phase + '.combatState,victory:!0,playerHp:' + phase +
      '.combatState.playerMaxHp||' + phase + '.combatState.playerHp,round:1,rounds:1,combatLog:[]})}catch(e){console.error("[MOD]autoWin",e)}},400);' +
      'return function(){clearTimeout(t)}},[' + phase + '.phase,' + phase + '.combatState,' + metaSave + '.rhMod]);';
    src = src.slice(0, m.index) + effect + src.slice(m.index);
    log('P2 自动秒杀 effect OK');
  } else {
    log('P2 已存在，跳过');
  }

  return src;
}

module.exports = { patch };

// ---------- CLI 兼容模式 ----------
if (require.main === module) {
  const file = process.argv[2];
  if (!file) { console.error('用法: node apply_patch6.js <TowerExploration-*.js>'); process.exit(1); }
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
