// cdp_ripen_test.js - 催熟→收获 全链路实测
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
    await send(`window.__RH_UE__(function(prev){var d=(prev.p2.installedDevices||[]).filter(function(x){return x.deviceDefId==="hydroponic_box"});var grow=0,mat=0;d.forEach(function(x){((x.farmState||{}).slots||[]).forEach(function(s){if(s&&s.seedDefId){if(s.stage==="mature")mat++;else grow++;}})});window.__RH_DIAG__={grow:grow,mat:mat};return prev;});1`);
    await new Promise(r => setTimeout(r, 500));
    const before = JSON.parse(await send('JSON.stringify(window.__RH_DIAG__)'));
    console.log('催熟前: 生长中=' + before.grow + '  已成熟=' + before.mat);

    await send(`window.__RH_ECO__.ripenAll();1`);
    await new Promise(r => setTimeout(r, 2500));
    const last = JSON.parse(await send('JSON.stringify(window.__RH_ECO__.last||{})'));
    console.log('催熟后 ripen =', last.ripen, ' err =', last.err);

    await send(`window.__RH_UE__(function(prev){var d=(prev.p2.installedDevices||[]).filter(function(x){return x.deviceDefId==="hydroponic_box"});var mat=0;d.forEach(function(x){((x.farmState||{}).slots||[]).forEach(function(s){if(s&&s.stage==="mature")mat++;})});window.__RH_DIAG__={mat:mat};return prev;});1`);
    await new Promise(r => setTimeout(r, 500));
    const after = JSON.parse(await send('JSON.stringify(window.__RH_DIAG__)'));
    console.log('催熟后已成熟槽位:', after.mat);
    console.log((last.ripen > 0 && after.mat === before.grow + before.mat ? '[OK]  ' : '[FAIL] ') + '催熟功能生效');

    // 收取
    await send(`window.__RH_ECO__.harvestAllFarms();1`);
    await new Promise(r => setTimeout(r, 2500));
    const last2 = JSON.parse(await send('JSON.stringify(window.__RH_ECO__.last||{})'));
    console.log('收获 harvest =', last2.harvest, ' 产出:', JSON.stringify(last2.items || {}));
    console.log((last2.harvest > 0 ? '[OK]  ' : '[FAIL] ') + '收获功能联动正常');

    const ok = last.ripen > 0 && last2.harvest > 0;
    clearTimeout(timer);
    console.log(ok ? '\n>>> 催熟→收获 全链路实测通过' : '\n>>> 未完全通过');
    process.exit(ok ? 0 : 2);
  } catch (e) { console.error('异常: ' + e.message); process.exit(3); }
};
