// apply_patch4.js - 一键解锁全部楼层（标志位方案，v3.21 语义自适应版）
// bt(bestLocalFloor) useMemo 读取楼层进度：解锁标志开启时返回区域最高层。
// 解锁标志读 window.__RH_UNLOCK_ALL__ / __RH_UNLOCK_TO__（会话级，重启游戏自动复位）；
// metaSave.rhMod 保留在依赖数组里仅作 useMemo 重算触发。
// 语义锚点：exploration?.towerChapterProgress?.[x] + bestLocalFloor + debugTowerFullFloorJump
// 双模式：模块导出 patch({src,ctx,log})；CLI: node apply_patch4.js <TE.js>
'use strict';
const fs = require('fs');
const { PatchError, expectOne, escRe } = require('./rh_resolve.js');

const PATCH = '楼层标志位';

function patch({ src, ctx, log }) {
  log = log || (() => {});
  if (!ctx || !ctx.debugFlag || !ctx.p2Data) throw new PatchError(PATCH, '上下文', '需要 rh_resolve 解析的 ctx（debugFlag/p2Data/nodeId/metaSave/regionCfg）', []);
  const { react, debugFlag: DBG, p2Data: P2, nodeId: NODE, metaSave: META, regionCfg: CFG } = ctx;

  // 已应用检测（幂等）
  if (src.includes('window.__RH_UNLOCK_ALL__') && src.includes('towerAllFloorsUnlocked')) {
    log('已应用，跳过');
    return src;
  }

  // 原版锚点：
  // bt=REACT.useMemo(()=>{if(DBG)return GA;const n=P2.exploration?.towerChapterProgress?.[NODE];return Math.max(0,n?.bestLocalFloor??0)},[DBG,NODE,P2.exploration]),
  const re = new RegExp(
    '([A-Za-z_$][\\w$]*)=' + escRe(react) + '\\.useMemo\\(\\(\\)=>\\{if\\(' + escRe(DBG) + '\\)return ([A-Za-z_$][\\w$]*);const ([A-Za-z_$][\\w$]*)=' +
    escRe(P2) + '\\.exploration\\?\\.towerChapterProgress\\?\\.\\[' + escRe(NODE) + '\\];return Math\\.max\\(0,\\3\\?\\.bestLocalFloor\\?\\?0\\)\\},\\[' +
    escRe(DBG) + ',' + escRe(NODE) + ',' + escRe(P2) + '\\.exploration\\]\\),');
  const m = expectOne(src, re, PATCH, 'bestLocalFloor useMemo');
  const MEMO = m[1], FULL = m[2];

  const to = MEMO + '=' + react + '.useMemo(()=>{if(' + DBG + ')return ' + FULL + ';const n=' + P2 +
    '.exploration?.towerChapterProgress?.[' + NODE + '],ru=(' + NODE + '||"").startsWith("ruin_"),rf=' + CFG + '(' + NODE +
    ')?.endFloor||0,f=window.__RH_UNLOCK_ALL__&&ru?rf:(window.__RH_UNLOCK_TO__&&ru?Math.min(window.__RH_UNLOCK_TO__,rf):0);' +
    'return Math.max(f,n?.bestLocalFloor??0)},[' + DBG + ',' + NODE + ',' + P2 + '.exploration,' + META + '.rhMod]),';

  log(`已应用标志位 (${MEMO} 解锁标志=${DBG} 区域配置=${CFG})`);
  return src.slice(0, m.index) + to + src.slice(m.index + m[0].length);
}

module.exports = { patch };

// ---------- CLI 兼容模式 ----------
if (require.main === module) {
  const file = process.argv[2];
  if (!file) { console.error('用法: node apply_patch4.js <TowerExploration-*.js>'); process.exit(1); }
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
