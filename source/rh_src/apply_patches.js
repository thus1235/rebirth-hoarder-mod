// apply_patches.js - 适配新版(2026-09)的 5 个基础补丁
const fs = require('fs');
const file = process.argv[2];
let s = fs.readFileSync(file, 'utf8');
const orig = s;

const patches = [
  // P1: 去掉定位器道具限制
  ['g=!Je&&!a.isActive&&d>1&&!gt.includes(d)', 'g=0', 1],
  // P2: 移除 bestLocalFloor 100 层上限
  ['Math.max(0,Math.min(100,n?.bestLocalFloor??0))', 'Math.max(0,n?.bestLocalFloor??0)', 1],
  // P3a: 进图默认选中最高已解锁楼层
  ['[de,K]=i.useState(()=>Math.max(H.startFloor,Math.min(a,r)))', '[de,K]=i.useState(()=>Math.max(H.startFloor,Math.min(a,v?Math.max(r,s):r)))', 1],
  // P3b: 同步 useEffect 默认楼层
  ['i.useEffect(()=>{const R=Math.max(H.startFloor,Math.min(a,r));K(R),O(String(R))},[H.startFloor,r,t,a])',
   'i.useEffect(()=>{const R=Math.max(H.startFloor,Math.min(a,v?Math.max(r,s):r));K(R),O(String(R))},[H.startFloor,r,t,a,s,v])', 1],
  // P4: 【2026-09 回退】战报确认 = 进入战利品封存箱(loot_box)三选一。
  //   此前改成"自动开全部宝箱+领卡牌+直接返回探索"，把本应三选一的封存箱默认全开，
  //   并因 lootBoxState 状态残缺导致界面卡住。现恢复游戏原版：确认战报后进入 loot_box，
  //   由玩家自行选择/开箱，走游戏自带流程。
  ['Ea=i.useCallback(()=>{if(k(n=>{if(!n.exitFloorPending)return{...n,battleReportState:null,phase:"loot_box"};if(n.pendingCardRewardChoices&&n.pendingCardRewardChoices.length>0){const d=Qe(n.pendingCardRewardChoices);return d?{...n,battleReportState:null,cardRewardState:d,pendingCardRewardChoices:null,phase:"card_reward"}:Kt({...n,battleReportState:null})}return Kt({...n,battleReportState:null})}),a.exitFloorPending&&!a.pendingCardRewardChoices?.length){const n=Kt({...a,battleReportState:null});z?.(n)}},[Qe,z,k,a])',
   'Ea=i.useCallback(()=>{if(k(n=>{if(!n.exitFloorPending)return{...n,battleReportState:null,phase:"loot_box"};if(n.pendingCardRewardChoices&&n.pendingCardRewardChoices.length>0){const d=Qe(n.pendingCardRewardChoices);return d?{...n,battleReportState:null,cardRewardState:d,pendingCardRewardChoices:null,phase:"card_reward"}:Kt({...n,battleReportState:null})}return Kt({...n,battleReportState:null})}),a.exitFloorPending&&!a.pendingCardRewardChoices?.length){const n=Kt({...a,battleReportState:null});z?.(n)}},[Qe,z,k,a])', 1],
];

let ok = true;
patches.forEach(([from, to, expect], idx) => {
  const count = s.split(from).length - 1;
  if (count !== expect) { console.error(`[PATCH ${idx + 1} 失败] 期望 ${expect} 处，实际 ${count} 处`); ok = false; }
  else { s = s.split(from).join(to); console.log(`[PATCH ${idx + 1} OK]`); }
});
if (!ok) { console.error('存在失败的补丁，未写入文件'); process.exit(1); }
fs.writeFileSync(file, s, 'utf8');
console.log(`写入完成: ${file} (${orig.length} -> ${s.length} 字节)`);
