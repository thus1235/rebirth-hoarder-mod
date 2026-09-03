// apply_patch2.js - 战斗胜利战利品处理（适配新版变量名）
// 【2026-09】战利品封存箱：恢复游戏原版"三选一"，且强制箱子处于"未全开、可手动选择"状态。
//   旧版补丁把 phase 改成 floor_explore + 全开 + 全塞 lootStash → 本应三选一的封存箱被默认全开、
//   后续进入时状态残缺（allOpened=true 但 selectedIndex=null）→ 界面无按钮卡死。
//   现改为：胜利后 phase 照常 "loot_box"，且 lootBoxState 强制 {allOpened:false,selectedIndex:null,
//   boxes 全部 opened:false}，确保守关 BOSS 等任何胜利后都是干净的手动三选一界面，绝不全选/跳过。
const fs = require('fs');
const file = process.argv[2];
let s = fs.readFileSync(file, 'utf8');

// 目标替换：把 victory 结算里的 lootBoxState:J 替换为强制可选状态
const from = 'phase:re?"boss_first_kill_reward":"loot_box",bossFirstKillRewardState:re,battleReportState:se,lootBoxState:J,';
const to = 'phase:re?"boss_first_kill_reward":"loot_box",bossFirstKillRewardState:re,battleReportState:se,lootBoxState:J?{...J,allOpened:!1,selectedIndex:null,boxes:(J.boxes||[]).map(b=>({...b,opened:!1}))}:null,';

// 若已是本补丁目标形态 → 跳过
if (s.split(to).length - 1 === 1) {
  console.log('[PATCH 战斗胜利战利品] 已是可选三选一状态（无需改动）');
  fs.writeFileSync(file, s, 'utf8');
  process.exit(0);
}

// 若还是原版 → 应用
if (s.split(from).length - 1 === 1) {
  s = s.split(from).join(to);
  fs.writeFileSync(file, s, 'utf8');
  console.log('[PATCH 战斗胜利战利品] 已应用：胜利后封存箱强制为未全开、可手动三选一');
  process.exit(0);
}

// 若是旧版补丁全开逻辑 → 恢复为可选三选一
const patchedOld = 'phase:re?"boss_first_kill_reward":"floor_explore",bossFirstKillRewardState:re,battleReportState:se,lootBoxState:J?{...J,boxes:(J.boxes||[]).map(b=>({...b,opened:!0})),allOpened:!0}:null,lootStash:Tt(oe.lootStash,(J?.boxes||[]).flatMap(b=>b.items||[])),totalCrystals:(oe.totalCrystals||0)+(J?.boxes||[]).reduce((s,b)=>s+(b.crystals||0),0),';
const cnt = s.split(patchedOld).length - 1;
if (cnt === 1) {
  s = s.split(patchedOld).join(to);
  fs.writeFileSync(file, s, 'utf8');
  console.log('[PATCH 战斗胜利战利品] 已从旧全开逻辑恢复为可选三选一');
  process.exit(0);
}

// 其它情况：无法安全处理
console.error(`[PATCH 战斗胜利战利品] 未知状态，未改动`);
process.exit(1);
