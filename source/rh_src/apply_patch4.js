// apply_patch4.js - 一键解锁全部楼层（标志位方案，适配新版 Dt/ao）
const fs = require('fs');
const teFile = process.argv[2];
let te = fs.readFileSync(teFile, 'utf8');

// P1: Dt(bestLocalFloor) 读取楼层进度时：mod 标志开启则直接返回该区域最高层
// 【2026-09 修复】原实现误用 ao(t)（ao 是物品来源数组 ["inventory","stash","lootStash"]，
//     并非节点查询函数，运行会抛错/失效）；区域配置查询函数应为 ar(nodeId)，
//     返回 {startFloor,endFloor,...}。改为 ar(t)?.endFloor。
// 【2026-09-05 反馈修复】"上完游戏后还没用一键解锁就全都解锁了"：
//     原实现读的是 r.rhMod?.towerAllFloorsUnlocked，而 rhMod 会随存档持久化，
//     导致解锁一次后永久生效。改为读 window.__RH_UNLOCK_ALL__（仅本次游戏进程有效，
//     重启游戏自动复位）；r.rhMod 保留在依赖数组里仅作为"触发 useMemo 重算"的信号。
const jeFrom = 'Dt=i.useMemo(()=>{if(Je)return ua;const n=o.exploration?.towerChapterProgress?.[t];return Math.max(0,n?.bestLocalFloor??0)},[Je,t,o.exploration]),';
// 【2026-09-05 v1.5】支持两种解锁形态（均为会话级，重启游戏自动复位）：
//   window.__RH_UNLOCK_ALL__ = true            -> 一键解锁全部（到区域顶楼）
//   window.__RH_UNLOCK_TO__  = N (数字>0)      -> 只解锁到第 N 层（不超过区域顶楼）
//   都没设 -> 0（完全原版状态）。r.rhMod 仅留在依赖数组里作重算触发。
const jeTo = 'Dt=i.useMemo(()=>{if(Je)return ua;const n=o.exploration?.towerChapterProgress?.[t],ru=(t||"").startsWith("ruin_"),rf=ar(t)?.endFloor||0,f=window.__RH_UNLOCK_ALL__&&ru?rf:(window.__RH_UNLOCK_TO__&&ru?Math.min(window.__RH_UNLOCK_TO__,rf):0);return Math.max(f,n?.bestLocalFloor??0)},[Je,t,o.exploration,r.rhMod]),';
{
  const cnt = te.split(jeFrom).length - 1;
  if (cnt !== 1) { console.error('[P1 Dt] 匹配 ' + cnt + ' 处，期望 1'); process.exit(1); }
  te = te.split(jeFrom).join(jeTo);
  console.log('[P1 Dt 标志位] OK');
}
fs.writeFileSync(teFile, te, 'utf8');
console.log('写入完成');
