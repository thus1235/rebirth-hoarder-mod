// cdp_v110_loop.js - v1.10 真实按钮三连：种植→催熟→收获
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
    const head = await send(`(document.querySelector('#rhmod-panel .rhmod-head span')||{}).textContent || '(无)'`);
    const hasPlant = await send(`!!document.querySelector('#rhmod-panel [data-act="ecoPlant"]')`);
    console.log('面板:', head, '| 种植按钮:', hasPlant);

    const step = async (act, key, wait) => {
      await send(`document.querySelector('#rhmod-panel [data-act="${act}"]').click(); 1`);
      await new Promise(r => setTimeout(r, wait || 3500));
      const last = JSON.parse(await send('JSON.stringify(window.__RH_ECO__.last||{})'));
      const toast = await send(`(function(){var t=document.getElementById('rhmod-toast');return t?t.textContent:'(无toast)';})()`);
      return { v: last[key], toast: toast };
    };

    const st0 = await send(`(function(){var r={};window.__RH_UE__(function(prev){var e=(prev.p2.installedDevices||[]).filter(function(d){return d.deviceDefId==="hydroponic_box"});var slots=0;e.forEach(function(d){slots+=((d.farmState||{}).slots||[]).length});var seeds=0;(prev.inventory||[]).concat(prev.stash||[]).forEach(function(x){if(x&&typeof x.defId==='string'&&x.defId.indexOf('seed_')===0)seeds+=(x.quantity||1)});r={boxes:e.length,slots:slots,seeds:seeds};return prev;});return 1;})()`);
    await new Promise(r => setTimeout(r, 500));
    const s0 = JSON.parse(await send('JSON.stringify(window.__RH_STATE__||{})'));
    console.log('当前: 水培箱=' + s0.boxes + ' 已占槽=' + s0.slots + ' 库存种子=' + s0.seeds);

    const p1 = await step('ecoPlant', 'plant', 4000);
    console.log('① 点「一键种植」-> plant=' + p1.v + '  toast="' + p1.toast + '"');

    const p2 = await step('ecoRipen', 'ripen', 4000);
    console.log('② 点「催熟」-> ripen=' + p2.v + '  toast="' + p2.toast + '"');

    const p3 = await step('ecoHarvest', 'harvest', 4000);
    console.log('③ 点「收获」-> harvest=' + p3.v + '  产出=' + JSON.stringify((JSON.parse(await send('JSON.stringify(window.__RH_ECO__.last||{})'))).items || {}) + '  toast="' + p3.toast + '"');

    await send(`window.__RH_MOD_TOGGLE__ && window.__RH_MOD_TOGGLE__(); 'ok'`);
    const ok = p1.v > 0 && p2.v > 0 && p3.v > 0;
    console.log(ok ? '\n>>> v1.10 三键闭环全部通过' : '\n>>> 部分未通过（见上，多为无种子/无空槽）');
    clearTimeout(timer);
    process.exit(ok ? 0 : 2);
  } catch (e) { console.error('异常: ' + e.message); process.exit(3); }
};
