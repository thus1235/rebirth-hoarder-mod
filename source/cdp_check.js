// cdp_check.js - 通过 CDP 检测游戏内 MOD 注入状态
// 用法: node cdp_check.js <webSocketDebuggerUrl>
const wsUrl = process.argv[2];
if (!wsUrl) { console.error('需要 webSocketDebuggerUrl'); process.exit(1); }

const expr = `JSON.stringify({
  panelReady: !!window.__RH_PANEL_READY__,
  panelDom: !!document.getElementById('rhmod-panel'),
  modBridge: typeof window.__RH_MOD__,
  ecoReady: !!(window.__RH_ECO__ && window.__RH_ECO__.ready),
  probe: window.__RH_PROBE__ || 0,
  bodyChildren: document.body ? document.body.children.length : -1,
  title: document.title
})`;

const ws = new WebSocket(wsUrl);
let done = false;
const timer = setTimeout(() => { if (!done) { console.error('超时'); process.exit(1); } }, 15000);

ws.onopen = () => {
  ws.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate', params: { expression: expr, returnByValue: true } }));
};
ws.onmessage = (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.id === 1) {
    done = true;
    clearTimeout(timer);
    const val = msg.result && msg.result.result && msg.result.result.value;
    console.log('--- 游戏内检测结果 ---');
    try {
      const o = JSON.parse(val);
      const mark = (b) => (b ? '[OK]  ' : '[--]  ');
      console.log(mark(o.panelReady) + 'F8 面板脚本已注入  (__RH_PANEL_READY__=' + o.panelReady + ')');
      console.log(mark(o.panelDom) + '面板 DOM 已创建');
      console.log(mark(o.modBridge === 'object') + '战斗桥接 __RH_MOD__ (object=正在废墟探索中, null=未进图, 正常)');
      console.log(mark(o.ecoReady) + '生态打理桥接 __RH_ECO__.ready=' + o.ecoReady);
      console.log(mark(o.probe > 0) + '组件渲染探针 __RH_PROBE__=' + o.probe);
      console.log('  页面: ' + o.title + '  body 子节点: ' + o.bodyChildren);
      const allOk = o.panelReady && o.panelDom && o.ecoReady && o.probe > 0;
      console.log(allOk ? '\n>>> MOD 注入验证通过' : '\n>>> 部分未就绪（若刚进主菜单请稍候再测）');
      process.exit(allOk ? 0 : 2);
    } catch (e) {
      console.log('原始返回:', val, JSON.stringify(msg.result).slice(0, 300));
      process.exit(3);
    }
  }
};
ws.onerror = (e) => { console.error('WS 错误'); process.exit(1); };
