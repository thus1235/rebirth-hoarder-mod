// RH 内置修改器面板 - 注入到 index.js 开头
;(function () {
  'use strict';
  // 全局防重复：脚本被重复加载（HMR/多实例/多窗口）时，整个初始化只执行一次，
  // 否则会创建多个面板、注册多个 F8 监听。
  if (window.__RH_PANEL_READY__) return;
  window.__RH_PANEL_READY__ = true;
  var KEY = 'F8';
  var panel = null, statusEl = null, toastEl = null, toastTimer = null;

  function $(id) { return document.getElementById(id); }

  function ensure() {
    if (panel && panel.isConnected) return;
    panel = document.createElement('div');
    panel.id = 'rhmod-panel';
    panel.className = 'rhmod-hidden'; // 初始隐藏，第一次按 F8 打开
    panel.innerHTML =
      '<div class="rhmod-head"><span>🔧 RH 内置修改器 v1.10</span><button id="rhmod-mini">─</button><button id="rhmod-x">✕</button></div>' +
      '<div class="rhmod-status">状态：<span id="rhmod-status-text">检测中…</span></div>' +
      '<div class="rhmod-btns">' +
      '<button data-act="instantWin">⚡ 当前战斗直接胜利</button>' +
      '<button data-act="autoWin" id="rhmod-autowin">🎯 自动秒杀模式：关</button>' +
      '<button data-act="unlockAll">🔓 一键解锁全部楼层</button>' +
      '<div class="rhmod-row"><input id="rhmod-unlock-floor" type="number" min="0" max="999" placeholder="楼层号，如 30"><button data-act="unlockTo">🔓 解锁到指定楼层</button></div>' +
      '<button data-act="restoreProgress">📉 还原已解锁楼层到输入的层数</button>' +
      '<button data-act="restoreFloors">↩️ 仅还原MOD解锁（不改动真实进度）</button>' +
      '<button data-act="jumpTop">🔼 跳到当前区域最高层</button>' +
      '<button data-act="forceExit">🚪 强制撤离当前区域</button>' +
      '<button data-act="ecoHarvest">🌾 一键收获全部种植</button>' +
      '<button data-act="ecoPlant">🌱 一键种植空槽（用库存种子）</button>' +
      '<button data-act="ecoRipen">🌱 一键催熟全部作物（立即成熟）</button>' +
      '<button data-act="ecoWater">💧 一键浇水全部</button>' +
      '<button data-act="ecoFert">🧪 一键施肥全部</button>' +
      '<button data-act="ecoSlaughter">🐄 一键宰杀全部养殖</button>' +
      '<button data-act="ecoHatch">🥚 一键孵化全部蛋</button>' +
      '<button data-act="ecoPlace">🐣 一键放入全部动物</button>' +
      '<button data-act="ecoFeed">🍖 一键喂食补满饲料</button>' +
      '<button data-act="ecoCook">🍳 一键烹饪全部菜谱</button>' +
      '<button data-act="ecoAll">✨ 一键全部完成（种植+养殖+孵化+烹饪）</button>' +
      '<button data-act="ecoAuto" id="rhmod-ecoauto">🤖 自动打理：关</button>' +
      '</div>' +
      '<div class="rhmod-note">已内置：战斗后自动领奖 / 楼层自由选择(无需定位器) / 默认最高层<br>解锁楼层：全部解锁 或 解锁到指定楼层（本次启动内有效）<br>📉 还原已解锁楼层：改写真实楼层进度（含自己打上去的），填 0 = 清空该区域进度；游戏自动存档后生效，建议先用存档修改器备份<br>「仅还原MOD解锁」只撤销 MOD 的解锁标志，不动真实进度<br>生态打理：收获/浇水/施肥/宰杀/孵化/放养/喂食/烹饪（自动模式每 15 秒执行一次）<br>按 ' + KEY + ' 打开或关闭面板</div>';
    var css = document.createElement('style');
    css.textContent =
      '#rhmod-panel{position:fixed;top:80px;right:16px;width:300px;z-index:2147483000;background:rgba(10,14,22,.96);' +
      'border:1px solid rgba(120,160,255,.35);border-radius:12px;padding:12px 14px;color:#e2e8f0;' +
      "font-family:'Microsoft YaHei UI','PingFang SC',sans-serif;font-size:13px;box-shadow:0 8px 40px rgba(0,0,0,.6);user-select:none}" +
      '#rhmod-panel .rhmod-head{display:flex;justify-content:space-between;align-items:center;font-weight:700;color:#93c5fd;margin-bottom:8px;cursor:move;user-select:none}' +
      '#rhmod-panel .rhmod-x{cursor:pointer;background:none;border:none;color:#94a3b8;font-size:14px;line-height:1}' +
      '#rhmod-panel .rhmod-status{font-size:12px;color:#94a3b8;margin-bottom:10px}' +
      '#rhmod-panel .rhmod-btns{display:flex;flex-direction:column;gap:8px;max-height:56vh;overflow-y:auto;padding-right:4px}' +
      '#rhmod-panel .rhmod-btns button{cursor:pointer;border:none;border-radius:8px;padding:9px 10px;font-size:13px;font-weight:600;' +
      'color:#0b1220;background:linear-gradient(135deg,#60a5fa,#818cf8);transition:filter .15s}' +
      '#rhmod-panel .rhmod-row{display:flex;gap:6px;align-items:stretch}' +
      '#rhmod-panel .rhmod-row input{flex:1;min-width:0;background:#0b1220;border:1px solid rgba(120,160,255,.4);border-radius:8px;color:#e2e8f0;padding:8px 10px;font-size:13px;outline:none}' +
      '#rhmod-panel .rhmod-row button{white-space:nowrap;flex:0 0 auto}' +
      '#rhmod-panel .rhmod-head button{cursor:pointer;background:none;border:none;color:#94a3b8;font-size:14px;line-height:1;padding:0 0 0 8px}' +
      '#rhmod-panel.rhmod-mini{width:auto!important;min-width:0;padding:7px 12px}' +
      '#rhmod-panel.rhmod-mini .rhmod-status,#rhmod-panel.rhmod-mini .rhmod-btns,#rhmod-panel.rhmod-mini .rhmod-note{display:none}' +
      '#rhmod-panel .rhmod-btns button:hover{filter:brightness(1.12)}' +
      '#rhmod-panel .rhmod-note{margin-top:10px;font-size:11px;color:#64748b;line-height:1.6}' +
      '#rhmod-panel.rhmod-hidden{display:none}' +
      '#rhmod-toast{position:fixed;top:120px;left:50%;transform:translateX(-50%);z-index:2147483001;background:rgba(15,23,42,.96);' +
      'border:1px solid rgba(120,160,255,.4);border-radius:10px;padding:10px 18px;color:#e2e8f0;font-size:13px;' +
      "font-family:'Microsoft YaHei UI',sans-serif;box-shadow:0 6px 24px rgba(0,0,0,.5);display:none}";
    document.head.appendChild(css);
    document.body.appendChild(panel);
    var x = document.getElementById('rhmod-x');
    if (x) x.onclick = hide;
    // 小型化：缩成标题条（状态记忆在 localStorage）
    var miniBtn = document.getElementById('rhmod-mini');
    var titleEl = panel.querySelector('.rhmod-head span');
    function setMini(on) {
      panel.classList.toggle('rhmod-mini', !!on);
      if (titleEl) titleEl.textContent = on ? '🔧 RH' : '🔧 RH 内置修改器 v1.10';
      if (miniBtn) miniBtn.textContent = on ? '▣' : '─';
      try { localStorage.setItem('rhmod_mini', on ? '1' : '0'); } catch (e) {}
    }
    if (miniBtn) miniBtn.onclick = function () { setMini(!panel.classList.contains('rhmod-mini')); };
    try { if (localStorage.getItem('rhmod_mini') === '1') setMini(true); } catch (e) {}
    Array.prototype.forEach.call(panel.querySelectorAll('button[data-act]'), function (b) {
      b.onclick = function () { run(b.getAttribute('data-act'), b); };
    });
    // 恢复上次拖拽位置
    try {
      var saved = JSON.parse(localStorage.getItem('rhmod_panel_pos') || 'null');
      if (saved && saved.left && saved.top) {
        panel.style.left = saved.left;
        panel.style.top = saved.top;
        panel.style.right = 'auto';
      }
    } catch (e) {}
    // 拖拽移动（按住标题栏）
    var head = panel.querySelector('.rhmod-head');
    if (head) {
      head.addEventListener('mousedown', function (e) {
        if (e.button !== 0) return;
        var startX = e.clientX, startY = e.clientY;
        var rect = panel.getBoundingClientRect();
        var origLeft = rect.left, origTop = rect.top;
        function move(ev) {
          panel.style.left = (origLeft + ev.clientX - startX) + 'px';
          panel.style.top = (origTop + ev.clientY - startY) + 'px';
          panel.style.right = 'auto';
        }
        function up() {
          document.removeEventListener('mousemove', move);
          document.removeEventListener('mouseup', up);
          try {
            localStorage.setItem('rhmod_panel_pos', JSON.stringify({ left: panel.style.left, top: panel.style.top }));
          } catch (e2) {}
        }
        document.addEventListener('mousemove', move);
        document.addEventListener('mouseup', up);
        e.preventDefault();
      });
    }
    statusEl = $('rhmod-status-text');
  }

  function toast(msg, ok) {
    if (!toastEl || !toastEl.isConnected) {
      toastEl = document.createElement('div');
      toastEl.id = 'rhmod-toast';
      document.body.appendChild(toastEl);
    }
    toastEl.textContent = (ok ? '✅ ' : '⚠️ ') + msg;
    toastEl.style.display = 'block';
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.style.display = 'none'; }, 2600);
  }

  function refreshStatus() {
    if (!statusEl) return;
    var h = window.__RH_MOD__;
    statusEl.textContent = h ? '已进入废墟探索（功能可用）' : '未在废墟探索中（进入废墟后功能可用）';
    refreshAutoWinLabel();
    refreshEcoAutoLabel();
  }

  // ===== 创意工坊配置自动加载 =====
  // 游戏导入的创意工坊 .rvmod 包存放在 localStorage（key 前缀 rebirth_mod_package_v2__），
  // 我们发布的包在 meta.rhmod 里携带配置，这里扫描并自动启用。
  function scanInstalledMods() {
    var cfg = {};
    try {
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        if (k && k.indexOf('rebirth_mod_package_v2__') === 0) {
          try {
            var pkg = JSON.parse(localStorage.getItem(k));
            var rh = pkg && pkg.meta && pkg.meta.rhmod;
            if (rh && typeof rh === 'object') {
              for (var key in rh) cfg[key] = rh[key];
            }
          } catch (e) {}
        }
      }
    } catch (e) {}
    window.__RH_MOD_CONFIG__ = cfg;
    if (cfg.autoWin === true || cfg.autoWin === 1) window.__RH_MOD_AUTOWIN__ = true;
    return cfg;
  }

  // 定期扫描（创意工坊同步是异步的，订阅后需要时间导入）
  setInterval(scanInstalledMods, 4000);

  // 自动应用"解锁全部楼层"：配置开启且已进入废墟（桥接就绪）时执行一次
  setInterval(function () {
    if (window.__RH_UNLOCK_DONE__) return;
    var cfg = window.__RH_MOD_CONFIG__ || scanInstalledMods();
    if (cfg.unlockAll === true || cfg.unlockAll === 1) {
      var h = window.__RH_MOD__;
      if (h && h.unlockAllFloors) {
        window.__RH_UNLOCK_DONE__ = true;
        try { h.unlockAllFloors(); } catch (e) {}
      }
    }
  }, 3000);

  function refreshAutoWinLabel() {
    var btn = document.getElementById('rhmod-autowin');
    if (!btn) return;
    var h = window.__RH_MOD__;
    var on = h ? h.getAutoWin() : false;
    btn.textContent = on ? '🎯 自动秒杀模式：开' : '🎯 自动秒杀模式：关';
    btn.style.background = on ? 'linear-gradient(135deg,#f59e0b,#ef4444)' : '';
  }

  function show() {
    ensure();
    refreshStatus();
    panel.classList.remove('rhmod-hidden');
  }
  function hide() { if (panel) panel.classList.add('rhmod-hidden'); }
  function toggle() {
    ensure();
    if (panel.classList.contains('rhmod-hidden')) show(); else hide();
  }

  function run(act, btnEl) {
    var h = window.__RH_MOD__;
    // 生态打理（收获/宰杀/烹饪/孵化/放养/喂食/浇水/施肥/自动开关）：不依赖废墟战斗，先处理
    if (act === 'ecoHarvest' || act === 'ecoSlaughter' || act === 'ecoCook' || act === 'ecoAll' ||
        act === 'ecoHatch' || act === 'ecoPlace' || act === 'ecoFeed' || act === 'ecoWater' || act === 'ecoFert' ||
        act === 'ecoRipen' || act === 'ecoPlant') {
      var eco = window.__RH_ECO__;
      if (!eco) { toast('未进入游戏界面（生态设备未就绪），请先进游戏', false); return; }
      try {
        if (act === 'ecoHarvest') eco.harvestAllFarms();
        else if (act === 'ecoPlant') eco.plantAll();
        else if (act === 'ecoSlaughter') eco.slaughterAll();
        else if (act === 'ecoCook') eco.cookAll();
        else if (act === 'ecoHatch') eco.hatchAll();
        else if (act === 'ecoPlace') eco.placeAllAnimals();
        else if (act === 'ecoFeed') eco.feedAll();
        else if (act === 'ecoWater') eco.waterAll();
        else if (act === 'ecoFert') eco.fertilizeAll();
        else if (act === 'ecoRipen') eco.ripenAll();
        else eco.autoAll();
        setTimeout(function () {
          var st = window.__RH_ECO__ && window.__RH_ECO__.last;
          function n(k) { return st ? (st[k] || 0) : 0; }
          var h = n('harvest'), s = n('slaughter'), c = n('cook'), ht = n('hatch'), p = n('place'), fd = n('feed'), w = n('water'), f = n('fert'), rp = n('ripen'), pt = n('plant');
          if (act === 'ecoHarvest') toast(h > 0 ? '已收获 ' + h + ' 株成熟作物' : '没有成熟作物：先点「一键种植」再点「一键催熟」，即可收获', h > 0);
          else if (act === 'ecoPlant') toast(pt > 0 ? '已用库存种子种下 ' + pt + ' 株作物（接着点「催熟」立即成熟）' : '没有可种的空槽或库存里没有种子（先获取 seed_ 开头种子）', pt > 0);
          else if (act === 'ecoRipen') toast(rp > 0 ? '已催熟 ' + rp + ' 株作物（立即成熟，点「一键收获」即可收取）' : '没有在生长的作物：先点「一键种植」播种', rp > 0);
          else if (act === 'ecoSlaughter') toast(s > 0 ? '已宰杀 ' + s + ' 只成熟动物' : '没有可宰杀的成熟动物', s > 0);
          else if (act === 'ecoCook') toast(c > 0 ? '已烹饪 ' + c + ' 道菜' : (st && st.cook === -1 ? '未安装电炉，无法烹饪' : '食材不足或未解锁菜谱'), c > 0);
          else if (act === 'ecoHatch') toast(ht > 0 ? '已放入 ' + ht + ' 枚蛋开始孵化' : '没有可孵化的蛋', ht > 0);
          else if (act === 'ecoPlace') toast(p > 0 ? '已放入 ' + p + ' 只动物' : '没有可放入的动物或槽位已满', p > 0);
          else if (act === 'ecoFeed') toast(fd > 0 ? '已为 ' + fd + ' 个孵化器补满饲料' : '饲料已满或库存饲料不足', fd > 0);
          else if (act === 'ecoWater') toast(w > 0 ? '已浇水 ' + w + ' 株作物' : '没有需要浇水的作物', w > 0);
          else if (act === 'ecoFert') toast(f > 0 ? '已施肥 ' + f + ' 株作物' : '没有需要施肥的作物', f > 0);
          else toast((h + s + c + ht + p + fd + w + f) > 0
            ? '打理完成：收获 ' + h + ' 株、宰杀 ' + s + ' 只、烹饪 ' + c + ' 道、孵化 ' + ht + ' 蛋、放养 ' + p + ' 只、喂食 ' + fd + ' 箱、浇水 ' + w + ' 株、施肥 ' + f + ' 株'
            : '没有可打理的内容', (h + s + c + ht + p + fd + w + f) > 0);
        }, 2500);
      } catch (e) { toast('执行失败：' + e.message, false); }
      return;
    }
    if (act === 'ecoAuto') {
      try {
        var next = !window.__RH_ECO_AUTO__;
        window.__RH_ECO_AUTO__ = next;
        try { localStorage.setItem('rhmod_eco_auto', next ? '1' : '0'); } catch (e) {}
        refreshEcoAutoLabel();
        toast(next ? '自动打理已开启（每 15 秒收获/宰杀/烹饪）' : '自动打理已关闭', true);
      } catch (e) { toast('执行失败：' + e.message, false); }
      return;
    }
    if (!h) { toast('未在废墟探索中，请先进入废墟', false); return; }
    if (act === 'unlockAll') {
      try { h.unlockAllFloors(); toast('已解锁全部楼层！（本次启动游戏内有效，重启游戏后恢复原状）', true); }
      catch (e) { toast('执行失败：' + e.message, false); }
    } else if (act === 'unlockTo') {
      var inp = document.getElementById('rhmod-unlock-floor');
      var n = parseInt(inp && inp.value, 10);
      if (!n || n < 1) { toast('请先在输入框里填要解锁到的楼层号（1~999）', false); return; }
      try { h.unlockToFloor(n); toast('已解锁到第 ' + n + ' 层（本次启动游戏内有效，重启游戏后恢复原状）', true); }
      catch (e) { toast('执行失败：' + e.message, false); }
    } else if (act === 'restoreFloors') {
      try { h.restoreFloors(); toast('已还原MOD解锁状态（真实楼层进度不受影响）', true); }
      catch (e) { toast('执行失败：' + e.message, false); }
    } else if (act === 'restoreProgress') {
      var inp3 = document.getElementById('rhmod-unlock-floor');
      var n3 = parseInt(inp3 && inp3.value, 10);
      if (isNaN(n3) || n3 < 0) { toast('请先在输入框里填还原到的楼层号（0 = 清空该区域全部楼层进度）', false); return; }
      if (!btnEl) { toast('按钮状态异常，请重开面板', false); return; }
      var nowTs = Date.now();
      if (!btnEl.__rhArm || nowTs - btnEl.__rhArm > 5000) {
        btnEl.__rhArm = nowTs;
        btnEl.__rhText = btnEl.textContent;
        btnEl.textContent = '⚠️ 将真实改动存档进度，再点一次确认';
        setTimeout(function () { if (btnEl.__rhArm) { btnEl.textContent = btnEl.__rhText; btnEl.__rhArm = 0; } }, 5000);
        return;
      }
      btnEl.__rhArm = 0;
      if (btnEl.__rhText) btnEl.textContent = btnEl.__rhText;
      try {
        window.__RH_RESTORE_RESULT__ = null;
        h.restoreProgressFloor(n3);
        setTimeout(function () {
          var rr = window.__RH_RESTORE_RESULT__;
          if (!rr) { toast('已提交还原请求，请稍候或重进地图查看', true); return; }
          if (rr.err) { toast('还原失败：' + rr.err, false); return; }
          if (!rr.changed) { toast('区域 ' + rr.node + ' 当前进度 ' + rr.old + ' 层，无需还原（只能往低还原）', false); return; }
          toast('已把区域 ' + rr.node + ' 从 ' + rr.old + ' 层还原到 ' + rr.set + ' 层，并撤除了本局MOD解锁；游戏自动存档后生效', true);
        }, 900);
      } catch (e) { toast('执行失败：' + e.message, false); }
    } else if (act === 'jumpTop') {
      try { h.jumpToTopFloor(); toast('已跳到当前区域最高层', true); }
      catch (e) { toast('执行失败：' + e.message, false); }
    } else if (act === 'instantWin') {
      try { h.instantWin(); toast('当前战斗已直接胜利！', true); }
      catch (e) { toast('执行失败：' + e.message, false); }
    } else if (act === 'autoWin') {
      try {
        var next = !h.getAutoWin();
        h.setAutoWin(next);
        refreshAutoWinLabel();
        toast(next ? '自动秒杀已开启（进入战斗自动胜利）' : '自动秒杀已关闭', true);
      } catch (e) { toast('执行失败：' + e.message, false); }
    } else if (act === 'forceExit') {
      try { h.forceExit(); toast('已强制撤离当前区域', true); }
      catch (e) { toast('执行失败：' + e.message, false); }
    }
    setTimeout(refreshStatus, 300);
  }

  function refreshEcoAutoLabel() {
    var btn = document.getElementById('rhmod-ecoauto');
    if (!btn) return;
    var on = !!window.__RH_ECO_AUTO__;
    btn.textContent = on ? '🤖 自动打理：开' : '🤖 自动打理：关';
    btn.style.background = on ? 'linear-gradient(135deg,#22c55e,#16a34a)' : '';
  }

  // 自动打理：每 15 秒执行一次收获/宰杀/烹饪（从 localStorage 恢复开关状态）
  try {
    window.__RH_ECO_AUTO__ = localStorage.getItem('rhmod_eco_auto') === '1';
  } catch (e) {}
  setInterval(function () {
    if (!window.__RH_ECO_AUTO__) return;
    var eco = window.__RH_ECO__;
    if (!eco) return;
    try { eco.autoAll(); } catch (e) {}
  }, 15000);
  setInterval(refreshEcoAutoLabel, 2000);

  window.addEventListener('keydown', function (e) {
    if (e.key === KEY || e.key === 'f8') {
      e.preventDefault();
      toggle();
    }
  });
  window.__RH_MOD_TOGGLE__ = toggle;
})();

// ===== 自动重载：检测到存档被外部修改（profile.rhMod.applyRequest 更新）→ 自动 回主菜单→继续游戏 =====
;(function () {
  var lastApplied = 0;
  function isVisible(el) {
    try {
      var r = el.getBoundingClientRect();
      return r.width > 1 && r.height > 1;
    } catch (e) { return false; }
  }
  function findBtn(re) {
    var els = document.querySelectorAll('button,div[role=button],[class*=btn],[class*=Button]');
    for (var i = 0; i < els.length; i++) {
      var t = (els[i].textContent || '').trim();
      if (re.test(t) && t.length < 40 && isVisible(els[i])) return els[i];
    }
    return null;
  }
  function doReload(attempt) {
    attempt = attempt || 0;
    if (attempt > 10) return;
    // 1) 若在局内暂停菜单：点"返回主菜单"退到主菜单（兼容英文界面）
    var b1 = findBtn(/返回主菜单|back to main menu|main menu/i);
    if (b1) { b1.click(); setTimeout(function () { doReload(attempt + 1); }, 3500); return; }
    // 2) 在主菜单：点"继续游戏"重新读档（兼容英文界面）
    var b2 = findBtn(/继续游戏|continue/i);
    if (b2) { b2.click(); return; }
    // 3) 都不在：尝试按 Esc 打开菜单，稍后重试
    //    注意：游戏全局 keydown 处理器会访问 event.target.closest，dispatchEvent 的合成事件
    //    target 默认为 document（无 closest 方法）会导致游戏渲染崩溃，这里手动把 target 指向 body。
    try {
      var ev = new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true, cancelable: true });
      try { Object.defineProperty(ev, 'target', { value: document.body }); } catch (e2) {}
      document.dispatchEvent(ev);
    } catch (e) {}
    setTimeout(function () { doReload(attempt + 1); }, 1500);
  }
  function poll() {
    try {
      if (!window.rebirthSteamBridge || !window.rebirthSteamBridge.mods) return;
      var v = window.rebirthSteamBridge.mods.get('rebirth_mod_apply');
      var req = v ? Number(String(v).trim() || 0) : 0;
      if (req > lastApplied) {
        lastApplied = req;
        window.__RH_RELOAD_LAST__ = Date.now();
        setTimeout(function () { doReload(0); }, 500);
      }
    } catch (e) {}
  }
  setInterval(poll, 1000);
})();
