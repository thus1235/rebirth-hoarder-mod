// cdp_check2.js - 真机验证面板（v1.7）：UI 控件 + 小型化 + 全局状态接口 p2 探测
const wsUrl = process.argv[2];
if (!wsUrl) { console.error('需要 webSocketDebuggerUrl'); process.exit(1); }

const ws = new WebSocket(wsUrl);
let id = 0;
const pending = {};
const timer = setTimeout(() => { console.error('超时'); process.exit(1); }, 25000);

function send(expr) {
  return new Promise((res) => {
    const i = ++id;
    pending[i] = res;
    ws.send(JSON.stringify({ id: i, method: 'Runtime.evaluate', params: { expression: expr, returnByValue: true } }));
  });
}

ws.onmessage = (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.id && pending[msg.id]) {
    const v = msg.result && msg.result.result && msg.result.result.value;
    pending[msg.id](v);
    delete pending[msg.id];
  }
};

ws.onopen = async () => {
  try {
    const base = JSON.parse(await send(`JSON.stringify({
      panelReady: !!window.__RH_PANEL_READY__,
      ecoReady: !!(window.__RH_ECO__ && window.__RH_ECO__.ready),
      probe: window.__RH_PROBE__ || 0
    })`));
    console.log('--- 注入状态 ---');
    console.log((base.panelReady ? '[OK]  ' : '[FAIL] ') + 'F8 面板脚本已初始化');
    console.log((base.ecoReady ? '[OK]  ' : '[FAIL] ') + '生态桥接就绪 (probe=' + base.probe + ')');

    // 全局状态接口探测（还原进度修复路径验证）：no-op updater，不改任何数据
    await send(`window.__RH_UE__ && window.__RH_UE__(function(prev){ window.__RH_PROBE_P2__ = !!(prev && prev.p2); window.__RH_PROBE_TCP__ = !!(prev && prev.p2 && prev.p2.exploration && prev.p2.exploration.towerChapterProgress); return prev; }); 'ok'`);
    await new Promise(r => setTimeout(r, 600));
    const probe = JSON.parse(await send(`JSON.stringify({ ue: typeof window.__RH_UE__, hasP2: window.__RH_PROBE_P2__ === true, hasTCP: window.__RH_PROBE_TCP__ === true })`));
    console.log('--- 还原进度修复路径（全局状态接口）---');
    console.log((probe.ue === 'function' ? '[OK]  ' : '[FAIL] ') + '__RH_UE__ 全局状态接口可用');
    console.log((probe.hasP2 ? '[OK]  ' : '[FAIL] ') + '状态中含 p2（之前"无p2状态"的根因已消除）');
    console.log((probe.hasTCP ? '[OK]  ' : '[FAIL] ') + 'p2.exploration.towerChapterProgress 可达（还原写入目标就位）');

    // 打开面板检查控件
    await send(`window.__RH_MOD_TOGGLE__ && window.__RH_MOD_TOGGLE__(); 'ok'`);
    await new Promise(r => setTimeout(r, 800));
    const ui = JSON.parse(await send(`JSON.stringify({
      head: (document.querySelector('#rhmod-panel .rhmod-head span') || {}).textContent || '(面板未创建)',
      restoreProgress: !!document.querySelector('#rhmod-panel [data-act="restoreProgress"]'),
      miniBtn: !!document.getElementById('rhmod-mini'),
      btnCount: document.querySelectorAll('#rhmod-panel button[data-act]').length
    })`));
    console.log('--- 面板 UI ---');
    console.log('  面板标题: ' + ui.head);
    console.log((ui.restoreProgress ? '[OK]  ' : '[FAIL] ') + '还原已解锁楼层按钮');
    console.log((ui.miniBtn ? '[OK]  ' : '[FAIL] ') + '小型化按钮（─）');

    // 小型化开关测试
    await send(`document.getElementById('rhmod-mini').click(); 'ok'`);
    await new Promise(r => setTimeout(r, 300));
    const mini = JSON.parse(await send(`JSON.stringify({
      on: document.getElementById('rhmod-panel').classList.contains('rhmod-mini'),
      title: (document.querySelector('#rhmod-panel .rhmod-head span') || {}).textContent,
      btn: document.getElementById('rhmod-mini').textContent
    })`));
    console.log((mini.on && mini.title === '🔧 RH' && mini.btn === '▣' ? '[OK]  ' : '[FAIL] ') + '小型化生效（标题="' + mini.title + '"，按钮="' + mini.btn + '"）');
    await send(`document.getElementById('rhmod-mini').click(); 'ok'`);
    await new Promise(r => setTimeout(r, 300));
    const back = await send(`document.getElementById('rhmod-panel').classList.contains('rhmod-mini') ? 'mini' : 'full'`);
    console.log((back === 'full' ? '[OK]  ' : '[FAIL] ') + '展开恢复正常');
    await send(`window.__RH_MOD_TOGGLE__ && window.__RH_MOD_TOGGLE__(); 'ok'`);

    const ok = base.panelReady && base.ecoReady && probe.ue === 'function' && probe.hasP2 && probe.hasTCP &&
      ui.restoreProgress && ui.miniBtn && mini.on && back === 'full' && /v1\.7/.test(ui.head);
    clearTimeout(timer);
    console.log(ok ? '\n>>> v1.7 真机验证全部通过' : '\n>>> 验证未完全通过');
    process.exit(ok ? 0 : 2);
  } catch (e) {
    console.error('异常: ' + e.message);
    process.exit(3);
  }
};
ws.onerror = () => { console.error('WS 错误'); process.exit(1); };
