// cdp_eco_check.js - 生态功能深度诊断
// 1) 桥接与函数存在性  2) 只读探测 p2 设备  3) 实际调用一次 harvestAllFarms 验证链路
const wsUrl = process.argv[2];
if (!wsUrl) { console.error('需要 webSocketDebuggerUrl'); process.exit(1); }
const ws = new WebSocket(wsUrl);
let id = 0; const pend = {};
const timer = setTimeout(() => { console.error('超时'); process.exit(1); }, 40000);
function send(e) {
  return new Promise((res) => {
    const i = ++id; pend[i] = r;
    function r(m) {}
    ws.send(JSON.stringify({ id: i, method: 'Runtime.evaluate', params: { expression: e, returnByValue: true } }));
    pend[i] = (v) => res(v);
  });
}
ws.onmessage = (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pend[m.id]) { const f = pend[m.id]; delete pend[m.id]; f(m.result && m.result.result && m.result.result.value); }
};
ws.onerror = () => { console.error('WS错误'); process.exit(1); };

ws.onopen = async () => {
  try {
    const base = JSON.parse(await send(`JSON.stringify({
      eco: !!window.__RH_ECO__,
      ready: !!(window.__RH_ECO__ && window.__RH_ECO__.ready),
      probe: window.__RH_PROBE__ || 0,
      fn: window.__RH_ECO__ ? Object.keys(window.__RH_ECO__).join(',') : '(无)'
    })`));
    console.log('--- 生态桥接 ---');
    console.log((base.eco ? '[OK]  ' : '[FAIL] ') + '__RH_ECO__ 存在');
    console.log((base.ready ? '[OK]  ' : '[FAIL] ') + 'ready=' + base.ready);
    console.log('  函数: ' + base.fn);

    // 只读探测 p2 设备
    await send(`window.__RH_UE__(function(prev){ var d=(prev&&prev.p2&&prev.p2.installedDevices)||[]; var c={}; d.forEach(function(x){c[x.deviceDefId]=(c[x.deviceDefId]||0)+1}); var hyd=d.filter(function(x){return x.deviceDefId==='hydroponic_box'}); var mature=0, total=0; hyd.forEach(function(x){(x.farmState&&x.farmState.slots||[]).forEach(function(s){ if(s) {total++; if(s.stage==='mature') mature++;}})}); window.__RH_DIAG__={devices:d.length, cnt:c, hydSlots:total, mature:mature, recipes:(prev.p2&&prev.p2.chefAdvancedCookingRecipes||[]).length, days:(prev.p2&&prev.p2.daysSurvived)||0}; return prev; }); 'ok'`);
    await new Promise(r => setTimeout(r, 500));
    const diag = JSON.parse(await send('JSON.stringify(window.__RH_DIAG__||{})'));
    console.log('--- 游戏内设备数据（只读） ---');
    console.log('  设备总数: ' + diag.devices + '  类型: ' + JSON.stringify(diag.cnt));
    console.log('  水培箱槽位: ' + diag.hydSlots + '，其中成熟 ' + diag.mature);
    console.log('  菜谱: ' + diag.recipes + '  天数: ' + diag.days);

    // 实际调用一键收获（良性：收成熟作物入仓）
    if (base.eco && base.ready) {
      await send(`window.__RH_ECO__.harvestAllFarms(); 'ok'`);
      await new Promise(r => setTimeout(r, 3000));
      const last = JSON.parse(await send('JSON.stringify(window.__RH_ECO__.last||{})'));
      console.log('--- 实测 harvestAllFarms ---');
      console.log('  last 计数: ' + JSON.stringify(last));
      console.log((last.harvest > 0 || last.err === undefined ? '[OK]  ' : '[FAIL] ') + '收获执行完成（harvest=' + (last.harvest !== undefined ? last.harvest : 'n/a') + '）');
    }
    clearTimeout(timer);
    console.log('\n>>> 诊断完成');
    process.exit(0);
  } catch (e) { console.error('异常: ' + e.message); process.exit(3); }
};
