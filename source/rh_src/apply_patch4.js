// apply_patch4.js - 一键解锁全部楼层（标志位方案，适配新版 Dt/ao）
const fs = require('fs');
const teFile = process.argv[2];
let te = fs.readFileSync(teFile, 'utf8');

// P1: Dt(bestLocalFloor) 读取楼层进度时：mod 标志开启则直接返回该区域最高层
const jeFrom = 'Dt=i.useMemo(()=>{if(Je)return ua;const n=o.exploration?.towerChapterProgress?.[t];return Math.max(0,n?.bestLocalFloor??0)},[Je,t,o.exploration]),';
const jeTo = 'Dt=i.useMemo(()=>{if(Je)return ua;const n=o.exploration?.towerChapterProgress?.[t],f=(r.rhMod?.towerAllFloorsUnlocked&&(t||"").startsWith("ruin_"))?(ao(t)?.endFloor||0):0;return Math.max(f,n?.bestLocalFloor??0)},[Je,t,o.exploration,r.rhMod]),';
{
  const cnt = te.split(jeFrom).length - 1;
  if (cnt !== 1) { console.error('[P1 Dt] 匹配 ' + cnt + ' 处，期望 1'); process.exit(1); }
  te = te.split(jeFrom).join(jeTo);
  console.log('[P1 Dt 标志位] OK');
}
fs.writeFileSync(teFile, te, 'utf8');
console.log('写入完成');
