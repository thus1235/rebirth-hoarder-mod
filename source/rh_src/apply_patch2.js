// apply_patch2.js - 战斗胜利自动开箱（适配新版变量名）
const fs = require('fs');
const file = process.argv[2];
let s = fs.readFileSync(file, 'utf8');

const from = 'phase:re?"boss_first_kill_reward":"loot_box",bossFirstKillRewardState:re,battleReportState:se,lootBoxState:J,';
const to = 'phase:re?"boss_first_kill_reward":"floor_explore",bossFirstKillRewardState:re,battleReportState:se,lootBoxState:J?{...J,boxes:(J.boxes||[]).map(b=>({...b,opened:!0})),allOpened:!0}:null,lootStash:Tt(oe.lootStash,(J?.boxes||[]).flatMap(b=>b.items||[])),totalCrystals:(oe.totalCrystals||0)+(J?.boxes||[]).reduce((s,b)=>s+(b.crystals||0),0),';

const count = s.split(from).length - 1;
if (count !== 1) { console.error(`匹配 ${count} 处，期望 1 处`); process.exit(1); }
s = s.split(from).join(to);
fs.writeFileSync(file, s, 'utf8');
console.log('[PATCH 战斗胜利自动开箱] OK');
