// apply_patch2.js - 战斗胜利战利品分流处理（适配新版变量名）
// 【2026-09 最终版】按战斗类型分流：
//   - 守关 BOSS（encounterType==="boss"）：胜利后进入 loot_box 三选一，
//     箱子强制"未全开、可手动选择"，由玩家自行选择，绝不自动全开/跳过（防卡死）。
//   - 普通/精英战斗：胜利后自动全收战利品（一键获取），不弹三选一，
//     全部箱子 items 并入 lootStash、晶核并入 totalCrystals，直接继续探索。
const fs = require('fs');
const file = process.argv[2];
let s = fs.readFileSync(file, 'utf8');

// 目标（分流版）
const to = 'phase:re?"boss_first_kill_reward":d?.enemy.encounterType==="boss"?"loot_box":"floor_explore",bossFirstKillRewardState:re,battleReportState:se,lootBoxState:d?.enemy.encounterType==="boss"?(J?{...J,allOpened:!1,selectedIndex:null,boxes:(J.boxes||[]).map(b=>({...b,opened:!1}))}:null):(J?{...J,boxes:(J.boxes||[]).map(b=>({...b,opened:!0})),allOpened:!0}:null),lootStash:d?.enemy.encounterType==="boss"?oe.lootStash:Tt(oe.lootStash,(J?.boxes||[]).flatMap(b=>b.items||[])),totalCrystals:d?.enemy.encounterType==="boss"?(oe.totalCrystals||0):(oe.totalCrystals||0)+(J?.boxes||[]).reduce((s,b)=>s+(b.crystals||0),0),';

// 已应用分流 → 跳过
if (s.split(to).length - 1 === 1) {
  console.log('[PATCH 胜利战利品] 已应用（boss三选一 / 普通自动全收）');
  fs.writeFileSync(file, s, 'utf8');
  process.exit(0);
}

// 原版形态 → 应用分流
const fromOrig = 'phase:re?"boss_first_kill_reward":"loot_box",bossFirstKillRewardState:re,battleReportState:se,lootBoxState:J,';
if (s.split(fromOrig).length - 1 === 1) {
  s = s.split(fromOrig).join(to);
  fs.writeFileSync(file, s, 'utf8');
  console.log('[PATCH 胜利战利品] 已从原版应用分流');
  process.exit(0);
}

// 上一版"全部强制三选一"形态 → 升级为分流
const fromAllManual = 'phase:re?"boss_first_kill_reward":"loot_box",bossFirstKillRewardState:re,battleReportState:se,lootBoxState:J?{...J,allOpened:!1,selectedIndex:null,boxes:(J.boxes||[]).map(b=>({...b,opened:!1}))}:null,';
if (s.split(fromAllManual).length - 1 === 1) {
  s = s.split(fromAllManual).join(to);
  fs.writeFileSync(file, s, 'utf8');
  console.log('[PATCH 胜利战利品] 已从全手动升级为分流');
  process.exit(0);
}

// 旧版"全开floor_explore"形态 → 恢复为分流
const patchedOld = 'phase:re?"boss_first_kill_reward":"floor_explore",bossFirstKillRewardState:re,battleReportState:se,lootBoxState:J?{...J,boxes:(J.boxes||[]).map(b=>({...b,opened:!0})),allOpened:!0}:null,lootStash:Tt(oe.lootStash,(J?.boxes||[]).flatMap(b=>b.items||[])),totalCrystals:(oe.totalCrystals||0)+(J?.boxes||[]).reduce((s,b)=>s+(b.crystals||0),0),';
if (s.split(patchedOld).length - 1 === 1) {
  s = s.split(patchedOld).join(to);
  fs.writeFileSync(file, s, 'utf8');
  console.log('[PATCH 胜利战利品] 已从旧全开逻辑恢复为分流');
  process.exit(0);
}

console.error('[PATCH 胜利战利品] 未知状态，未改动');
process.exit(1);
