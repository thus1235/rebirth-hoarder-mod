// sim_test.js - 生态模块逻辑仿真测试：用"按原版语义实现的 mock 函数"跑 window.__RH_ECO__ 各功能
// 目的：不启动游戏也能验证 收获/种植/催熟/宰杀/烹饪/孵化/放入/喂食/浇水/施肥 的计数与库存扣减是否正确
const fs = require('fs');
const path = require('path');

// ================= mock：按原版 AC_orig.js 中的真实实现语义 =================
const TQ = { chicken_egg: 'baby_chick', duck_egg: 'baby_duckling' };
const xo = {
  baby_chick: { type: 'chicken', tier: 'baby' },
  baby_duckling: { type: 'duck', tier: 'baby' },
  chicken: { type: 'chicken', tier: 'adult' },
  duck: { type: 'duck', tier: 'adult' },
};
function ef(t) { return TQ[t]; }
function vl(dev) {
  const fs0 = dev.farmState || {};
  return { level: 1, gridRows: 2, gridCols: 2, slots: fs0.slots || [] };
}
function k0(s) {
  if (!s || s.stage !== 'mature') return null;
  return { outputDefId: 'veg', quantity: 3, bonusSeedDefId: 'seed_veg', bonusSeedQuantity: 1, bonusCompost: false };
}
function Vi(t, e) {
  const s = t || {};
  return { level: 1, gridSize: 2, slots: s.slots || [], feedStock: s.feedStock || 0, feedCapacity: 100, pendingHatches: s.pendingHatches || [] };
}
function xr(s) { return { isMature: !!(s && (s.tier === 'adult' || (s.growthProgressHours || 0) >= 24)) }; }
function b9(t, e, n, s, r = 0) {
  const i = Vi(t);
  if (!xo[e] || n < 0 || s < 0 || n >= i.gridSize || s >= i.gridSize) return null;
  if (i.slots.some(l => l.row === n && l.col === s)) return null;
  if (i.slots.length >= i.gridSize * i.gridSize) return null;
  return [...i.slots, { id: 'a' + Math.random(), animalDefId: e, row: n, col: s, growthProgressHours: 0 }];
}
function _9(t, e, n) {
  const s = Vi(t), r = ef(e);
  return r ? Object.assign({}, s, { pendingHatches: [...(s.pendingHatches || []), { id: 'h' + Math.random(), animalDefId: r, completeDay: (n || 0) + 3 }] }) : null;
}
function M4(t, e, n = 100) { return Math.min(n, t + e); }
function _y(t) {
  if (t.watered || t.stage === 'mature' || t.stage === 'withered') return null;
  return Object.assign({}, t, { watered: true, growthProgress: Math.min(0.95, (t.growthProgress || 0) + 0.15) });
}
function Zp(t, e) {
  return t.fertilized || t.stage === 'mature' || t.stage === 'withered' ? null : Object.assign({}, t, { fertilized: true, fertilizerType: e });
}
function T4(list, id) {
  const s = (list || []).find(u => u.id === id);
  if (!s) return null;
  if (!xr(s).isMature) return null;
  return { updatedSlots: list.filter(u => u.id !== id), outputDefId: 'raw_chicken', outputQuantity: 2 };
}
function L2(level) {
  return [{ id: 'r1', powerCost: 0, ingredients: [{ itemId: 'veg', count: 2 }], outputId: 'dish1' }];
}
// 物品定义表（游戏内语义键 ITEMS）
const ITEMS = {
  medkit: { name: '战地医疗包', type: 'consumable', rarity: 'common' },
  gatling_gun: { name: '加特林机枪', type: 'weapon', rarity: 'legendary' },
  water_bottle: { name: '纯净水', type: 'consumable', rarity: 'common' },
};

// 旧版错误实现（v3.15）的语义：用于反证——SIM_OLD=1 时把三个函数换回错误的映射
function _4(t) { if (t && t.intervalId !== null) { /* clearInterval */ } return undefined; } // 实为清定时器，无返回值
function by(t) { return undefined; } // 实为广告位查询 rewardedPlacementIds[t]

let state = null;
function K(updater) { state = updater(state); }

// ================= 加载注入代码（把占位符替换成 mock 名） =================
const MAP = {
  __RH_FN_SETSTATE__: 'K', __RH_FN_FARMSTATE__: 'vl', __RH_FN_HARVEST__: 'k0', __RH_FN_INCUB__: 'Vi',
  __RH_FN_ANIMALINFO__: 'xr', __RH_FN_PLACE__: 'b9', __RH_FN_ADDFEED__: 'M4', __RH_FN_WATER__: '_y',
  __RH_FN_FERT__: 'Zp', __RH_FN_HATCH__: '_9', __RH_FN_EGGMAP__: 'ef', __RH_FN_ANIMALCFG__: 'xo',
  __RH_FN_SLAUGHTER__: 'T4', __RH_FN_RECIPES__: 'L2', __RH_ITEMS__: 'ITEMS',
};
// SIM_OLD=1：复现 v3.15 的错误映射（孵化误用放入函数 / 喂食误用清定时器 / 浇水误用广告查询）
if (process.env.SIM_OLD === '1') {
  MAP.__RH_FN_HATCH__ = 'b9';
  MAP.__RH_FN_ADDFEED__ = '_4';
  MAP.__RH_FN_WATER__ = 'by';
  console.log('### 反证模式：使用 v3.15 的错误函数映射 ###\n');
}
let code = fs.readFileSync(path.join(__dirname, 'rh_src/eco_inject.js'), 'utf8');
for (const k of Object.keys(MAP)) code = code.split(k).join(MAP[k]);
if (code.indexOf('__RH_FN_') >= 0) { console.error('占位符未完全替换'); process.exit(1); }

const windowMock = {};
const fnNames = ['K', 'vl', 'k0', 'Vi', 'xr', 'b9', 'M4', '_y', 'Zp', '_9', 'ef', 'xo', 'T4', 'L2', '_4', 'by', 'ITEMS'];
const fnVals = [K, vl, k0, Vi, xr, b9, M4, _y, Zp, _9, ef, xo, T4, L2, _4, by, ITEMS];
new Function('window', ...fnNames, code)(windowMock, ...fnVals);
const ECO = windowMock.__RH_ECO__;
if (!ECO) { console.error('注入失败：__RH_ECO__ 未创建，错误=' + windowMock.__RH_DIAG_ERR__); process.exit(1); }

// ================= 测试框架 =================
let pass = 0, fail = 0;
function reset(devs, inv, stash, extra) {
  state = Object.assign({ inventory: inv || [], stash: stash || [], p2: Object.assign({ daysSurvived: 10, installedDevices: devs }, extra || {}) });
}
function cnt(arr, id) { return (arr || []).filter(x => x.defId === id).reduce((s, x) => s + (x.quantity || 1), 0); }
function check(name, cond, detail) {
  if (cond) { pass++; console.log('  [通过] ' + name); }
  else { fail++; console.log('  [失败] ' + name + (detail ? '  → ' + detail : '')); }
}
function farm(slots) { return { deviceDefId: 'hydroponic_box', level: 1, farmState: { slots: slots || [] } }; }
function incub(slots, feedStock, pending) {
  return { deviceDefId: 'eco_incubator', level: 1, incubatorState: { slots: slots || [], feedStock: feedStock || 0, pendingHatches: pending || [] } };
}

console.log('=== 1. 收获（成熟作物） ===');
reset([farm([{ id: 's1', seedDefId: 'seed_veg', row: 0, col: 0, stage: 'mature' }, { id: 's2', seedDefId: 'seed_veg', row: 0, col: 1, stage: 'growing' }])]);
ECO.harvestAllFarms();
const L1 = windowMock.__RH_ECO_LAST__;
check('收获数量=1', L1.harvest === 1, 'harvest=' + L1.harvest);
check('产物入仓 veg=3', cnt(state.stash, 'veg') === 3, 'veg=' + cnt(state.stash, 'veg'));
check('成熟槽已清空、未熟保留', state.p2.installedDevices[0].farmState.slots.length === 1);

console.log('=== 2. 种植（空槽+库存种子） ===');
reset([farm([])], [{ defId: 'seed_veg', quantity: 5 }]);
ECO.plantAll();
const L2r = windowMock.__RH_ECO_LAST__;
check('种下 4 株（2x2 满格）', L2r.plant === 4, 'plant=' + L2r.plant);
check('种子扣 4 剩 1', cnt(state.inventory, 'seed_veg') === 1, 'seed=' + cnt(state.inventory, 'seed_veg'));

console.log('=== 3. 催熟（在生长 -> mature） ===');
reset([farm([{ id: 'p1', seedDefId: 'seed_veg', row: 0, col: 0, stage: 'seedling' }])]);
ECO.ripenAll();
check('催熟 1 株', windowMock.__RH_ECO_LAST__.ripen === 1);
check('stage 变为 mature', state.p2.installedDevices[0].farmState.slots[0].stage === 'mature');

console.log('=== 4. 宰杀（成熟动物） ===');
reset([incub([{ id: 'a1', animalDefId: 'chicken', tier: 'adult', row: 0, col: 0 }, { id: 'a2', animalDefId: 'baby_chick', row: 0, col: 1 }])]);
ECO.slaughterAll();
check('宰杀 1 只', windowMock.__RH_ECO_LAST__.slaughter === 1, 'slaughter=' + windowMock.__RH_ECO_LAST__.slaughter);
check('产出 raw_chicken=2', cnt(state.stash, 'raw_chicken') === 2);

console.log('=== 5. 孵化（★本次修复：原来误用放入函数 b9） ===');
reset([incub([], 0, [])], [{ defId: 'chicken_egg', quantity: 3 }, { defId: 'duck_egg', quantity: 2 }]);
ECO.hatchAll();
const L5 = windowMock.__RH_ECO_LAST__;
check('孵化放入 5 枚蛋', L5.hatch === 5, 'hatch=' + L5.hatch);
check('pendingHatches=5', (state.p2.installedDevices[0].incubatorState.pendingHatches || []).length === 5,
  'pending=' + ((state.p2.installedDevices[0].incubatorState.pendingHatches || []).length));
check('鸡蛋扣完', cnt(state.inventory, 'chicken_egg') === 0);
check('鸭蛋扣完', cnt(state.inventory, 'duck_egg') === 0);

console.log('=== 6. 放入动物（幼崽进空槽） ===');
reset([incub([], 0, [])], [{ defId: 'baby_chick', quantity: 3 }]);
ECO.placeAllAnimals();
const L6 = windowMock.__RH_ECO_LAST__;
check('放入 3 只（2x2 只剩3格）', L6.place === 3, 'place=' + L6.place + ' msg=' + (L6.placeMsg || ''));
check('槽位占用=3', state.p2.installedDevices[0].incubatorState.slots.length === 3);
check('库存幼崽扣完', cnt(state.inventory, 'baby_chick') === 0);

console.log('=== 7. 喂食（★本次修复：原来误用清定时器函数 _4） ===');
reset([incub([], 0, [])], [{ defId: 'animal_feed', quantity: 10 }]);
ECO.feedAll();
const L7 = windowMock.__RH_ECO_LAST__;
check('补了 1 个孵化器', L7.feed === 1, 'feed=' + L7.feed);
check('feedStock=5（10份×0.5）', state.p2.installedDevices[0].incubatorState.feedStock === 5,
  'feedStock=' + state.p2.installedDevices[0].incubatorState.feedStock);
check('饲料扣 10', cnt(state.inventory, 'animal_feed') === 0);

console.log('=== 8. 浇水（★本次修复：原来误用广告查询 by） ===');
reset([farm([{ id: 'w1', seedDefId: 'seed_veg', row: 0, col: 0, stage: 'seedling', watered: false },
             { id: 'w2', seedDefId: 'seed_veg', row: 0, col: 1, stage: 'seedling', watered: false }])],
      [{ defId: 'water_bottle', quantity: 2 }]);
ECO.waterAll();
const L8 = windowMock.__RH_ECO_LAST__;
check('浇水 2 株', L8.water === 2, 'water=' + L8.water);
check('两株 watered=true', state.p2.installedDevices[0].farmState.slots.every(s => s.watered === true));
check('水瓶扣 2', cnt(state.inventory, 'water_bottle') === 0);

console.log('=== 9. 施肥 ===');
reset([farm([{ id: 'f1', seedDefId: 'seed_veg', row: 0, col: 0, stage: 'seedling', fertilized: false }])],
      [{ defId: 'fish_manure', quantity: 1 }]);
ECO.fertilizeAll();
check('施肥 1 株', windowMock.__RH_ECO_LAST__.fert === 1);
check('fertilized=true', state.p2.installedDevices[0].farmState.slots[0].fertilized === true);
check('鱼肥扣 1', cnt(state.inventory, 'fish_manure') === 0);

console.log('=== 10. 烹饪 ===');
reset([{ deviceDefId: 'electric_stove', level: 1 }], [], [{ defId: 'veg', quantity: 6 }], { chefAdvancedCookingRecipes: ['r1'] });
ECO.cookAll();
check('做出 1 道菜', windowMock.__RH_ECO_LAST__.cook === 1, 'cook=' + windowMock.__RH_ECO_LAST__.cook);
check('食材扣 2', cnt(state.stash, 'veg') === 4, 'veg=' + cnt(state.stash, 'veg'));
check('成品 dish1=1', cnt(state.stash, 'dish1') === 1);

console.log('=== 11. 一键全部完成（回归，不报错） ===');
reset([farm([{ id: 'm1', seedDefId: 'seed_veg', row: 0, col: 0, stage: 'mature' }]), incub([{ id: 'ad', animalDefId: 'chicken', tier: 'adult', row: 0, col: 0 }])],
      [{ defId: 'seed_veg', quantity: 2 }, { defId: 'water_bottle', quantity: 1 }]);
try { ECO.autoAll(); check('autoAll 执行无异常', true); }
catch (e) { check('autoAll 执行无异常', false, e.message); }

console.log('=== 12. 添加任意物品（★新增功能） ===');
const ITEM = windowMock.__RH_ITEM__;
check('物品表就绪', !!(ITEM && ITEM.ready && ITEM.ready()));
const lst = ITEM ? ITEM.list() : [];
check('物品表含 medkit 且中文名正确', lst.some(x => x.id === 'medkit' && x.name === '战地医疗包'),
  JSON.stringify(lst.find(x => x.id === 'medkit')));
reset([]);
var got = ITEM ? ITEM.add('medkit', 5, false) : 0;
check('背包添加 medkit×5', cnt(state.inventory, 'medkit') === 5, 'medkit=' + cnt(state.inventory, 'medkit'));
ITEM && ITEM.add('water_bottle', 3, true);
check('仓库添加 water_bottle×3', cnt(state.stash, 'water_bottle') === 3);
ITEM && ITEM.add('medkit', 2, false);
check('同物品再次添加合并堆叠', state.inventory.filter(x => x.defId === 'medkit').length === 1 && cnt(state.inventory, 'medkit') === 7);

console.log('=== 13. 添加装备（★新增功能） ===');
reset([]);
var inst = ITEM ? ITEM.addGear('gatling_gun', { level: 10, enhance: 5, upgrade: 3, rarity: 'artifact' }) : null;
var g = (state.inventory || [])[0];
check('addGear 返回实例', !!inst);
check('背包里出现装备条目', !!g && g.defId === 'gatling_gun');
check('等级=10', g && g.level === 10);
check('强化=5 改造=3', g && g.enhanceLevel === 5 && g.upgradeLevel === 3);
check('稀有度=artifact 且带神器来源', g && g.rarity === 'artifact' && g.artifactSourceBaseId === 'gatling_gun');
check('instanceId 为 rhgear_ 前缀且唯一', g && /^rhgear_/.test(g.instanceId));
check('statScale 在合理区间(0.5~3)', g && g.statScale >= 0.5 && g.statScale <= 3, 'statScale=' + (g && g.statScale));
check('默认词缀为空数组、耐久 9999', g && Array.isArray(g.affixes) && g.durability === 9999);

console.log('\n结果：通过 ' + pass + ' 项，失败 ' + fail + ' 项');
process.exit(fail ? 1 : 0);
