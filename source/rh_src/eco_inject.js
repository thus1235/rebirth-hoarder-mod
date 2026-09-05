/*==RH_ECO_INJECT==*/
// RH 一键生态打理（组件版 v3，崩溃安全）：注入到 AppContent 主容器组件 props 解构后。
// 顶层只保存 ue（全局 setGameState）到外部对象，函数在调用时才读取并使用；
// 整个 IIFE 用 try/catch 包裹，任何错误只记录到 window.__RH_DIAG_ERR__，绝不向 React 渲染传播。
__rhEcoModBind9 = (function () {
  'use strict';
  try {
    window.__RH_PROBE__ = (window.__RH_PROBE__ || 0) + 1;
    window.__RH_ECO_LAST__ = window.__RH_ECO_LAST__ || { harvest: 0, slaughter: 0, cook: 0, hatch: 0, place: 0, feed: 0, water: 0, fert: 0, items: {}, err: null };
    window.__RH_UE__ = typeof K === 'function' ? K : null;

    function pushItem(list, defId, qty) {
      for (var i = 0; i < list.length; i++) {
        if (list[i].defId === defId) {
          list[i] = Object.assign({}, list[i], { quantity: (list[i].quantity || 1) + qty });
          return;
        }
      }
      list.push({ instanceId: 'rhmod_' + Date.now() + '_' + Math.floor(Math.random() * 99999), defId: defId, x: -1, y: -1, rotation: 0, quantity: qty });
    }

    window.__RH_ECO__ = {
      ready: true,
      get last() { return window.__RH_ECO_LAST__ || { harvest: 0, slaughter: 0, cook: 0, hatch: 0, place: 0, feed: 0, water: 0, fert: 0, items: {}, err: null }; },
      harvestAllFarms: function () {
        var LAST = window.__RH_ECO_LAST__;
        var setGS = window.__RH_UE__;
        if (typeof setGS !== 'function') { LAST.err = 'setter 未就绪'; return; }
        setGS(function (prev) {
          window.__RH_PROBE__ = (window.__RH_PROBE__ || 0) + 1;
          try {
            var __diag = {
              hasPrev: !!prev, hasP2: !!(prev && prev.p2), hasDevs: !!(prev && prev.p2 && prev.p2.installedDevices),
              farms: 0, mature: 0, slots: 0, invLen: prev && prev.inventory ? prev.inventory.length : -1,
              topKeys: prev ? Object.keys(prev).slice(0, 10) : []
            };
            if (prev && prev.p2 && prev.p2.installedDevices) {
              (prev.p2.installedDevices || []).forEach(function (d) {
                if (d && d.deviceDefId === 'hydroponic_box') {
                  __diag.farms++;
                  var slots = (d.farmState && d.farmState.slots) || [];
                  __diag.slots += slots.length;
                  slots.forEach(function (s) { if (s && s.stage === 'mature') __diag.mature++; });
                }
              });
            }
            window.__RH_DIAG__ = __diag;
          } catch (e) { window.__RH_DIAG__ = { diagErr: e.message }; }
          if (!prev || !prev.p2) return prev;
          var devs = prev.p2.installedDevices || [];
          var yields = [], found = false;
          var next = devs.map(function (dev) {
            if (!dev || dev.deviceDefId !== 'hydroponic_box') return dev;
            var fs = vl(dev);
            var keep = [], got = 0, slots = fs.slots || [];
            for (var i = 0; i < slots.length; i++) {
              var s = slots[i];
              var rr = (s && s.stage === 'mature') ? k0(s) : null;
              if (rr) { got++; yields.push(rr); } else keep.push(s);
            }
            if (!got) return dev;
            found = true;
            return Object.assign({}, dev, {
              level: Math.max(1, Math.floor(Number(dev.level) || 1), fs.level || 1),
              farmState: Object.assign({}, fs, { slots: keep })
            });
          });
          if (!found || yields.length === 0) { LAST.harvest = 0; return prev; }
          var inv = (prev.inventory || []).map(function (x) { return Object.assign({}, x); });
          var stash = (prev.stash || []).map(function (x) { return Object.assign({}, x); });
          for (var i = 0; i < yields.length; i++) {
            var rr = yields[i];
            var q = Math.max(1, Math.floor(Number(rr.quantity) || 1));
            pushItem(stash, rr.outputDefId, q);
            LAST.items[rr.outputDefId] = (LAST.items[rr.outputDefId] || 0) + q;
            if (rr.bonusSeedDefId && (rr.bonusSeedQuantity || 0) > 0) pushItem(stash, rr.bonusSeedDefId, Math.max(1, Math.floor(Number(rr.bonusSeedQuantity) || 1)));
            if (rr.bonusCompost) pushItem(stash, 'bio_compost', 1);
          }
          LAST.harvest = yields.length;
          return Object.assign({}, prev, {
            inventory: inv,
            stash: stash,
            p2: Object.assign({}, prev.p2, { installedDevices: next })
          });
        });
      },
      ripenAll: function () {
        var LAST = window.__RH_ECO_LAST__;
        var setGS = window.__RH_UE__;
        if (typeof setGS !== 'function') { LAST.err = 'setter 未就绪'; return; }
        setGS(function (prev) {
          window.__RH_PROBE__ = (window.__RH_PROBE__ || 0) + 1;
          if (!prev || !prev.p2) { LAST.ripen = 0; return prev; }
          var n = 0, found = false;
          var next = (prev.p2.installedDevices || []).map(function (dev) {
            if (!dev || dev.deviceDefId !== 'hydroponic_box') return dev;
            var fs = vl(dev);
            var changed = false;
            var slots = (fs.slots || []).map(function (s) {
              if (s && s.seedDefId && s.stage && s.stage !== 'mature') { n++; changed = true; return Object.assign({}, s, { stage: 'mature', growthProgress: 1 }); }
              return s;
            });
            if (!changed) return dev;
            found = true;
            return Object.assign({}, dev, {
              level: Math.max(1, Math.floor(Number(dev.level) || 1), fs.level || 1),
              farmState: Object.assign({}, fs, { slots: slots })
            });
          });
          if (!found || !n) { LAST.ripen = 0; return prev; }
          LAST.ripen = n;
          return Object.assign({}, prev, { p2: Object.assign({}, prev.p2, { installedDevices: next }) });
        });
      },
      slaughterAll: function () {
        var LAST = window.__RH_ECO_LAST__;
        var setGS = window.__RH_UE__;
        if (typeof setGS !== 'function') { LAST.err = 'setter 未就绪'; return; }
        setGS(function (prev) {
          window.__RH_PROBE__ = (window.__RH_PROBE__ || 0) + 1;
          if (!prev || !prev.p2) return prev;
          var devs = prev.p2.installedDevices || [];
          var meat = {}, killed = 0, found = false;
          var next = devs.map(function (dev) {
            if (!dev || dev.deviceDefId !== 'eco_incubator') return dev;
            var st0 = Vi(dev.incubatorState, dev.level);
            var cur = (st0.slots || []).slice();
            var doomed = cur.filter(function (s) { return s && xr(s).isMature; });
            var got = 0;
            for (var i = 0; i < doomed.length; i++) {
              var rr = __RH_FN_SLAUGHTER__(cur, doomed[i].id);
              if (rr) { cur = rr.updatedSlots; got++; meat[rr.outputDefId] = (meat[rr.outputDefId] || 0) + rr.outputQuantity; }
            }
            if (!got) return dev;
            found = true;
            killed += got;
            return Object.assign({}, dev, { incubatorState: Object.assign({}, st0, { slots: cur }) });
          });
          if (!found) { LAST.slaughter = 0; return prev; }
          var inv = (prev.inventory || []).map(function (x) { return Object.assign({}, x); });
          var stash = (prev.stash || []).map(function (x) { return Object.assign({}, x); });
          var names = Object.keys(meat);
          for (var i = 0; i < names.length; i++) {
            pushItem(stash, names[i], meat[names[i]]);
            LAST.items[names[i]] = (LAST.items[names[i]] || 0) + meat[names[i]];
          }
          LAST.slaughter = killed;
          return Object.assign({}, prev, {
            inventory: inv,
            stash: stash,
            p2: Object.assign({}, prev.p2, { installedDevices: next })
          });
        });
      },
      cookAll: function () {
        var LAST = window.__RH_ECO_LAST__;
        var setGS = window.__RH_UE__;
        if (typeof setGS !== 'function') { LAST.err = 'setter 未就绪'; return; }
        setGS(function (prev) {
          window.__RH_PROBE__ = (window.__RH_PROBE__ || 0) + 1;
          if (!prev || !prev.p2) return prev;
          var stove = null;
          var devs = prev.p2.installedDevices || [];
          for (var i = 0; i < devs.length; i++) {
            if (devs[i] && devs[i].deviceDefId === 'electric_stove') { stove = devs[i]; break; }
          }
          if (!stove || typeof R2 !== 'function') { LAST.cook = -1; return prev; }
          var unlocked = prev.p2.chefAdvancedCookingRecipes || [];
          if (!unlocked.length) { LAST.cook = 0; return prev; }
          var recipes = __RH_FN_RECIPES__((stove.level || 0) + 1);
          var cookable = [];
          for (var i = 0; i < recipes.length; i++) {
            if (recipes[i] && recipes[i].id && unlocked.indexOf(recipes[i].id) >= 0) cookable.push(recipes[i]);
          }
          if (!cookable.length) { LAST.cook = 0; return prev; }
          var inv = (prev.inventory || []).map(function (x) { return Object.assign({}, x); });
          var stash = (prev.stash || []).map(function (x) { return Object.assign({}, x); });
          function count(defId) {
            var t = 0;
            for (var i = 0; i < stash.length; i++) if (stash[i].defId === defId) t += (stash[i].quantity || 1);
            for (var i = 0; i < inv.length; i++) if (inv[i].defId === defId) t += (inv[i].quantity || 1);
            return t;
          }
          function take(defId, cnt) {
            var rem = cnt;
            for (var i = 0; i < stash.length && rem > 0; i++) {
              if (stash[i].defId !== defId) continue;
              var q = stash[i].quantity || 1;
              if (q > rem) { stash[i] = Object.assign({}, stash[i], { quantity: q - rem }); rem = 0; }
              else { rem -= q; stash.splice(i, 1); i--; }
            }
            for (var i = 0; i < inv.length && rem > 0; i++) {
              if (inv[i].defId !== defId) continue;
              var q = inv[i].quantity || 1;
              if (q > rem) { inv[i] = Object.assign({}, inv[i], { quantity: q - rem }); rem = 0; }
              else { rem -= q; inv.splice(i, 1); i--; }
            }
          }
          var made = 0;
          for (var i = 0; i < cookable.length; i++) {
            var rc = cookable[i];
            var ings = rc.ingredients || [];
            var ok = true;
            for (var j = 0; j < ings.length; j++) {
              if (count(ings[j].itemId) < (ings[j].count || 1)) { ok = false; break; }
            }
            if (!ok) continue;
            for (var j = 0; j < ings.length; j++) take(ings[j].itemId, ings[j].count || 1);
            pushItem(stash, rc.outputId, 1);
            LAST.items[rc.outputId] = (LAST.items[rc.outputId] || 0) + 1;
            made++;
          }
          LAST.cook = made;
          if (made === 0) return prev;
          return Object.assign({}, prev, { inventory: inv, stash: stash });
        });
      },
      // ===== 孵化：把库存的蛋（egg_*）放入孵化器 pendingHatches =====
      hatchAll: function () {
        var LAST = window.__RH_ECO_LAST__;
        var setGS = window.__RH_UE__;
        if (typeof setGS !== 'function') { LAST.err = 'setter 未就绪'; return; }
        setGS(function (prev) {
          window.__RH_PROBE__ = (window.__RH_PROBE__ || 0) + 1;
          if (!prev || !prev.p2) return prev;
          if (typeof b9 !== 'function' || typeof ef !== 'function') { LAST.hatch = 0; return prev; }
          var day = prev.p2.daysSurvived || 0;
          // 收集库存蛋（ef 有幼崽映射即可，注意蛋 defId 是 chicken_egg/duck_egg，不以 egg_ 开头）
          var eggs = {};
          (prev.inventory || []).forEach(function (x) { if (x && typeof ef === 'function' && ef(x.defId)) eggs[x.defId] = (eggs[x.defId] || 0) + (x.quantity || 1); });
          (prev.stash || []).forEach(function (x) { if (x && typeof ef === 'function' && ef(x.defId)) eggs[x.defId] = (eggs[x.defId] || 0) + (x.quantity || 1); });
          var types = Object.keys(eggs);
          if (!types.length) { LAST.hatch = 0; return prev; }
          var remaining = {};
          types.forEach(function (t) { remaining[t] = eggs[t]; });
          var hatched = 0;
          var MAX_PER_DEV = 24; // 每个孵化器本轮最多放入的蛋数（5 台 = 120 枚，出壳幼崽槽位足够）
          var next = prev.p2.installedDevices.map(function (dev) {
            if (!dev || dev.deviceDefId !== 'eco_incubator') return dev;
            var st0 = Vi(dev.incubatorState, dev.level);
            var cur = st0;
            var placed = 0;
            for (var ti = 0; ti < types.length && placed < MAX_PER_DEV; ti++) {
              var t = types[ti];
              while (remaining[t] > 0 && placed < MAX_PER_DEV) {
                var r = b9(cur, t, day);
                if (!r) break;
                cur = r;
                remaining[t]--;
                placed++;
                hatched++;
              }
            }
            if (cur === st0) return dev;
            return Object.assign({}, dev, { incubatorState: cur });
          });
          if (!hatched) { LAST.hatch = 0; return prev; }
          var inv = (prev.inventory || []).map(function (x) { return Object.assign({}, x); });
          var stash = (prev.stash || []).map(function (x) { return Object.assign({}, x); });
          types.forEach(function (t) {
            var use = eggs[t] - (remaining[t] || 0);
            if (use <= 0) return;
            var rem = use;
            for (var i = stash.length - 1; i >= 0 && rem > 0; i--) {
              if (stash[i].defId !== t) continue;
              var q = stash[i].quantity || 1;
              if (q > rem) { stash[i] = Object.assign({}, stash[i], { quantity: q - rem }); rem = 0; }
              else { rem -= q; stash.splice(i, 1); i--; }
            }
            for (var i = inv.length - 1; i >= 0 && rem > 0; i--) {
              if (inv[i].defId !== t) continue;
              var q = inv[i].quantity || 1;
              if (q > rem) { inv[i] = Object.assign({}, inv[i], { quantity: q - rem }); rem = 0; }
              else { rem -= q; inv.splice(i, 1); i--; }
            }
          });
          LAST.hatch = hatched;
          return Object.assign({}, prev, {
            inventory: inv,
            stash: stash,
            p2: Object.assign({}, prev.p2, { installedDevices: next })
          });
        });
      },
      // ===== 放入动物：把库存动物（xo 有配置）放进孵化器空槽 =====
      placeAllAnimals: function () {
        var LAST = window.__RH_ECO_LAST__;
        var setGS = window.__RH_UE__;
        if (typeof setGS !== 'function') { LAST.err = 'setter 未就绪'; return; }
        setGS(function (prev) {
          window.__RH_PROBE__ = (window.__RH_PROBE__ || 0) + 1;
          if (!prev || !prev.p2) return prev;
          if (typeof y9 !== 'function' || typeof xo === 'undefined') { LAST.place = 0; return prev; }
          // 收集库存动物（xo 有 animalConfig，排除蛋/成熟体——只放可养的）
          var animals = {};
          (prev.inventory || []).forEach(function (x) {
            var d = x && x.defId;
            if (!d || !xo[d]) return;
            if (typeof ef === 'function' && ef(d)) return; // 蛋（chicken_egg/duck_egg）不能放入槽位
            animals[d] = (animals[d] || 0) + (x.quantity || 1);
          });
          (prev.stash || []).forEach(function (x) {
            var d = x && x.defId;
            if (!d || !xo[d]) return;
            if (typeof ef === 'function' && ef(d)) return;
            animals[d] = (animals[d] || 0) + (x.quantity || 1);
          });
          var types = Object.keys(animals);
          if (!types.length) { LAST.place = 0; return prev; }
          var remaining = {};
          types.forEach(function (t) { remaining[t] = animals[t]; });
          var placed = 0;
          var next = prev.p2.installedDevices.map(function (dev) {
            if (!dev || dev.deviceDefId !== 'eco_incubator') return dev;
            var st0 = Vi(dev.incubatorState, dev.level);
            var slots = (st0.slots || []).slice();
            var gs = st0.gridSize || 6;
            // 找空槽（row-major）
            var occupied = {};
            slots.forEach(function (s) { if (s) occupied[s.row + ',' + s.col] = true; });
            var changed = false;
            for (var ti = 0; ti < types.length; ti++) {
              var t = types[ti];
              while (remaining[t] > 0) {
                var cell = null;
                for (var r = 0; r < gs && !cell; r++) {
                  for (var c = 0; c < gs; c++) {
                    if (!occupied[r + ',' + c]) { cell = { row: r, col: c }; break; }
                  }
                }
                if (!cell) break; // 槽满
                // y9 基于传入的 incubatorState 计算，必须传入当前进度的 slots，否则每次只保留最后一只
                var nr = y9(Object.assign({}, st0, { slots: slots }), t, cell.row, cell.col);
                if (!nr) break;
                slots = nr;
                occupied[cell.row + ',' + cell.col] = true;
                remaining[t]--;
                placed++;
                changed = true;
              }
            }
            if (!changed) return dev;
            return Object.assign({}, dev, { incubatorState: Object.assign({}, st0, { slots: slots }) });
          });
          if (!placed) { LAST.place = 0; return prev; }
          var inv = (prev.inventory || []).map(function (x) { return Object.assign({}, x); });
          var stash = (prev.stash || []).map(function (x) { return Object.assign({}, x); });
          types.forEach(function (t) {
            var use = animals[t] - (remaining[t] || 0);
            if (use <= 0) return;
            var rem = use;
            for (var i = stash.length - 1; i >= 0 && rem > 0; i--) {
              if (stash[i].defId !== t) continue;
              var q = stash[i].quantity || 1;
              if (q > rem) { stash[i] = Object.assign({}, stash[i], { quantity: q - rem }); rem = 0; }
              else { rem -= q; stash.splice(i, 1); i--; }
            }
            for (var i = inv.length - 1; i >= 0 && rem > 0; i--) {
              if (inv[i].defId !== t) continue;
              var q = inv[i].quantity || 1;
              if (q > rem) { inv[i] = Object.assign({}, inv[i], { quantity: q - rem }); rem = 0; }
              else { rem -= q; inv.splice(i, 1); i--; }
            }
          });
          LAST.place = placed;
          return Object.assign({}, prev, {
            inventory: inv,
            stash: stash,
            p2: Object.assign({}, prev.p2, { installedDevices: next })
          });
        });
      },
      // ===== 喂食：用库存 animal_feed 把孵化器饲料补满 =====
      feedAll: function () {
        var LAST = window.__RH_ECO_LAST__;
        var setGS = window.__RH_UE__;
        if (typeof setGS !== 'function') { LAST.err = 'setter 未就绪'; return; }
        setGS(function (prev) {
          window.__RH_PROBE__ = (window.__RH_PROBE__ || 0) + 1;
          if (!prev || !prev.p2) return prev;
          if (typeof _4 !== 'function') { LAST.feed = 0; return prev; }
          var feedCount = 0;
          (prev.inventory || []).forEach(function (x) { if (x && x.defId === 'animal_feed') feedCount += (x.quantity || 1); });
          (prev.stash || []).forEach(function (x) { if (x && x.defId === 'animal_feed') feedCount += (x.quantity || 1); });
          if (feedCount <= 0) { LAST.feed = 0; return prev; }
          var used = 0, fedDevs = 0;
          var next = prev.p2.installedDevices.map(function (dev) {
            if (!dev || dev.deviceDefId !== 'eco_incubator') return dev;
            var st0 = Vi(dev.incubatorState, dev.level);
            var cap = st0.feedCapacity || 100;
            var cur = Math.floor(Number(st0.feedStock) || 0);
            var need = cap - cur;
            if (need <= 0) return dev;
            var per = 0.5; // 每份 animal_feed = 0.5 单位
            var want = Math.ceil(need / per);
            var take = Math.min(want, feedCount - used);
            if (take <= 0) return dev;
            used += take;
            fedDevs++;
            return Object.assign({}, dev, {
              incubatorState: Object.assign({}, st0, { feedStock: _4(cur, take * per, cap) })
            });
          });
          if (!used) { LAST.feed = 0; return prev; }
          var inv = (prev.inventory || []).map(function (x) { return Object.assign({}, x); });
          var stash = (prev.stash || []).map(function (x) { return Object.assign({}, x); });
          var rem = used;
          for (var i = stash.length - 1; i >= 0 && rem > 0; i--) {
            if (stash[i].defId !== 'animal_feed') continue;
            var q = stash[i].quantity || 1;
            if (q > rem) { stash[i] = Object.assign({}, stash[i], { quantity: q - rem }); rem = 0; }
            else { rem -= q; stash.splice(i, 1); i--; }
          }
          for (var i = inv.length - 1; i >= 0 && rem > 0; i--) {
            if (inv[i].defId !== 'animal_feed') continue;
            var q = inv[i].quantity || 1;
            if (q > rem) { inv[i] = Object.assign({}, inv[i], { quantity: q - rem }); rem = 0; }
            else { rem -= q; inv.splice(i, 1); i--; }
          }
          LAST.feed = fedDevs;
          return Object.assign({}, prev, {
            inventory: inv,
            stash: stash,
            p2: Object.assign({}, prev.p2, { installedDevices: next })
          });
        });
      },
      // ===== 浇水：用水瓶给所有未浇水作物浇水 =====
      waterAll: function () {
        var LAST = window.__RH_ECO_LAST__;
        var setGS = window.__RH_UE__;
        if (typeof setGS !== 'function') { LAST.err = 'setter 未就绪'; return; }
        setGS(function (prev) {
          window.__RH_PROBE__ = (window.__RH_PROBE__ || 0) + 1;
          if (!prev || !prev.p2) return prev;
          if (typeof by !== 'function') { LAST.water = 0; return prev; }
          var bottleCount = 0;
          (prev.inventory || []).forEach(function (x) { if (x && x.defId === 'water_bottle') bottleCount += (x.quantity || 1); });
          (prev.stash || []).forEach(function (x) { if (x && x.defId === 'water_bottle') bottleCount += (x.quantity || 1); });
          if (bottleCount <= 0) { LAST.water = 0; return prev; }
          var used = 0, watered = 0;
          var next = prev.p2.installedDevices.map(function (dev) {
            if (!dev || dev.deviceDefId !== 'hydroponic_box') return dev;
            var fs = vl(dev);
            var changed = false;
            var slots = (fs.slots || []).map(function (s) {
              if (used >= bottleCount) return s;
              var nr = (s && !s.watered && (s.stage === 'seedling' || s.stage === 'growing')) ? by(s) : null;
              if (nr) { used++; watered++; changed = true; return nr; }
              return s;
            });
            if (!changed) return dev;
            return Object.assign({}, dev, {
              level: Math.max(1, Math.floor(Number(dev.level) || 1), fs.level || 1),
              farmState: Object.assign({}, fs, { slots: slots })
            });
          });
          if (!used) { LAST.water = 0; return prev; }
          var inv = (prev.inventory || []).map(function (x) { return Object.assign({}, x); });
          var stash = (prev.stash || []).map(function (x) { return Object.assign({}, x); });
          var rem = used;
          for (var i = stash.length - 1; i >= 0 && rem > 0; i--) {
            if (stash[i].defId !== 'water_bottle') continue;
            var q = stash[i].quantity || 1;
            if (q > rem) { stash[i] = Object.assign({}, stash[i], { quantity: q - rem }); rem = 0; }
            else { rem -= q; stash.splice(i, 1); i--; }
          }
          for (var i = inv.length - 1; i >= 0 && rem > 0; i--) {
            if (inv[i].defId !== 'water_bottle') continue;
            var q = inv[i].quantity || 1;
            if (q > rem) { inv[i] = Object.assign({}, inv[i], { quantity: q - rem }); rem = 0; }
            else { rem -= q; inv.splice(i, 1); i--; }
          }
          LAST.water = watered;
          return Object.assign({}, prev, {
            inventory: inv,
            stash: stash,
            p2: Object.assign({}, prev.p2, { installedDevices: next })
          });
        });
      },
      // ===== 施肥：用鱼肥/堆肥给所有未施肥作物施肥 =====
      fertilizeAll: function () {
        var LAST = window.__RH_ECO_LAST__;
        var setGS = window.__RH_UE__;
        if (typeof setGS !== 'function') { LAST.err = 'setter 未就绪'; return; }
        setGS(function (prev) {
          window.__RH_PROBE__ = (window.__RH_PROBE__ || 0) + 1;
          if (!prev || !prev.p2) return prev;
          if (typeof Zp !== 'function') { LAST.fert = 0; return prev; }
          var fish = 0, bio = 0;
          (prev.inventory || []).forEach(function (x) {
            if (x && x.defId === 'fish_manure') fish += (x.quantity || 1);
            if (x && x.defId === 'bio_compost') bio += (x.quantity || 1);
          });
          (prev.stash || []).forEach(function (x) {
            if (x && x.defId === 'fish_manure') fish += (x.quantity || 1);
            if (x && x.defId === 'bio_compost') bio += (x.quantity || 1);
          });
          if (fish + bio <= 0) { LAST.fert = 0; return prev; }
          var usedFish = 0, usedBio = 0, fertilized = 0;
          var next = prev.p2.installedDevices.map(function (dev) {
            if (!dev || dev.deviceDefId !== 'hydroponic_box') return dev;
            var fs = vl(dev);
            var changed = false;
            var slots = (fs.slots || []).map(function (s) {
              if (!s || s.fertilized || s.stage === 'mature' || s.stage === 'withered') return s;
              if (usedFish < fish) { var nr = Zp(s, 'fish_manure'); if (nr) { usedFish++; fertilized++; changed = true; return nr; } }
              if (usedBio < bio) { var nr2 = Zp(s, 'bio_compost'); if (nr2) { usedBio++; fertilized++; changed = true; return nr2; } }
              return s;
            });
            if (!changed) return dev;
            return Object.assign({}, dev, {
              level: Math.max(1, Math.floor(Number(dev.level) || 1), fs.level || 1),
              farmState: Object.assign({}, fs, { slots: slots })
            });
          });
          if (!fertilized) { LAST.fert = 0; return prev; }
          var inv = (prev.inventory || []).map(function (x) { return Object.assign({}, x); });
          var stash = (prev.stash || []).map(function (x) { return Object.assign({}, x); });
          function consumeType(defId, cnt) {
            var rem = cnt;
            for (var i = stash.length - 1; i >= 0 && rem > 0; i--) {
              if (stash[i].defId !== defId) continue;
              var q = stash[i].quantity || 1;
              if (q > rem) { stash[i] = Object.assign({}, stash[i], { quantity: q - rem }); rem = 0; }
              else { rem -= q; stash.splice(i, 1); i--; }
            }
            for (var i = inv.length - 1; i >= 0 && rem > 0; i--) {
              if (inv[i].defId !== defId) continue;
              var q = inv[i].quantity || 1;
              if (q > rem) { inv[i] = Object.assign({}, inv[i], { quantity: q - rem }); rem = 0; }
              else { rem -= q; inv.splice(i, 1); i--; }
            }
          }
          if (usedFish > 0) consumeType('fish_manure', usedFish);
          if (usedBio > 0) consumeType('bio_compost', usedBio);
          LAST.fert = fertilized;
          return Object.assign({}, prev, {
            inventory: inv,
            stash: stash,
            p2: Object.assign({}, prev.p2, { installedDevices: next })
          });
        });
      },
      autoAll: function () {
        this.harvestAllFarms();
        this.slaughterAll();
        this.cookAll();
        this.hatchAll();
        this.placeAllAnimals();
        this.feedAll();
        this.waterAll();
        this.fertilizeAll();
      }
    };
  } catch (e) {
    try { window.__RH_DIAG_ERR__ = String(e && e.message || e); } catch (e2) {}
  }
  return 1;
})()
