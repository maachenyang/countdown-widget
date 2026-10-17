'use strict';

/**
 * 生成 tray 图标（纯 Node，无依赖）
 *   assets/tray-light.png  深色任务栏用
 *   assets/tray-dark.png   浅色任务栏用
 *
 * 应用图标（icon.ico）由 tools/make-icon.js 另外生成。
 */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const OUT_DIR = path.join(__dirname, '..', 'assets');
const SIZE = 32;
const SS = 4;

/* ------------------------------------------------------------ PNG 编码 */

const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

function encodePNG(rgba, width, height) {
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0;
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

/* ------------------------------------------------------------ 绘制 */

function hexToRgb(hex) {
  return [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16)
  ];
}

function inRoundRect(x, y, x0, y0, x1, y1, r) {
  if (x < x0 || x > x1 || y < y0 || y > y1) return false;
  const cx = Math.min(Math.max(x, x0 + r), x1 - r);
  const cy = Math.min(Math.max(y, y0 + r), y1 - r);
  const dx = x - cx;
  const dy = y - cy;
  return dx * dx + dy * dy <= r * r;
}

/** 托盘小图标：圆角卡片 + 顶部色带 + 中间圆点 */
function drawTray(bodyHex, markHex) {
  const body = hexToRgb(bodyHex);
  const mark = hexToRgb(markHex);
  const N = SIZE * SS;
  const acc = new Float32Array(N * N * 3);
  const cov = new Uint8Array(N * N);

  const pad = 3 * SS;
  const radius = 7 * SS;
  const barBottom = 12 * SS;

  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const px = x + 0.5;
      const py = y + 0.5;
      if (!inRoundRect(px, py, pad, pad, N - pad, N - pad, radius)) continue;
      const i = y * N + x;
      cov[i] = 1;
      const inBar = py < barBottom;
      const dx = px - N / 2;
      const dy = py - 19 * SS;
      const inDot = dx * dx + dy * dy <= (4.6 * SS) * (4.6 * SS);
      const c = inBar || inDot ? mark : body;
      acc[i * 3] = c[0];
      acc[i * 3 + 1] = c[1];
      acc[i * 3 + 2] = c[2];
    }
  }

  const out = Buffer.alloc(SIZE * SIZE * 4);
  const total = SS * SS;
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const si = (y * SS + sy) * N + (x * SS + sx);
          if (!cov[si]) continue;
          r += acc[si * 3];
          g += acc[si * 3 + 1];
          b += acc[si * 3 + 2];
          a += 1;
        }
      }
      const o = (y * SIZE + x) * 4;
      if (a === 0) continue;
      out[o] = Math.round(r / a);
      out[o + 1] = Math.round(g / a);
      out[o + 2] = Math.round(b / a);
      out[o + 3] = Math.round((a / total) * 255);
    }
  }

  return encodePNG(out, SIZE, SIZE);
}

fs.mkdirSync(OUT_DIR, { recursive: true });
fs.writeFileSync(path.join(OUT_DIR, 'tray-light.png'), drawTray('#FFFFFF', '#1C1C1E'));
fs.writeFileSync(path.join(OUT_DIR, 'tray-dark.png'), drawTray('#1C1C1E', '#FFFFFF'));
console.log('托盘图标已生成：tray-light.png / tray-dark.png');
