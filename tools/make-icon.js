'use strict';

/**
 * 生成应用图标：
 *   1) 让 Electron 把 tools/icon.html 渲染成 16/24/32/48/64/128/256/512 的 PNG
 *   2) 打成多尺寸 assets/icon.ico（给 electron-builder 用）
 *   3) 256 的那张另存为 assets/icon.png
 *
 * 用法：node tools/make-icon.js
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const EXE = path.join(ROOT, 'node_modules', 'electron', 'dist', 'electron.exe');
const SIZES = [16, 24, 32, 48, 64, 128, 256, 512];
const SRC_DIR = path.join(ROOT, 'assets', 'icon-sizes');
const ASSETS = path.join(ROOT, 'assets');

/* -------------------------------------------------- 1) 渲染 */

function render() {
  fs.rmSync(SRC_DIR, { recursive: true, force: true });
  fs.mkdirSync(SRC_DIR, { recursive: true });

  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;

  execFileSync(EXE, ['--no-sandbox', ROOT, '--icon-shot'], { cwd: ROOT, env, stdio: 'inherit' });

  const missing = SIZES.filter((s) => !fs.existsSync(path.join(SRC_DIR, `icon-${s}.png`)));
  if (missing.length) throw new Error('缺少尺寸: ' + missing.join(', '));
}

/* -------------------------------------------------- 2) 校验尺寸 */

function readPngSize(file) {
  const buf = fs.readFileSync(file);
  if (buf.slice(1, 4).toString('ascii') !== 'PNG') throw new Error('不是 PNG: ' + file);
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20), bytes: buf };
}

/* -------------------------------------------------- 3) 打 ICO */

function buildICO(images) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);

  const entries = [];
  let offset = 6 + images.length * 16;

  for (const img of images) {
    const e = Buffer.alloc(16);
    e[0] = img.size >= 256 ? 0 : img.size;
    e[1] = img.size >= 256 ? 0 : img.size;
    e[2] = 0;
    e[3] = 0;
    e.writeUInt16LE(1, 4);   // planes
    e.writeUInt16LE(32, 6);  // bit depth
    e.writeUInt32LE(img.bytes.length, 8);
    e.writeUInt32LE(offset, 12);
    entries.push(e);
    offset += img.bytes.length;
  }

  return Buffer.concat([header, ...entries, ...images.map((i) => i.bytes)]);
}

/* -------------------------------------------------- 主流程 */

try {
  console.log('渲染图标…');
  render();

  const images = [];
  for (const size of SIZES) {
    const file = path.join(SRC_DIR, `icon-${size}.png`);
    const info = readPngSize(file);
    if (info.width !== size || info.height !== size) {
      throw new Error(`${path.basename(file)} 实际 ${info.width}x${info.height}，应为 ${size}x${size}`);
    }
    images.push({ size, bytes: info.bytes });
    console.log(`  icon-${String(size).padEnd(3)}.png  ${String(info.bytes.length).padStart(7)} bytes  ✓`);
  }

  const ico = buildICO(images.filter((i) => i.size <= 256));
  fs.writeFileSync(path.join(ASSETS, 'icon.ico'), ico);
  fs.copyFileSync(path.join(SRC_DIR, 'icon-256.png'), path.join(ASSETS, 'icon.png'));

  console.log(`\nassets/icon.ico  ${(ico.length / 1024).toFixed(1)} KB  (含 16/24/32/48/64/128/256)`);
  console.log(`assets/icon.png  256×256`);
} catch (err) {
  console.error('失败:', err.message);
  process.exit(1);
}
