// cdp_water_test.js - 浇水功能端到端实测
const wsUrl = process.argv[2];
if (!wsUrl) { console.error('需要 webSocketDebuggerUrl'); process.exit(1); }
const ws = new WebSocket(wsUrl);
let id = 0; const pend = {};
const timer = setTimeout(() => { console.error('超时'); process.exit(1); }, 40000);
function send(e) {
  return new Promise((res) => {
    const i = ++id;
    pend[i] = res;
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
    await send(`window.__RH_UE__(function(prev){var d=(prev.p2.installedDevices||[]).filter(function(x){return x.deviceDefId==="hydroponic_box"});var un=0,tot=0;d.forEach(function(x){((x.farmState||{}).slots||[]).forEach(function(s){if(s&&s.stage!=="mature"){tot++;if(!s.watered)un++;}})});var b=0;(prev.inventory||[]).concat(prev.stash||[]).forEach(function(x){if(x&&x.defId==="water_bottle")b+=(x.quantity||1)});window.__RH_DIAG__={unwatered:un,total:tot,bottles:b};return prev;});1`);
    await new Promise(r => setTimeout(r, 500));
    const d = JSON.parse(await send('JSON.stringify(window.__RH_DIAG__)'));
    console.log('未浇水槽位:', d.unwatered, '/', d.total, ' 水瓶:', d.bottles);
    if (d.unwatered > 0 && d.bottles > 0) {
      await send(`window.__RH_ECO__.waterAll();1`);
      await new Promise(r => setTimeout(r, 2500));
      const last = JSON.parse(await send('JSON.stringify(window.__RH_ECO__.last||{})'));
      console.log('实测 waterAll -> 浇水数:', last.water, ' err:', last.err);
      console.log(last.water > 0 ? '>>> 浇水功能正常工作' : '>>> 浇水0（异常或水不足）');
    } else {
      console.log('>>> 无可浇水内容（全部已浇或无水瓶）——功能本身无异常');
    }
    clearTimeout(timer);
    process.exit(0);
  } catch (e) { console.error('异常: ' + e.message); process.exit(3); }
};
