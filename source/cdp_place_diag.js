// cdp_place_diag.js - 诊断"一键放入动物"：识别条件逐项检查（只读）
const wsUrl = process.argv[2];
if (!wsUrl) { console.error('需要 webSocketDebuggerUrl'); process.exit(1); }
const ws = new WebSocket(wsUrl);
let id = 0; const pend = {};
const timer = setTimeout(() => { console.error('超时'); process.exit(1); }, 40000);
function send(e) {
  return new Promise((res) => {
    const i = ++id; pend[i] = res;
    ws.send(JSON.stringify({ id: i, method: 'Runtime.evaluate', params: { expression: e, returnByValue: true } }));
  });
}
ws.onmessage = (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pend[m.id]) { const f = pend[m.id]; delete pend[m.id]; f(m.result && m.result.result && m.result.result.value); }
};
ws.onerror = () => { console.error('WS错误'); process.exit(1); };

ws.onopen = async () => {
  try {
    const expr = `(function(){
      try {
        var out = {};
        out.hasY9 = (typeof y9 === 'function');
        out.hasXo = (typeof xo !== 'undefined');
        out.hasEf = (typeof ef === 'function');
        if (out.hasXo) { out.xoCount = Object.keys(xo).length; out.xoSample = Object.keys(xo).slice(0, 15); }
        var found = {}, foundEggs = {}, inv = [], st = [];
        if (window.__RH_UE__) window.__RH_UE__(function(prev){
          inv = prev.inventory || []; st = prev.stash || [];
          function collect(arr){
            (arr||[]).forEach(function(x){
              var d = x && x.defId;
              if (!d || typeof xo === 'undefined' || !xo[d]) return;
              var isEgg = (typeof ef === 'function') ? ef(d) : null;
              if (isEgg === true) foundEggs[d] = (foundEggs[d]||0) + (x.quantity||1);
              else found[d] = (found[d]||0) + (x.quantity||1);
            });
          }
          collect(inv); collect(st);
          out.boxes = (prev.p2.installedDevices||[]).filter(function(d){return d.deviceDefId==='eco_incubator'}).map(function(d){
            var stt = d.incubatorState || {};
            var slots = stt.slots || [];
            var occ = slots.filter(function(s){return s}).length;
            var gs = 6;
            try { if (typeof Vi === 'function') gs = Vi(stt, d.level).gridSize || 6; } catch(e) {}
            return 'Lv' + d.level + ' grid=' + gs + 'x' + gs + ' 占用=' + occ + ' 空格=' + (gs*gs - occ);
          });
          out.feedStock = (prev.p2.installedDevices||[]).filter(function(d){return d.deviceDefId==='eco_incubator'}).map(function(d){
            var stt = d.incubatorState || {}; return (stt.feedStock||0) + '/' + ((typeof Vi==='function') ? (Vi(stt,d.level).feedCapacity||'?') : '?');
          });
          return prev;
        });
        out.animalsInInv = found;
        out.eggsInInv = foundEggs;
        out.invSample = inv.map(function(x){return x.defId}).slice(0, 40);
        out.stashSample = st.map(function(x){return x.defId}).slice(0, 40);
        return JSON.stringify(out);
      } catch(e) { return JSON.stringify({diagErr: e.message}); }
    })()`;
    const raw = await send(expr);
    const d = JSON.parse(raw);
    console.log('--- 函数可用性 ---');
    console.log('y9(放入):', d.hasY9, '| xo(动物配置):', d.hasXo, '(' + (d.xoCount || 0) + '种)', '| ef(蛋判断):', d.hasEf);
    if (d.xoSample) console.log('  xo 动物示例:', JSON.stringify(d.xoSample));
    console.log('--- 库存/仓库中识别到的动物 ---');
    console.log('  可放入:', JSON.stringify(d.animalsInInv || {}));
    console.log('  蛋(不可放入,应走孵化):', JSON.stringify(d.eggsInInv || {}));
    console.log('--- 孵化器槽位 ---');
    (d.boxes || []).forEach(b => console.log('  ' + b));
    console.log('  饲料储备:', JSON.stringify(d.feedStock || []));
    console.log('--- 库存 defId 采样（前40） ---');
    console.log('  ' + JSON.stringify(d.invSample || []));
    console.log('--- 仓库 defId 采样（前40） ---');
    console.log('  ' + JSON.stringify(d.stashSample || []));
    clearTimeout(timer);
    process.exit(0);
  } catch (e) { console.error('异常: ' + e.message); process.exit(3); }
};
