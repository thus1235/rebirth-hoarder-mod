// cdp_ui_repro.js - 完整复现：按玩家真实路径点面板按钮（造3株作物验证催熟/收获）
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
    // 1) 打开面板
    await send(`window.__RH_MOD_TOGGLE__ && window.__RH_MOD_TOGGLE__(); 'ok'`);
    await new Promise(r => setTimeout(r, 800));
    const ui = JSON.parse(await send(`JSON.stringify({
      head: (document.querySelector('#rhmod-panel .rhmod-head span')||{}).textContent,
      btn: !!document.querySelector('#rhmod-panel [data-act="ecoRipen"]'),
      harvestBtn: !!document.querySelector('#rhmod-panel [data-act="ecoHarvest"]'),
      ecoReady: !!(window.__RH_ECO__ && window.__RH_ECO__.ready)
    })`));
    console.log('面板:', ui.head, '| 催熟按钮:', ui.btn, '| 收获按钮:', ui.harvestBtn, '| 生态桥接ready:', ui.ecoReady);

    // 2) 先按玩家路径点一次（此时无作物，看提示）
    await send(`document.querySelector('#rhmod-panel [data-act="ecoRipen"]').click(); 'ok'`);
    await new Promise(r => setTimeout(r, 3000));
    let toast1 = await send(`(document.getElementById('rhmod-toast')||{}).textContent || '(无toast)'`);
    let rip1 = JSON.parse(await send('JSON.stringify(window.__RH_ECO__.last||{})'));
    console.log('无作物时点「催熟」 -> toast: "' + toast1 + '"  ripen=' + rip1.ripen);

    // 3) 造 3 株生长中作物（stage seedling/growing）到第一个水培箱空槽，模拟"刚种下"
    const plant = await send(`window.__RH_UE__(function(prev){var hour=(prev.p2.daysSurvived||0)*24+((prev.hoursSurvived)||0);var devs=prev.p2.installedDevices.map(function(d){ if(d.deviceDefId!=="hydroponic_box")return d; var fs=d.farmState||{}; var slots=(fs.slots||[]).slice(); var seen=0; var defs=[["seed_strawberry","strawberry"],["seed_corn","corn"],["seed_mushroom","mushroom"]]; for(var i=0;i<slots.length&&seen<3;i++){ if(slots[i])continue; slots[i]={col:i%8,row:Math.floor(i/8),id:"plant_test_"+Date.now()+"_"+i,seedDefId:defs[seen][0],stage:"seedling",growthProgress:0.05,watered:true,fertilized:false,plantedAtHour:hour}; seen++; } if(!seen)return prev; return Object.assign({},prev,{p2:Object.assign({},prev.p2,{installedDevices:devs})}); }); 'ok'`);
    await new Promise(r => setTimeout(r, 600));
    const cnt = JSON.parse(await send(`window.__RH_UE__(function(prev){var n=0;prev.p2.installedDevices.forEach(function(d){if(d.deviceDefId==="hydroponic_box")(d.farmState&&d.farmState.slots||[]).forEach(function(s){if(s&&s.seedDefId)n++})});window.__RH_X__=n;return prev});'x'`));
    await new Promise(r => setTimeout(r, 400));
    const cnt2 = await send('window.__RH_X__');
    console.log('已注入 ' + cnt2 + ' 株测试作物到空槽');

    // 4) 走真实按钮：点「催熟」
    await send(`document.querySelector('#rhmod-panel [data-act="ecoRipen"]').click(); 'ok'`);
    await new Promise(r => setTimeout(r, 3500));
    const rip2 = JSON.parse(await send('JSON.stringify(window.__RH_ECO__.last||{})'));
    const toast2 = await send(`(document.getElementById('rhmod-toast')||{}).textContent || '(无toast)'`);
    console.log('有点作物时点「催熟」 -> toast: "' + toast2 + '"  ripen=' + rip2.ripen);

    // 5) 走真实按钮：点「收获」
    await send(`document.querySelector('#rhmod-panel [data-act="ecoHarvest"]').click(); 'ok'`);
    await new Promise(r => setTimeout(r, 3500));
    const hv = JSON.parse(await send('JSON.stringify(window.__RH_ECO__.last||{})'));
    const toast3 = await send(`(document.getElementById('rhmod-toast')||{}).textContent || '(无toast)'`);
    console.log('点「收获」 -> toast: "' + toast3 + '"  harvest=' + hv.harvest);

    // 6) 控制台错误检查
    const errs = await send(`(window.__RH_ERR_ARR__||[]).join(' | ') || '(未捕获到运行错误)'`);

    await send(`window.__RH_MOD_TOGGLE__ && window.__RH_MOD_TOGGLE__(); 'ok'`);
    const ok = ui.btn && rip2.ripen >= 3 && hv.harvest >= 3;
    console.log(ok ? '\n>>> 真实按钮路径验证通过（催熟' + rip2.ripen + '株→收获' + hv.harvest + '株）' : '\n>>> 仍有问题');
    console.log('控制台错误:', errs);
    clearTimeout(timer);
    process.exit(ok ? 0 : 2);
  } catch (e) { console.error('异常: ' + e.message); process.exit(3); }
};
