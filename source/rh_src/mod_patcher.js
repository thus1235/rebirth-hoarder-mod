// mod_patcher.js - MOD 统一补丁器（v3.21 自动适配架构核心）
// 运行方式：由安装器以"游戏 exe 的 Node 模式"运行（ELECTRON_RUN_AS_NODE=1），也可用系统 node。
//
// 用法:
//   node mod_patcher.js <游戏目录>                    完整安装（含解包/补丁/校验/切换/备份）
//   node mod_patcher.js --from-dir <assets目录>       只对现有 3 个 js 打补丁（测试用，不安装）
//   [--test-output <目录>]                            把补丁结果写到目录而不安装（回归测试）
//   [--keep-tmp]                                      失败时保留 app.tmp 供排查
//
// 退出码: 0=成功  1=运行时错误  2=补丁锚点失效(已生成诊断)  3=标记校验失败
// 补丁锚点全部为语义化解析（rh_resolve.js），游戏更新后自动适配压缩变量名变化；
// 个别锚点失效时不安装、不破坏游戏，在 resources 下生成《MOD适配诊断.txt》。
'use strict';
process.noAsar = true; // 以游戏自带 Electron 内核（ELECTRON_RUN_AS_NODE）运行时，禁用其对 .asar 路径的虚拟文件系统拦截
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { PatchError, resolveCtx } = require('./rh_resolve.js');

const MOD_VERSION = 'v3.21';

function log(m) { console.log('[PATCHER] ' + m); }
function sha256(buf) { return crypto.createHash('sha256').update(buf).digest('hex'); }

// ---------- 诊断收集 ----------
const diags = { entries: [], warnings: [] };
function collectDiag(err, sources) {
  const entry = {
    patch: err.patch, anchor: err.anchor, detail: err.detail, fuzzy: [],
  };
  for (const f of err.fuzzy || []) {
    const item = { desc: f.desc, hits: [] };
    try {
      const re = new RegExp(f.re.source, f.re.flags.includes('g') ? f.re.flags : f.re.flags + 'g');
      let m, n = 0;
      while ((m = re.exec(f.src)) && n < 3) {
        item.hits.push('@' + m.index + ' …' + f.src.slice(Math.max(0, m.index - 150), m.index + m[0].length + 150).replace(/\n/g, ' ') + '…');
        n++;
      }
      if (n === 0) item.hits.push('(宽松搜索 0 命中)');
    } catch (e) { item.hits.push('搜索失败: ' + e.message); }
    entry.fuzzy.push(item);
  }
  diags.entries.push(entry);
}

// 语义串探针：检查关键语义字符串在失败文件中的存活情况（帮助作者定位重构点）
const SEMANTIC_PROBES = [
  'historyBestLocalFloor', 'canSelectStartFloor', 'currentFloor', 'maxSelectableFloor',
  'boss_first_kill_reward', 'bossFirstKillRewardState', 'battleReportState', 'lootBoxState',
  'currentFloorBossDefeated', 'encounterType', 'clearedFloorThisRun',
  'rh-tower-exploration-root', 'noticeMissingLocatorTitle', 'enemy.exp??0',
  'bestLocalFloor', 'chapter_cleared', 'nodeId:', 'onUpdateMetaSave',
  'debugTowerFullFloorJump', 'battleReportState:null,phase:"loot_box"',
  // index.js / AppContent 侧
  'syncAndSaveGallery',
];
function buildProbes(sources) {
  const out = [];
  if (!sources || !sources.te || !sources.te.src) return out;
  const texts = { te: sources.te.src, idx: sources.idx && sources.idx.src, ac: sources.ac && sources.ac.src };
  for (const p of SEMANTIC_PROBES) {
    const where = Object.entries(texts).filter(([, t]) => t && t.includes(p)).map(([k]) => k);
    out.push(`  ${where.length ? '存活' : '丢失'}  ${p}  [${where.join(',') || '全部文件未找到'}]`);
  }
  return out;
}

function writeDiagnostics(outFile, sources, rawSources) {
  const lines = [];
  lines.push('========================================================');
  lines.push('  末世：我有一辆房车 MOD 自动适配 —— 诊断报告 ' + MOD_VERSION);
  lines.push('  生成时间: ' + new Date().toLocaleString('zh-CN'));
  lines.push('========================================================');
  lines.push('');
  lines.push('结论：游戏更新后部分代码结构变化超出了自动适配能力，MOD 已安全中止安装，游戏未受任何影响。');
  lines.push('请把本文件整体发给 MOD 作者，可大幅加快新版本适配。');
  lines.push('');
  if (sources) {
    for (const [k, v] of Object.entries(sources)) {
      if (v && v.name) lines.push(`目标文件 ${k}: ${v.name} (${v.size} 字节, sha256=${v.hash})`);
    }
    lines.push('');
  }
  if (rawSources) {
    lines.push('【语义串探针】（关键字符串在新版源码中的存活情况）');
    for (const l of buildProbes(rawSources)) lines.push(l);
    lines.push('');
  }
  if (diags.warnings.length) {
    lines.push('【告警】');
    for (const w of diags.warnings) lines.push('  ! ' + w);
    lines.push('');
  }
  for (const e of diags.entries) {
    lines.push('--------------------------------------------------------');
    lines.push(`【失败补丁】${e.patch}`);
    lines.push(`【锚点】${e.anchor}`);
    lines.push(`【原因】${e.detail}`);
    for (const f of e.fuzzy) {
      lines.push(`【宽松搜索】${f.desc}`);
      for (const h of f.hits) lines.push('  ' + h);
    }
    lines.push('');
  }
  fs.writeFileSync(outFile, lines.join('\r\n'), 'utf8');
  return outFile;
}

// ---------- asar 解包 ----------
function extractAsar(archive, outDir) {
  const fd = fs.openSync(archive, 'r');
  try {
    const sizeBuf = Buffer.alloc(8);
    fs.readSync(fd, sizeBuf, 0, 8, null);
    const headerSize = sizeBuf.readUInt32LE(4);
    const pickle = Buffer.alloc(headerSize);
    fs.readSync(fd, pickle, 0, headerSize, 8);
    const strLen = pickle.readUInt32LE(4);
    const header = JSON.parse(pickle.slice(8, 8 + strLen).toString('utf8'));
    const dataStart = 8 + headerSize;

    let files = 0, skipped = 0, totalBytes = 0;
    const unpackedPaths = [];
    function walk(node, prefix) {
      for (const name of Object.keys(node.files || {})) {
        const child = node.files[name];
        const p = prefix ? prefix + '/' + name : name;
        if (child.files) { walk(child, p); continue; }
        if (child.offset === 'unpacked' || child.unpacked === true) { skipped++; unpackedPaths.push(p); continue; }
        files++; totalBytes += child.size;
        const offset = parseInt(child.offset, 10);
        const target = path.join(outDir, p);
        fs.mkdirSync(path.dirname(target), { recursive: true });
        const buf = Buffer.alloc(child.size);
        let pos = 0;
        while (pos < child.size) {
          const n = fs.readSync(fd, buf, pos, child.size - pos, dataStart + offset + pos);
          if (n <= 0) throw new Error('读取失败: ' + p);
          pos += n;
        }
        fs.writeFileSync(target, buf);
      }
    }
    walk(header, '');
    return { files, skipped, totalBytes, unpackedPaths };
  } finally { fs.closeSync(fd); }
}

// 从 asar 只提取单个文件（快速重装路径用）
function extractOneFromAsar(archive, pathRegex) {
  const fd = fs.openSync(archive, 'r');
  try {
    const sizeBuf = Buffer.alloc(8);
    fs.readSync(fd, sizeBuf, 0, 8, null);
    const headerSize = sizeBuf.readUInt32LE(4);
    const pickle = Buffer.alloc(headerSize);
    fs.readSync(fd, pickle, 0, headerSize, 8);
    const strLen = pickle.readUInt32LE(4);
    const header = JSON.parse(pickle.slice(8, 8 + strLen).toString('utf8'));
    const dataStart = 8 + headerSize;
    let found = null;
    (function walk(node, prefix) {
      if (found) return;
      for (const name of Object.keys(node.files || {})) {
        const child = node.files[name];
        const p = prefix ? prefix + '/' + name : name;
        if (child.files) walk(child, p);
        else if (typeof child.offset === 'string' && pathRegex.test(p)) { found = { path: p, size: child.size, offset: parseInt(child.offset, 10) }; break; }
      }
    })(header, '');
    if (!found) return null;
    const buf = Buffer.alloc(found.size);
    let pos = 0;
    while (pos < found.size) {
      const n = fs.readSync(fd, buf, pos, found.size - pos, dataStart + found.offset + pos);
      if (n <= 0) throw new Error('read fail');
      pos += n;
    }
    return { name: path.basename(found.path), buf };
  } finally { fs.closeSync(fd); }
}

// ---------- 补丁调度 ----------
const TARGETS = [
  { key: 'te', fileRe: /^dist_steam\/assets\/TowerExploration-.*\.js$/, patches: ['apply_patches', 'apply_patch2', 'apply_patch4', 'apply_patch5', 'apply_patch6'] },
  { key: 'idx', fileRe: /^dist_steam\/assets\/index-.*\.js$/, patches: ['apply_patch3'] },
  { key: 'ac', fileRe: /^dist_steam\/assets\/AppContent-.*\.js$/, patches: ['apply_eco'] },
];

function loadPatch(name) { return require('./' + name + '.js').patch; }

// 带重试的 rename：Windows 上杀毒/索引服务短暂占用会导致 EPERM/EBUSY，退避重试
function renameWithRetry(from, to, tries = 6) {
  for (let i = 0; ; i++) {
    try { fs.renameSync(from, to); return; }
    catch (e) {
      if (i >= tries - 1 || (e.code !== 'EPERM' && e.code !== 'EACCES' && e.code !== 'EBUSY')) throw e;
      const wait = 500 * (i + 1);
      log(`重命名被占用(${e.code})，${wait}ms 后重试(${i + 2}/${tries})…`);
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, wait);
    }
  }
}

let LAST_SOURCES = null; // 供诊断报告引用

function runPatches(sources) {
  LAST_SOURCES = sources;
  // 1. 语义上下文（来自 TowerExploration）
  const ctx = resolveCtx(sources.te.src);
  log(`语义解析 OK: react=${ctx.react} nodeId=${ctx.nodeId} metaSave=${ctx.metaSave} p2Data=${ctx.p2Data} ` +
      `phase=${ctx.phase}/${ctx.setPhase} enter=${ctx.enterFloor} victory=${ctx.combatVictory} cfg=${ctx.regionCfg} dbg=${ctx.debugFlag}`);

  // 2. 依序打补丁（与 v3.20 相同顺序，保证输出字节一致）
  for (const t of TARGETS) {
    for (const pname of t.patches) {
      const fn = loadPatch(pname);
      const before = sources[t.key].src.length;
      try {
        sources[t.key].src = fn({
          src: sources[t.key].src, ctx: t.key === 'te' ? ctx : {},
          log: m => log(`[${pname}] ${m}`),
        });
      } catch (e) {
        if (e instanceof PatchError) { collectDiag(e, sourceInfo(sources)); throw e; }
        throw e;
      }
      log(`[${pname}] ${t.key}: ${before} -> ${sources[t.key].src.length} 字符`);
    }
  }
  if (ctx.warnings) diags.warnings.push(...ctx.warnings);
  return ctx;
}

function sourceInfo(sources) {
  const info = {};
  for (const t of TARGETS) {
    const s = sources[t.key];
    if (s && s.name) info[t.key] = { name: s.name, size: s.size, hash: sha256(Buffer.from(s.src, 'utf8')).slice(0, 16) + '…(补丁后)' };
  }
  return info;
}

// ---------- 标记校验（语义化，跨版本有效） ----------
function verifyMarkers(sources, ctx) {
  const te = sources.te.src, idx = sources.idx.src, ac = sources.ac.src;
  const checks = [
    ['TE 桥接 __RH_MOD__', te.includes('window.__RH_MOD__={')],
    ['TE setAutoWin', te.includes('setAutoWin:(on)')],
    ['TE autoWin effect', te.includes('[MOD]autoWin')],
    ['TE 战利品分流', /lootBoxState:[A-Za-z_$][\w$]*\?\.enemy\.encounterType==="boss"\?/.test(te)],
    ['TE 普通战斗自动全收', /phase:[A-Za-z_$][\w$]*\?"boss_first_kill_reward":[A-Za-z_$][\w$]*\?\.enemy\.encounterType==="boss"\?"loot_box":"floor_explore",/.test(te)],
    ['TE 楼层标志位', te.includes('towerAllFloorsUnlocked') && te.includes('__RH_UNLOCK_ALL__')],
    ['TE 楼层还原', te.includes('restoreProgressFloor')],
    ['TE 防御性Wa', te.includes('[MOD]Da')],
    ['TE P1 定位器限制已移除', /=0;if\(/.test(te) && !/![A-Za-z_$][\w$]*&&[A-Za-z_$][\w$]*\.isActive&&[A-Za-z_$][\w$]*>1&&![A-Za-z_$][\w$]*\.includes\(/.test(te)],
    ['TE 不含面板(禁止 RH_MOD_PANEL)', !te.includes('RH_MOD_PANEL')],
    ['index 面板注入', idx.includes('/*==RH_MOD_PANEL==*/')],
    ['index 面板守卫', idx.includes('__RH_PANEL_READY__')],
    ['index 面板 KEY F8', idx.includes("var KEY = 'F8'")],
    ['AC 生态注入 __RH_ECO__', ac.includes('__RH_ECO__')],
    ['AC 生态标记 RH_ECO_INJECT', ac.includes('RH_ECO_INJECT')],
    ['AC 无残留占位符', !ac.includes('__RH_FN_')],
    ['AC 宰杀/菜谱已解析', /var rr = [A-Za-z0-9_$]+\(cur, doomed\[i\]\.id\)/.test(ac) && /var recipes = [A-Za-z0-9_$]+\(\(stove\.level/.test(ac)],
  ];
  let ok = true;
  for (const [name, pass] of checks) {
    log(`[VERIFY ${pass ? 'OK' : 'FAIL'}] ${name}`);
    if (!pass) ok = false;
  }
  return ok;
}

// ---------- 主流程 ----------
function main() {
  const args = process.argv.slice(2);
  let gameDir = null, fromDir = null, testOutput = null, keepTmp = false;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--from-dir') fromDir = args[++i];
    else if (args[i] === '--test-output') testOutput = args[++i];
    else if (args[i] === '--keep-tmp') keepTmp = true;
    else gameDir = args[i];
  }

  // ========== 模式 A: --from-dir（测试：对已有解包文件打补丁，不安装） ==========
  if (fromDir) {
    const sources = {};
    for (const t of TARGETS) {
      const fnameRe = new RegExp(t.fileRe.source.split('/').pop()); // 取文件名部分（TowerExploration-.*\.js$）
      const fname = fs.readdirSync(fromDir).find(f => fnameRe.test(f));
      if (!fname) { console.error('[PATCHER] 未找到目标文件: ' + t.fileRe); process.exit(1); }
      const buf = fs.readFileSync(path.join(fromDir, fname));
      sources[t.key] = { name: fname, size: buf.length, buf, src: buf.toString('utf8') };
    }
    runPatches(sources);
    if (!verifyMarkers(sources, {})) { console.error('[PATCHER] 标记校验失败'); process.exit(3); }
    if (testOutput) {
      fs.mkdirSync(testOutput, { recursive: true });
      for (const t of TARGETS) fs.writeFileSync(path.join(testOutput, sources[t.key].name), Buffer.from(sources[t.key].src, 'utf8'));
      log('补丁结果已写入 ' + testOutput);
    }
    log('完成（--from-dir 测试模式，未安装）');
    return;
  }

  // ========== 模式 B: 完整安装 ==========
  if (!gameDir) { console.error('用法: node mod_patcher.js <游戏目录>'); process.exit(1); }
  const res = path.join(gameDir, 'resources');
  const asar = path.join(res, 'app.asar');
  const bak = path.join(res, 'app.asar.bak');
  const appDir = path.join(res, 'app');
  const tmpDir = path.join(res, 'app.tmp');
  const unpacked = path.join(res, 'app.asar.unpacked');

  // --- B1. 状态整理 ---
  // 上次安装中断的恢复：asar 缺失但 bak 在、又没有 app 目录 → 先把原版还原回来
  if (!fs.existsSync(asar) && fs.existsSync(bak) && !fs.existsSync(appDir)) {
    renameWithRetry(bak, asar);
    log('检测到上次安装中断，已先还原原版 app.asar');
  }
  // 游戏更新过(app+asar 并存) → 清旧；已装(bak 在、asar 不在) → 走快速重装
  if (fs.existsSync(appDir) && fs.existsSync(asar)) {
    log('检测到游戏已更新（app 与 app.asar 并存），清理旧 MOD …');
    fs.rmSync(appDir, { recursive: true, force: true });
    if (fs.existsSync(bak)) fs.rmSync(bak, { force: true });
  }
  if (fs.existsSync(appDir) && !fs.existsSync(asar)) {
    if (!fs.existsSync(bak)) throw new Error('已安装 MOD 但找不到 app.asar.bak，无法确定原版。请手动处理 resources 目录。');
    log('检测到已安装 MOD（快速重装：仅重打 3 个 js）…');
    // 快速路径：从 bak 提取 3 个原版 js → 内存补丁 → 覆盖 app 内文件
    const sources = {};
    for (const t of TARGETS) {
      const r = extractOneFromAsar(bak, t.fileRe);
      if (!r) throw new Error('原版备份中未找到 ' + t.fileRe);
      sources[t.key] = { name: r.name, size: r.buf.length, buf: r.buf, src: r.buf.toString('utf8') };
    }
    const ctx = runPatches(sources);
    if (!verifyMarkers(sources, ctx)) { console.error('[PATCHER] 标记校验失败'); process.exit(3); }
    const assetsDir = path.join(appDir, 'dist_steam', 'assets');
    for (const t of TARGETS) {
      const out = Buffer.from(sources[t.key].src, 'utf8');
      fs.writeFileSync(path.join(assetsDir, sources[t.key].name), out);
    }
    fs.writeFileSync(path.join(res, 'rhmod_installed.json'), JSON.stringify({
      modVersion: MOD_VERSION, installedAt: new Date().toISOString(), mode: 'fast-repatch',
      files: Object.fromEntries(Object.entries(sources).map(([k, v]) => [k, { name: v.name, sha256: sha256(Buffer.from(v.src, 'utf8')) }])),
    }, null, 2));
    log('快速重装完成！启动游戏，进入废墟探索后按 F8。');
    return;
  }
  if (!fs.existsSync(asar)) throw new Error('找不到 app.asar（游戏文件可能已被改动）');

  // --- B2. 全量解包到 app.tmp ---
  const asarSize = fs.statSync(asar).size;
  log(`解包 app.asar (${asarSize} 字节)，目标 ${tmpDir} …`);
  if (fs.existsSync(tmpDir)) fs.rmSync(tmpDir, { recursive: true, force: true });
  const stat = extractAsar(asar, tmpDir);
  log(`解包完成: ${stat.files} 个文件 ${(stat.totalBytes / 1024 / 1024).toFixed(1)} MB（unpacked ${stat.skipped} 个稍后补齐）`);

  // --- B3. 补丁 ---
  const assetsDir = path.join(tmpDir, 'dist_steam', 'assets');
  const sources = {};
  for (const t of TARGETS) {
    const fname = fs.readdirSync(assetsDir).find(f => t.fileRe.test('dist_steam/assets/' + f));
    if (!fname) throw new Error('解包结果中未找到 ' + t.fileRe);
    const buf = fs.readFileSync(path.join(assetsDir, fname));
    sources[t.key] = { name: fname, size: buf.length, buf, src: buf.toString('utf8') };
    log(`目标 ${t.key}: ${fname} (${buf.length} 字节)`);
  }
  const ctx = runPatches(sources);

  // --- B4. 校验 ---
  if (!verifyMarkers(sources, ctx)) {
    console.error('[PATCHER] MOD 标记校验失败，中止安装');
    process.exit(3);
  }
  log('MOD 标记校验全部通过');

  // --- B5. 写入补丁结果 + 补齐 unpacked ---
  for (const t of TARGETS) {
    fs.writeFileSync(path.join(assetsDir, sources[t.key].name), Buffer.from(sources[t.key].src, 'utf8'));
  }
  if (fs.existsSync(unpacked)) {
    fs.cpSync(unpacked, tmpDir, { recursive: true });
    log('已补齐原生模块（steamworks.js 等）');
  }
  fs.writeFileSync(path.join(res, 'rhmod_installed.json'), JSON.stringify({
    modVersion: MOD_VERSION, installedAt: new Date().toISOString(), mode: 'full',
    asarBytes: asarSize,
    files: Object.fromEntries(Object.entries(sources).map(([k, v]) => [k, { name: v.name, sha256: sha256(Buffer.from(v.src, 'utf8')) }])),
  }, null, 2));

  // --- B6. 切换：先上 app（app+asar 并存的中断状态可被下次安装自动清理），最后备份 asar ---
  if (fs.existsSync(appDir)) fs.rmSync(appDir, { recursive: true, force: true });
  renameWithRetry(tmpDir, appDir);
  if (fs.existsSync(bak)) fs.rmSync(bak, { force: true });
  renameWithRetry(asar, bak);
  log('已备份原版 app.asar -> app.asar.bak');

  log('');
  log('================ 安装成功 ================');
  log(` MOD ${MOD_VERSION}（自动适配架构）安装完成。`);
  log(' 启动游戏，进入废墟探索后按 F8 打开修改面板。');
  log(' 还原原版请运行「还原MOD.bat」。');
  log('==========================================');
}

// ---------- 入口（带诊断兜底） ----------
try {
  main();
} catch (e) {
  if (e instanceof PatchError) {
    console.error('[PATCHER] 补丁锚点失效: ' + e.message);
    // 诊断文件位置：优先游戏 resources，其次 cwd
    let out = 'MOD适配诊断.txt';
    const gd = process.argv[2];
    if (gd && fs.existsSync(path.join(gd, 'resources'))) out = path.join(gd, 'resources', 'MOD适配诊断.txt');
    else if (process.argv.includes('--from-dir')) out = path.join(process.cwd(), 'MOD适配诊断.txt');
    // 清理 app.tmp
    try {
      const gd2 = process.argv[2];
      if (gd2 && !process.argv.includes('--from-dir')) fs.rmSync(path.join(gd2, 'resources', 'app.tmp'), { recursive: true, force: true });
    } catch (_) {}
    const file = writeDiagnostics(out, LAST_SOURCES ? sourceInfo(LAST_SOURCES) : null, LAST_SOURCES);
    console.error('[PATCHER] 已生成诊断文件: ' + file);
    console.error('[PATCHER] 游戏未被修改。请把诊断文件发给 MOD 作者。');
    process.exit(2);
  }
  console.error('[PATCHER] 运行错误: ' + (e && e.stack || e));
  process.exit(1);
}
