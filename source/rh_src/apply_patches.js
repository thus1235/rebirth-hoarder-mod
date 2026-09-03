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
  // P4: 战报确认 = 自动开全部宝箱 + 自动领卡牌 + 返回探索/进下一层（新版变量名）
  ['Ea=i.useCallback(()=>{if(k(n=>{if(!n.exitFloorPending)return{...n,battleReportState:null,phase:"loot_box"};if(n.pendingCardRewardChoices&&n.pendingCardRewardChoices.length>0){const d=Qe(n.pendingCardRewardChoices);return d?{...n,battleReportState:null,cardRewardState:d,pendingCardRewardChoices:null,phase:"card_reward"}:Kt({...n,battleReportState:null})}return Kt({...n,battleReportState:null})}),a.exitFloorPending&&!a.pendingCardRewardChoices?.length){const n=Kt({...a,battleReportState:null});z?.(n)}},[Qe,z,k,a])',
   'Ea=i.useCallback(()=>{k(n=>{let x={...n,battleReportState:null};if(x.lootBoxState&&!x.lootBoxState.allOpened){const items=(x.lootBoxState.boxes||[]).flatMap(b=>b.items||[]);const crystals=(x.lootBoxState.boxes||[]).reduce((s,b)=>s+(b.crystals||0),0);x={...x,lootStash:Tt(x.lootStash,items),totalCrystals:(x.totalCrystals||0)+crystals,lootBoxState:{...x.lootBoxState,boxes:x.lootBoxState.boxes.map(b=>({...b,opened:true})),allOpened:true}}}if(!x.exitFloorPending)return{...x,phase:"floor_explore"};if(x.pendingCardRewardChoices&&x.pendingCardRewardChoices.length>0){const d=Qe(x.pendingCardRewardChoices);if(d){const cards=(d.choices||[]).slice(0,1);if(cards.length>0){const col=cards.reduce((b,id)=>to(b,id,"white",1),we);v({...r,towerCardCollection:col})}x={...x,cardRewardState:d,pendingCardRewardChoices:null}}return Kt(x)}return Kt(x)}),a.exitFloorPending&&!a.pendingCardRewardChoices?.length&&(z?.(Kt({...a,battleReportState:null})))},[Qe,z,k,Tt,Kt,to,we,v,r,a])', 1],
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
