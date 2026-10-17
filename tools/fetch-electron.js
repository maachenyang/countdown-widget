'use strict';
// 用 Node 原生 fetch 从镜像下载 Electron 二进制（curl 的 schannel 在此环境不可用）
const fs = require('fs');
const path = require('path');

const VERSION = require('../node_modules/electron/package.json').version;
const ARCH = process.arch === 'arm64' ? 'arm64' : 'x64';
const NAME = `electron-v${VERSION}-win32-${ARCH}.zip`;
const URLS = [
  `https://npmmirror.com/mirrors/electron/${VERSION}/${NAME}`,
  `https://cdn.npmmirror.com/binaries/electron/${VERSION}/${NAME}`,
  `https://github.com/electron/electron/releases/download/v${VERSION}/${NAME}`
];

const OUT_DIR = path.join(__dirname, '..', '..', '.electron-cache');
const OUT = path.join(OUT_DIR, NAME);

async function head(url) {
  const res = await fetch(url, { method: 'GET', redirect: 'follow' });
  return res;
}

(async () => {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  let lastErr;
  for (const url of URLS) {
    try {
      console.log('尝试:', url);
      const res = await fetch(url, { redirect: 'follow' });
      if (!res.ok) {
        console.log('  状态:', res.status);
        lastErr = new Error(`HTTP ${res.status}`);
        continue;
      }
      const total = Number(res.headers.get('content-length') || 0);
      console.log('  开始下载, 大小:', total ? (total / 1048576).toFixed(1) + ' MB' : '未知');
      const file = fs.createWriteStream(OUT);
      let got = 0;
      let mark = 0;
      for await (const chunk of res.body) {
        got += chunk.length;
        file.write(chunk);
        if (got - mark > 8 * 1024 * 1024) {
          mark = got;
          console.log('  已下载:', (got / 1048576).toFixed(1), 'MB');
        }
      }
      await new Promise((r) => file.end(r));
      console.log('完成 ->', OUT, (got / 1048576).toFixed(1), 'MB');
      return;
    } catch (err) {
      console.log('  失败:', err.message);
      lastErr = err;
    }
  }
  console.error('全部失败:', lastErr && lastErr.message);
  process.exit(1);
})();
