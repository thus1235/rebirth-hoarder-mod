// apply_patch2.js - 战斗胜利自动开箱（适配新版变量名）
// 【2026-09 回退】此前的"自动开箱"补丁把战斗胜利后的 phase 从 "loot_box" 改成了 "floor_explore"，
// 并强制打开所有战利品箱子、把所有奖励塞进 lootStash，导致：
//   1. 本应三选一的战利品封存箱被"默认全开"；
//   2. 后续进入封存界面时 lootBoxState 状态残缺（allOpened=true 但 selectedIndex=null），
//      底部"继续推进"按钮不渲染，界面卡住无法继续。
// 修复：回退为游戏原版逻辑——战斗胜利后正常进入 loot_box 三选一，由玩家自行选择/全开。
// 本脚本改为 no-op：不替换，保留原版的行（phase 仍为 "loot_box"，lootBoxState:J 原样保留）。
const fs = require('fs');
const file = process.argv[2];
let s = fs.readFileSync(file, 'utf8');

const from = 'phase:re?"boss_first_kill_reward":"loot_box",bossFirstKillRewardState:re,battleReportState:se,lootBoxState:J,';
// 若已被旧版补丁改过（存在全开逻辑），恢复为原版
const patchedOld = 'phase:re?"boss_first_kill_reward":"floor_explore",bossFirstKillRewardState:re,battleReportState:se,';
const oldToOrig = 'phase:re?"boss_first_kill_reward":"loot_box",bossFirstKillRewardState:re,battleReportState:se,lootBoxState:J,';

// 1) 若还是原版：无需改动
if (s.split(from).length - 1 === 1) {
  console.log('[PATCH 战斗胜利自动开箱] 已回退为原版三选一（无需改动）');
  fs.writeFileSync(file, s, 'utf8');
  process.exit(0);
}

// 2) 若是旧版补丁改动过：把 "floor_explore"+全开 恢复为 原版 loot_box
//    注意：旧改动插入了一段 lootStash/全开逻辑，这里连同它一起清除，恢复成干净原版行。
const patchedFull = 'phase:re?"boss_first_kill_reward":"floor_explore",bossFirstKillRewardState:re,battleReportState:se,lootBoxState:J?{...J,boxes:(J.boxes||[]).map(b=>({...b,opened:!0})),allOpened:!0}:null,lootStash:Tt(oe.lootStash,(J?.boxes||[]).flatMap(b=>b.items||[])),totalCrystals:(oe.totalCrystals||0)+(J?.boxes||[]).reduce((s,b)=>s+(b.crystals||0),0),';
const cnt = s.split(patchedFull).length - 1;
if (cnt === 1) {
  s = s.split(patchedFull).join(oldToOrig);
  fs.writeFileSync(file, s, 'utf8');
  console.log('[PATCH 战斗胜利自动开箱] 已回退全开逻辑，恢复三选一 loot_box');
  process.exit(0);
}

// 3) 其它情况：无法安全处理
console.error(`[PATCH 战斗胜利自动开箱] 未知状态（匹配 ${cnt} 处），未改动`);
process.exit(1);
