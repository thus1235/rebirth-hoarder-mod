// cdp_place_final.js - v1.11 真实按钮放入实测
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
    console.log('面板:', head);

    const before = await send(`(function(){var r={};window.__RH_UE__(function(prev){var b=(prev.p2.installedDevices||[]).filter(function(d){return d.deviceDefId==="eco_incubator"});var occ=0,free=0;b.forEach(function(d){var gs=6;var s=(d.incubatorState||{}).slots||[];s.forEach(function(x){if(x)occ++});free+=gs*gs-occ});var an={};(prev.inventory||[]).concat(prev.stash||[]).forEach(function(x){if(x&&typeof x.defId==='string'&&x.defId.indexOf('baby_')===0)an[x.defId]=(an[x.defId]||0)+(x.quantity||1)});r={occ:occ,free:free,animals:an};return prev;});return 1;})()`);
    await new Promise(r => setTimeout(r, 600));
    const d0 = JSON.parse(await send('(function(){return JSON.stringify(window.__D__||{});})()'));
    console.log('放入前: 占用=' + d0.occ + ' 空格=' + d0.free + ' 库存幼崽=' + JSON.stringify(d0.animals));

    // 真实按钮：放入
    await send(`document.querySelector('#rhmod-panel [data-act="ecoPlace"]').click(); 'ok'`);
    await new Promise(r => setTimeout(r, 4000));
    const last = JSON.parse(await send('JSON.stringify(window.__RH_ECO__.last||{})'));
    const toast = await send(`(function(){var t=document.getElementById('rhmod-toast');return t?t.textContent:'(无toast)';})()`);
    console.log('点「放入」-> place=' + last.place + '  placeMsg="' + (last.placeMsg || '') + '"  toast="' + toast + '"');

    const after = await send(`(function(){var r=0;window.__RH_UE__(function(prev){(prev.p2.installedDevices||[]).forEach(function(d){if(d.deviceDefId==="eco_incubator")((d.incubatorState||{}).slots||[]).forEach(function(x){if(x)r++})});return prev;});return 1;})()`);
    await new Promise(r => setTimeout(r, 600));
    const occAfter = await send('(function(){var r=0;window.__RH_UE__(function(prev){(prev.p2.installedDevices||[]).forEach(function(d){if(d.deviceDefId==="eco_incubator")((d.incubatorState||{}).slots||[]).forEach(function(x){if(x)r++})});return prev;});return r;})()');
    console.log('放入后孵化器占用:', occAfter, '（放入前 ' + d0.occ + '）');

    const ok = last.place > 0 && occAfter > d0.occ;
    console.log(ok ? '\n>>> 放入功能修复验证通过' : '\n>>> 仍有问题');
    clearTimeout(timer);
    process.exit(ok ? 0 : 2);
  } catch (e) { console.error('异常: ' + e.message); process.exit(3); }
};
