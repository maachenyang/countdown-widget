'use strict';

/**
 * 批量生成预览图（用 Electron 自己的 capturePage）
 * 用法：node tools/shots.js
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const EXE = path.join(ROOT, 'node_modules', 'electron', 'dist', 'electron.exe');
const OUT = path.join(ROOT, 'preview');

// 演示用的三条倒计时，方便展示切换圆点和强调色
const ITEMS = [
  { id: 'i1', title: '考研初试', targetDate: '2026-12-19', startDate: '2026-09-01', accent: '#1C1C1E' },
  { id: 'i2', title: '项目上线', targetDate: '2026-11-05', startDate: '2026-10-01', accent: '#0A84FF' },
  { id: 'i3', title: '她的生日', targetDate: '2027-03-14', startDate: '', accent: '#FF3B30' }
];

const BASE = {
  version: 2,
  items: ITEMS,
  activeId: 'i1',
  theme: 'light',
  glass: 'css',
  scale: 1,
  alwaysOnTop: false,
  openAtLogin: false,
  bounds: null
};

const variants = [
  { name: 'light.png', theme: 'light' },
  { name: 'dark.png', theme: 'dark' },
  { name: 'accent.png', theme: 'light', activeId: 'i2' },
  { name: 'scale-150.png', theme: 'light', scale: 1.5 },
  { name: 'glass-acrylic.png', glass: 'acrylic' },
  { name: 'glass-solid.png', glass: 'solid' },
  { name: 'settings.png', theme: 'light', page: 'settings' },
  { name: 'editor.png', theme: 'light', page: 'editor' }
];

fs.mkdirSync(OUT, { recursive: true });

for (const v of variants) {
  const cfg = {
    ...BASE,
    theme: v.theme || 'light',
    glass: v.glass || 'css',
    scale: v.scale || 1,
    activeId: v.activeId || 'i1'
  };
  fs.writeFileSync(path.join(ROOT, 'config.json'), JSON.stringify(cfg, null, 2) + '\n', 'utf8');

  const args = ['--no-sandbox', ROOT, '--shot', `--shot-name=preview/${v.name}`];
  if (v.page) args.push(`--shot-page=${v.page}`);

  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;

  try {
    execFileSync(EXE, args, { cwd: ROOT, env, stdio: 'inherit' });
    const size = fs.statSync(path.join(OUT, v.name)).size;
    console.log(`  ✓ ${v.name}  ${(size / 1024).toFixed(0)} KB`);
  } catch (err) {
    console.error(`  ✗ ${v.name}  ${err.message}`);
  }
}

// 还原成单条默认配置
fs.writeFileSync(
  path.join(ROOT, 'config.json'),
  JSON.stringify({ ...BASE, items: [ITEMS[0]], activeId: 'i1' }, null, 2) + '\n',
  'utf8'
);
console.log('\n预览图输出目录：' + OUT);
