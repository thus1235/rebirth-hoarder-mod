// cdp_ui_repro3.js - 按游戏语义(稀疏push)种3株 → 真实按钮催熟/收获
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

    // 找到第一个空余位置并 push 3 株（模拟游戏种植 x4）
    await send(`window.__RH_UE__(function(prev){
      if(!prev||!prev.p2) return prev;
      var hour=(prev.p2.daysSurvived||0)*24;
      var devs=prev.p2.installedDevices.map(function(d){
        if(d.deviceDefId!=="hydroponic_box") return d;
        var fs=d.farmState||{}; var slots=(fs.slots||[]).slice();
        var occ={}; slots.forEach(function(s){if(s)occ[s.row+"_"+s.col]=1;});
        var seeds=["seed_strawberry","seed_corn","seed_mushroom"];
        var placed=0;
        for(var R=0;R<(fs.gridRows||4)&&placed<3;R++) for(var C=0;C<(fs.gridCols||4)&&placed<3;C++){
          if(occ[R+"_"+C]) continue;
          slots.push({id:"plant_"+Date.now()+"_"+placed,seedDefId:seeds[placed],row:R,col:C,plantedAtHour:hour,growthProgress:0.05,stage:"seedling",fertilized:false});
          placed++;
        }
        if(!placed) return d;
        return Object.assign({},d,{level:Math.max(1,Math.floor(Number(d.level)||1),fs.level||1),farmState:Object.assign({},fs,{slots:slots})});
      });
      return Object.assign({},prev,{p2:Object.assign({},prev.p2,{installedDevices:devs})});
    }); 1`);
    await new Promise(r => setTimeout(r, 700));
    const n = JSON.parse(await send(`(function(){var r=null;window.__RH_UE__(function(prev){var c=0;prev.p2.installedDevices.forEach(function(d){if(d.deviceDefId==="hydroponic_box")(d.farmState&&d.farmState.slots||[]).forEach(function(s){if(s&&s.seedDefId)c++})});r=c;return prev;});return JSON.stringify({n:r});})()`));
    await new Promise(r => setTimeout(r, 500));
    console.log('注入后作物数:', n.n);

    // 真实按钮：催熟
    await send(`document.querySelector('#rhmod-panel [data-act="ecoRipen"]').click(); 1`);
    await new Promise(r => setTimeout(r, 3500));
    const rip = JSON.parse(await send('JSON.stringify(window.__RH_ECO__.last||{})'));
    const t2 = await send(`(function(){var t=document.getElementById('rhmod-toast');return t?t.textContent:'(无toast)';})()`);
    console.log('点「催熟」-> ripen=' + rip.ripen + '  toast="' + t2 + '"');

    // 真实按钮：收获
    await send(`document.querySelector('#rhmod-panel [data-act="ecoHarvest"]').click(); 1`);
    await new Promise(r => setTimeout(r, 3500));
    const hv = JSON.parse(await send('JSON.stringify(window.__RH_ECO__.last||{})'));
    const t3 = await send(`(function(){var t=document.getElementById('rhmod-toast');return t?t.textContent:'(无toast)';})()`);
    console.log('点「收获」-> harvest=' + hv.harvest + '  产出=' + JSON.stringify(hv.items||{}) + '  toast="' + t3 + '"');

    await send(`window.__RH_MOD_TOGGLE__ && window.__RH_MOD_TOGGLE__(); 'ok'`);
    const ok = rip.ripen >= 3 && hv.harvest >= 3;
    console.log(ok ? '\n>>> 真实按钮全流程通过（种→催熟→收）' : '\n>>> 仍有问题');
    clearTimeout(timer);
    process.exit(ok ? 0 : 2);
  } catch (e) { console.error('异常: ' + e.message); process.exit(3); }
};
