// cdp_ui_repro2.js - 造作物→真实按钮催熟/收获 复现（修正版）
const wsUrl = process.argv[2];
if (!wsUrl) { console.error('需要 webSocketDebuggerUrl'); process.exit(1); }
const ws = new WebSocket(wsUrl);
let id = 0; const pend = {};
const timer = setTimeout(() => { console.error('超时'); process.exit(1); }, 60000);
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
    await send(`window.__RH_MOD_TOGGLE__ && window.__RH_MOD_TOGGLE__(); 'ok'`);
    await new Promise(r => setTimeout(r, 600));

    // 造 3 株作物（填入第一个水培箱前 3 个空槽）
    await send(`window.__RH_UE__(function(prev){
      if(!prev||!prev.p2) return prev;
      var hour=(prev.p2.daysSurvived||0)*24;
      var devs=prev.p2.installedDevices.map(function(d){
        if(d.deviceDefId!=="hydroponic_box") return d;
        var fs=d.farmState||{}; var slots=(fs.slots||[]).slice();
        var seed=["seed_strawberry","seed_corn","seed_mushroom"];
        var seen=0;
        for(var i=0;i<slots.length&&seen<3;i++){
          if(slots[i]) continue;
          slots[i]={col:i%8,row:Math.floor(i/8),id:"plant_ui_"+Date.now()+"_"+i,seedDefId:seed[seen],stage:"seedling",growthProgress:0.05,watered:true,fertilized:false,plantedAtHour:hour};
          seen++;
        }
        if(!seen) return d;
        return Object.assign({},d,{level:Math.max(1,Math.floor(Number(d.level)||1),fs.level||1),farmState:Object.assign({},fs,{slots:slots})});
      });
      window.__RH_INJECTED__=1;
      return Object.assign({},prev,{p2:Object.assign({},prev.p2,{installedDevices:devs})});
    }); 1`);
    await new Promise(r => setTimeout(r, 700));
    const base = JSON.parse(await send(`JSON.stringify({ready:!!(window.__RH_ECO__&&window.__RH_ECO__.ready), inj:window.__RH_INJECTED__||0})`));
    console.log('桥接ready:', base.ready, ' 注入标记:', base.inj);

    // 走真实按钮：催熟
    await send(`document.querySelector('#rhmod-panel [data-act="ecoRipen"]').click(); 1`);
    await new Promise(r => setTimeout(r, 3500));
    const rip = JSON.parse(await send('JSON.stringify(window.__RH_ECO__.last||{})'));
    const toast2 = await send(`(function(){var t=document.getElementById('rhmod-toast');return t?t.textContent:'(无toast)';})()`);
    console.log('点「催熟」按钮 -> ripen=' + rip.ripen + '  toast="' + toast2 + '"');

    // 走真实按钮：收获
    await send(`document.querySelector('#rhmod-panel [data-act="ecoHarvest"]').click(); 1`);
    await new Promise(r => setTimeout(r, 3500));
    const hv = JSON.parse(await send('JSON.stringify(window.__RH_ECO__.last||{})'));
    const toast3 = await send(`(function(){var t=document.getElementById('rhmod-toast');return t?t.textContent:'(无toast)';})()`);
    console.log('点「收获」按钮 -> harvest=' + hv.harvest + '  产出=' + JSON.stringify(hv.items||{}) + '  toast="' + toast3 + '"');

    // 再次催熟（此时已无在长作物）
    await send(`document.querySelector('#rhmod-panel [data-act="ecoRipen"]').click(); 1`);
    await new Promise(r => setTimeout(r, 3000));
    const toast4 = await send(`(function(){var t=document.getElementById('rhmod-toast');return t?t.textContent:'(无toast)';})()`);
    console.log('再点「催熟」（已收完）-> toast="' + toast4 + '"');

    await send(`window.__RH_MOD_TOGGLE__ && window.__RH_MOD_TOGGLE__(); 'ok'`);
    const ok = rip.ripen >= 3 && hv.harvest >= 3;
    console.log(ok ? '\n>>> 真实按钮全流程通过' : '\n>>> 有问题');
    clearTimeout(timer);
    process.exit(ok ? 0 : 2);
  } catch (e) { console.error('异常: ' + e.message); process.exit(3); }
};
