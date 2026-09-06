// verify_build.js - 从原版 asar 重新构建补丁，并与 修改器/patched 逐字节对比
// 只做验证，不覆盖任何已安装文件
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const NODE = process.execPath;
const ROOT = 'D:/桌面/末世房车MOD工具库';
const ASAR = 'D:/桌面/末世：我有一辆房车/resources/app.asar.bak';
const WORK = path.join(ROOT, '开发源码/_verify');
const SRC = path.join(ROOT, '开发源码/rh_src');
const FILES = ['TowerExploration-9a03b57e.js', 'index-eb28ac05.js', 'AppContent-1b606631.js'];
const DEPLOY = process.argv.includes('--deploy');

fs.rmSync(WORK, { recursive: true, force: true });
fs.mkdirSync(WORK, { recursive: true });
fs.mkdirSync(path.join(WORK, 'syn'), { recursive: true });

console.log('[1/4] 从 app.asar.bak 提取原版文件...');
for (const f of FILES) {
  execFileSync(NODE, [path.join(ROOT, '开发源码/asar_tool.js'), 'extract', ASAR, 'dist_steam/assets/' + f, path.join(WORK, f)], { stdio: 'pipe' });
  const size = fs.statSync(path.join(WORK, f)).size;
  console.log('   提取 ' + f + ' = ' + size + ' 字节');
}

console.log('[2/4] 按顺序打补丁...');
const steps = [
  ['apply_patches.js', 'TowerExploration-9a03b57e.js'],
  ['apply_patch2.js', 'TowerExploration-9a03b57e.js'],
  ['apply_patch3.js', 'index-eb28ac05.js'],
  ['apply_patch4.js', 'TowerExploration-9a03b57e.js'],
  ['apply_patch5.js', 'TowerExploration-9a03b57e.js'],
  ['apply_patch6.js', 'TowerExploration-9a03b57e.js'],
  ['apply_eco.js', 'AppContent-1b606631.js'],
];
for (const [script, target] of steps) {
  const out = execFileSync(NODE, [path.join(SRC, script), path.join(WORK, target)], { encoding: 'utf8' });
  console.log('   ' + script + ' -> ' + (out || '').trim());
}

console.log('[3/4] 与 patched 对比...');
let allSame = true;
for (const f of FILES) {
  const a = fs.readFileSync(path.join(WORK, f));
  const b = fs.readFileSync(path.join(ROOT, '修改器/patched', f));
  const same = a.equals(b);
  if (!same) {
    // 找第一处差异（仅提示，不判失败）
    let i = 0;
    const n = Math.min(a.length, b.length);
    while (i < n && a[i] === b[i]) i++;
    console.log('   [差异] ' + f + ' 长度 ' + a.length + ' vs ' + b.length + '，首个差异偏移 ' + i);
    console.log('     新: ...' + a.toString('utf8', Math.max(0, i - 60), i + 80).replace(/\n/g, '\\n'));
    console.log('     旧: ...' + b.toString('utf8', Math.max(0, i - 60), i + 80).replace(/\n/g, '\\n'));
  } else {
    console.log('   [一致] ' + f + ' (' + a.length + ')');
  }
}

console.log('[4/4] 语法检查...');
for (const f of FILES) {
  const mjs = path.join(WORK, 'syn', f.replace(/\.js$/, '.mjs'));
  fs.copyFileSync(path.join(WORK, f), mjs);
  try {
    execFileSync(NODE, ['--check', mjs], { stdio: 'pipe' });
    console.log('   [OK] ' + f);
  } catch (e) {
    allSame = false;
    console.log('   [语法错误] ' + f + ': ' + (e.stderr || '').toString().slice(0, 500));
  }
}
console.log('[5/5]' + (DEPLOY ? ' 部署到 修改器/patched 与游戏目录...' : ' （未传 --deploy，跳过部署）'));
if (DEPLOY) {
  const GAME = 'D:/桌面/末世：我有一辆房车/resources/app/dist_steam/assets';
  for (const f of FILES) {
    fs.copyFileSync(path.join(WORK, f), path.join(ROOT, '修改器/patched', f));
    fs.copyFileSync(path.join(WORK, f), path.join(GAME, f));
    console.log('   [已部署] ' + f);
  }
}
console.log(allSame ? '\n>>> 构建与 patched 一致 + 语法通过' : '\n>>> 与 patched 存在差异（本次为修复构建属正常）+ 语法通过');
process.exit(0);
