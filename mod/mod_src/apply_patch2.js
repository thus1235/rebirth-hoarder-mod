// apply_patch2.js - 战斗胜利战利品分流（v3.21 语义自适应版）
//   - 守关 BOSS（encounterType==="boss"）：胜利后进入 loot_box 三选一，
//     箱子强制"未全开、可手动选择"，由玩家自行选择，绝不自动全开/跳过（防卡死）。
//   - 普通/精英战斗：胜利后自动全收战利品（一键获取），不弹三选一，
//     全部箱子 items 并入 lootStash、晶核并入 totalCrystals，直接继续探索。
// 语义锚点：boss_first_kill_reward / bossFirstKillRewardState / battleReportState / lootBoxState /
//           currentFloorBossDefeated / enemy.encounterType / lootStash 合并函数
// 双模式：模块导出 patch({src,ctx,log})；CLI: node apply_patch2.js <TE.js>
'use strict';
const fs = require('fs');
const { PatchError, expectOne, escRe, modeOf } = require('./rh_resolve.js');

const PATCH = '战利品分流';

function buildTo({ BK, BR, LB, EN, PV, MERGE }) {
  return `phase:${BK}?"boss_first_kill_reward":${EN}?.enemy.encounterType==="boss"?"loot_box":"floor_explore",` +
    `bossFirstKillRewardState:${BK},battleReportState:${BR},` +
    `lootBoxState:${EN}?.enemy.encounterType==="boss"?(${LB}?{...${LB},allOpened:!1,selectedIndex:null,boxes:(${LB}.boxes||[]).map(b=>({...b,opened:!1}))}:null):(${LB}?{...${LB},boxes:(${LB}.boxes||[]).map(b=>({...b,opened:!0})),allOpened:!0}:null),` +
    `lootStash:${EN}?.enemy.encounterType==="boss"?${PV}.lootStash:${MERGE}(${PV}.lootStash,(${LB}?.boxes||[]).flatMap(b=>b.items||[])),` +
    `totalCrystals:${EN}?.enemy.encounterType==="boss"?(${PV}.totalCrystals||0):(${PV}.totalCrystals||0)+(${LB}?.boxes||[]).reduce((x,b)=>x+(b.crystals||0),0),`;
}

function patch({ src, ctx, log }) {
  log = log || (() => {});
  // 已应用检测（幂等）：分流版含 `?"loot_box":"floor_explore"`
  if (/phase:[A-Za-z_$][\w$]*\?"boss_first_kill_reward":[A-Za-z_$][\w$]*\?\.enemy\.encounterType==="boss"\?"loot_box":"floor_explore",/.test(src)) {
    log('已应用（boss三选一 / 普通自动全收）');
    return src;
  }

  // 原版锚点：phase:BK?"boss_first_kill_reward":"loot_box",bossFirstKillRewardState:BK,battleReportState:BR,lootBoxState:LB,
  const anchorRe = /phase:([A-Za-z_$][\w$]*)\?"boss_first_kill_reward":"loot_box",bossFirstKillRewardState:\1,battleReportState:([A-Za-z_$][\w$]*),lootBoxState:([A-Za-z_$][\w$]*),/g;
  const m = expectOne(src, anchorRe, PATCH, '胜利战利品原版锚点');
  const BK = m[1], BR = m[2], LB = m[3];

  // 敌人战斗态 + 上一层状态：EN?.enemy.encounterType==="boss"?!0:PV.currentFloorBossDefeated（锚点前最近一处）
  const seg = src.slice(Math.max(0, m.index - 6000), m.index);
  const reEP = /([A-Za-z_$][\w$]*)\?\.enemy\.encounterType==="boss"\?!0:([A-Za-z_$][\w$]*)\.currentFloorBossDefeated/g;
  let ep, lastEP = null;
  while ((ep = reEP.exec(seg))) lastEP = ep;
  if (!lastEP) throw new PatchError(PATCH, '敌人/上层状态解析', '锚点前未找到 `X?.enemy.encounterType==="boss"?!0:Y.currentFloorBossDefeated`', []);
  const EN = lastEP[1], PV = lastEP[2];

  // 战利品合并函数：lootStash:MERGE(PV'.lootStash, 的最高频标识符
  const mg = modeOf(src, /lootStash:([A-Za-z_$][\w$]*)\([A-Za-z_$][\w$]*\.lootStash,/g, 1);
  if (!mg.name || mg.count < 1) throw new PatchError(PATCH, '战利品合并函数', '未找到 `lootStash:X(Y.lootStash,` 形态', []);
  const MERGE = mg.name;

  const to = buildTo({ BK, BR, LB, EN, PV, MERGE });
  log(`已应用分流 (boss=${BK} 战斗态=${EN} 上层=${PV} 合并=${MERGE})`);
  return src.slice(0, m.index) + to + src.slice(m.index + m[0].length);
}

module.exports = { patch };

// ---------- CLI 兼容模式 ----------
if (require.main === module) {
  const file = process.argv[2];
  if (!file) { console.error('用法: node apply_patch2.js <TowerExploration-*.js>'); process.exit(1); }
  let src = fs.readFileSync(file, 'utf8');
  try {
    src = patch({ src, ctx: {}, log: m => console.log('[' + PATCH + '] ' + m) });
    fs.writeFileSync(file, src, 'utf8');
    console.log(`[${PATCH}] 写入完成: ${file}`);
  } catch (e) {
    console.error(String(e.message || e));
    process.exit(1);
  }
}
