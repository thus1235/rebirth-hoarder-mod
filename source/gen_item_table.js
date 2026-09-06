// gen_item_table.js - 从游戏本体 index-*.js 提取 ITEMS 物品表 → 生成存档修改器用的 C# 数据文件
// 用法: node gen_item_table.js [游戏index.js路径]
// 输出: item_table.cs（id|名称|类型|稀有度|最大堆叠|是否装备 逐行常量）
// 说明: 不 eval 游戏代码，按顶层条目切分 + 字段正则提取，只取 id/name/type/rarity/tier/
//       maxStack/maxQuantity/maxDurability/icon，避免依赖未知外部标识符。
const fs = require('fs');
const path = require('path');

const idxPath = process.argv[2] || path.join(__dirname, '..', '_orig', 'index-eb28ac05.js');
const outCs = process.argv[3] || path.join(__dirname, 'item_table.cs');
const outJson = process.argv[4] || path.join(__dirname, 'items_parsed.json');

const s = fs.readFileSync(idxPath, 'utf8');

// ---- 1. 定位 ITEMS 对象字面量：第一个顶层 "XX={id:" 且首条目带 name:" 的对象 ----
// 已知锚点（2026-09 版本）: const kr={mat_steel:{...
// 通用做法：找所有 /[\w$]+=\{[\w$]+:\{id:"/ 起点，取首个解析成功的
function findItemsObject(src) {
  const re = /[\w$]+=\{([\w$]+):\{id:"/g;
  let m;
  while ((m = re.exec(src))) {
    const start = src.indexOf('{', m.index);
    let depth = 0, end = -1, inStr = false, q = '';
    for (let i = start; i < src.length; i++) {
      const c = src[i];
      if (inStr) { if (c === q && src[i - 1] !== '\\') inStr = false; continue; }
      if (c === '"' || c === "'" || c === '`') { inStr = true; q = c; continue; }
      if (c === '{') depth++;
      else if (c === '}') { depth--; if (!depth) { end = i; break; } }
    }
    if (end < 0) continue;
    const body = src.slice(start + 1, end);
    // 校验：至少 100 个条目且含 type:" 字段
    if ((body.match(/type:"/g) || []).length > 100) return body;
  }
  return null;
}

const body = findItemsObject(s);
if (!body) { console.error('[fail] 未定位到 ITEMS 对象'); process.exit(1); }

// ---- 2. 顶层条目切分（尊重字符串/括号嵌套） ----
function splitTop(body) {
  const entries = [];
  let d = 0, cur = '', inStr = false, q = '';
  for (let i = 0; i < body.length; i++) {
    const c = body[i];
    if (inStr) { cur += c; if (c === q && body[i - 1] !== '\\') inStr = false; continue; }
    if (c === '"' || c === "'" || c === '`') { inStr = true; q = c; cur += c; continue; }
    if (c === '{' || c === '[' || c === '(') d++;
    if (c === '}' || c === ']' || c === ')') d--;
    if (c === ',' && d === 0) { entries.push(cur); cur = ''; continue; }
    cur += c;
  }
  if (cur.trim()) entries.push(cur);
  return entries;
}

const entries = splitTop(body);
// ---- 3. 逐条目正则提取字段 ----
function unesc(x) { return x.replace(/\\u([\da-fA-F]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16))); }
function strF(e, f) { const r = new RegExp(f + ':"((?:[^"\\\\]|\\\\.)*)"').exec(e); return r ? unesc(r[1]) : ''; }
function numF(e, f) { const r = new RegExp(f + ':([0-9][0-9.eE+]*)').exec(e); return r ? Number(r[1]) : null; }

const items = [];
for (const e of entries) {
  const m = /^([\w$]+):\{/.exec(e);
  if (!m) continue;
  const id = m[1];
  const it = {
    id,
    name: strF(e, 'name'),
    type: strF(e, 'type'),
    rarity: strF(e, 'rarity') || strF(e, 'tier'),
    maxStack: numF(e, 'maxStack'),
    maxQuantity: numF(e, 'maxQuantity'),
    maxDurability: numF(e, 'maxDurability'),
    icon: strF(e, 'icon'),
  };
  if (!it.name) continue;
  items.push(it);
}

if (items.length < 100) { console.error('[fail] 条目解析过少: ' + items.length); process.exit(1); }

// ---- 4. 拼音首字母（搜索引擎用；pinyin-pro 纯 JS，构建期一次性生成内嵌表） ----
let pyInit = null;
try {
  const { pinyin } = require(path.join(__dirname, 'pinyindir', 'node_modules', 'pinyin-pro'));
  pyInit = function (name) {
    try {
      return pinyin(name, { pattern: 'first', toneType: 'none', type: 'array', nonZh: 'consecutive' })
        .join('').replace(/[^a-zA-Z]/g, '').toLowerCase();
    } catch (e) { return ''; }
  };
} catch (e) { console.warn('[warn] pinyin-pro 未安装，跳过拼音列'); }

// ---- 5. 类型汇总 + 生成 C# ----
const types = {};
for (const it of items) types[it.type] = (types[it.type] || 0) + 1;
const GEAR_TYPES = { weapon: 1, armor: 1, equipment: 1, gear: 1, melee: 1, ranged: 1, firearm: 1 };
// 稀有度：游戏物品定义若无 rarity 字段，则武器/防具默认可指定稀有度
for (const it of items) it.isGear = (GEAR_TYPES[it.type] || (it.maxDurability > 0 && it.maxStack == null)) ? 1 : 0;

items.sort((a, b) => (a.type || '').localeCompare(b.type || '') || a.id.localeCompare(b.id));

const lines = items.map(it => [
  it.id, it.name, it.type || '', it.rarity || '',
  it.maxStack == null ? '' : it.maxStack,
  it.isGear ? '1' : '',
  it.maxDurability == null ? '' : it.maxDurability,
  it.icon || '',
  pyInit ? pyInit(it.name) : '',
].join('|'));

const cs = `// 自动生成：游戏内 ITEMS 物品表（勿手改；来源 index-*.js，由 gen_item_table.js 生成）
// 格式: id|中文名|类型|稀有度|最大堆叠|是否装备(1)|最大耐久|图标|拼音首字母
static class ItemTable
{
    public const string Items = "${lines.join('\\n')}";
}
`;
fs.writeFileSync(outCs, cs, 'utf8');
fs.writeFileSync(outJson, JSON.stringify(items, null, 1), 'utf8');
console.log('[ok] 物品 ' + items.length + ' 条；类型分布: ' + JSON.stringify(types));
console.log('[ok] 已写出 ' + outCs);
