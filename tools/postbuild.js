'use strict';

/**
 * 打包后处理：把兼容启动器复制到 dist 和免解压目录里，
 * 这样用户拿到 exe 就能直接用它兜底（临时目录不可写 / 沙箱起不来）。
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'launcher-compat.bat');

if (!fs.existsSync(SRC)) {
  console.log('跳过：没有 launcher-compat.bat');
  process.exit(0);
}

const targets = [
  path.join(ROOT, 'dist', 'launcher-compat.bat'),
  path.join(ROOT, 'dist', 'win-unpacked', 'launcher-compat.bat')
];

for (const dest of targets) {
  try {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(SRC, dest);
    console.log('已复制启动器 ->', path.relative(ROOT, dest));
  } catch (err) {
    console.log('跳过', path.relative(ROOT, dest), '：', err.message);
  }
}
