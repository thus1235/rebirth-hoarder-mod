// verify_checksum.js - 复现存档修改器的 checksum 算法，验证与游戏存档中的 checksum 是否一致
const fs = require('fs');
const crypto = require('crypto');

const DIR = 'C:/Users/Thus/AppData/Roaming/Rebirth Hoarder/steam-cloud/saves';

function isObj(v) { return v !== null && typeof v === 'object' && !Array.isArray(v); }

// 对应 C# NormalizeStringRecord：只保留 value 为对象的键
function normalizeStringRecord(v) {
  const out = {};
  if (isObj(v)) for (const k of Object.keys(v)) {
    if (k && isObj(v[k])) out[k] = clone(v[k]);
  }
  return out;
}
function clone(v) { return v === undefined ? null : JSON.parse(JSON.stringify(v === undefined ? null : v)); }
function normStrList(v) {
  const set = new Set();
  if (Array.isArray(v)) for (const x of v) if (typeof x === 'string' && x.length > 0) set.add(x);
  return [...set].sort(); // C# SortedSet<string> 默认 Comparer<string>.Default（文化排序）
}
function normalizeLedger(v) {
  const src = isObj(v) ? v : {};
  return {
    claimWindows: normalizeStringRecord(src.claimWindows),
    redeemedCodes: normalizeStringRecord(src.redeemedCodes),
    achievementIds: normStrList(src.achievementIds),
    steamPurchaseGrants: normalizeStringRecord(src.steamPurchaseGrants),
    appliedOperationIds: normStrList(src.appliedOperationIds),
  };
}
function normalizeProgress(v) {
  const src = isObj(v) ? v : {};
  return {
    profile: clone(src.profile ?? {}),
    pendingRun: src.pendingRun ? clone(src.pendingRun) : null,
    activeRun: src.activeRun ? clone(src.activeRun) : null,
  };
}
function normalizePayload(v) {
  const src = isObj(v) ? v : {};
  return { progress: normalizeProgress(src.progress), accountLedger: normalizeLedger(src.accountLedger) };
}
function stable(v) {
  if (v === null || typeof v === 'string' || typeof v === 'boolean') return v;
  if (typeof v === 'number') {
    if (Number.isFinite(v) && v === Math.floor(v) && Math.abs(v) < 9.2e18) return Math.trunc(v);
    return v;
  }
  if (Array.isArray(v)) return v.map(stable);
  if (isObj(v)) {
    const out = {};
    for (const k of Object.keys(v).sort()) out[k] = stable(v[k]);
    return out;
  }
  return v;
}

function calc(payload) {
  const s = JSON.stringify(stable(normalizePayload(payload)));
  return crypto.createHash('sha256').update(s, 'utf8').digest('hex');
}

const targets = process.argv.slice(2).length ? process.argv.slice(2)
  : ['progress-current.json', 'progress-current.json.bak1', 'progress-current.json.bak2', 'progress-current.json.bak3', 'progress-manual-2.json', 'run-current.json'];
let anyFail = false;
for (const f of targets) {
  const p = DIR + '/' + f;
  if (!fs.existsSync(p)) { console.log('[跳过] ' + f + '（不存在）'); continue; }
  try {
    const env = JSON.parse(fs.readFileSync(p, 'utf8'));
    if (!env || !env.payload) { console.log('[跳过] ' + f + '（无 payload）'); continue; }
    const got = calc(env.payload);
    const want = String(env.checksum || '');
    const ok = got === want;
    if (!ok) anyFail = true;
    console.log((ok ? '[匹配] ' : '[不匹配] ') + f + '  revision=' + env.revision + '  算法=' + env.checksumAlgorithm);
    if (!ok) console.log('     存档内: ' + want + '\n     复现得: ' + got);
  } catch (e) { console.log('[错误] ' + f + ': ' + e.message); anyFail = true; }
}
console.log(anyFail ? '\n>>> 存在不匹配的存档，需检查算法' : '\n>>> 全部存档 checksum 复现一致，修改器校验和算法正确');
