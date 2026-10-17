'use strict';

/**
 * 考研倒计时 · 桌面小组件
 * 极简 ins 风格 / 无边框 / 毛玻璃 / 常驻桌面
 */

const { app, BrowserWindow, ipcMain, Menu, Tray, nativeImage, nativeTheme, screen } = require('electron');
const path = require('path');
const fs = require('fs');

// 生成应用图标时强制 1:1 像素，避免被系统缩放的 DPR 放大
const ICON_SHOT = process.argv.includes('--icon-shot');
if (ICON_SHOT) app.commandLine.appendSwitch('force-device-scale-factor', '1');

// 资源目录（开发时是项目根；打包后是 app.asar 内部）
const ROOT = path.join(__dirname, '..');

// 用户数据目录：开发时放在项目里；打包后优先放在 exe 旁边（便携），
// 如果那个位置不可写（比如装进了 Program Files），退回系统 AppData。
const DATA_DIR = (() => {
  if (!app.isPackaged) return ROOT;
  const nearExe = process.env.PORTABLE_EXECUTABLE_DIR || path.dirname(process.execPath);
  try {
    const probe = path.join(nearExe, '.userdata');
    fs.mkdirSync(probe, { recursive: true });
    fs.accessSync(probe, fs.constants.W_OK);
    return nearExe;
  } catch (_) {
    return app.getPath('userData');
  }
})();

const USER_DATA = path.join(DATA_DIR, '.userdata');

// ---- 沙箱/便携友好：所有运行时数据都放在可写目录内 ----------------------
for (const dir of [USER_DATA, path.join(USER_DATA, 'cache'), path.join(USER_DATA, 'tmp')]) {
  try { fs.mkdirSync(dir, { recursive: true }); } catch (_) { /* ignore */ }
}
app.setPath('userData', USER_DATA);
app.setPath('sessionData', USER_DATA);
app.setPath('cache', path.join(USER_DATA, 'cache'));

const CONFIG_FILE = path.join(DATA_DIR, 'config.json');

// 逻辑尺寸（CSS 像素）。实际窗口尺寸 = 逻辑尺寸 × 缩放比例，
// 同时把 webContents 的 zoomFactor 设成同一个比例，
// 这样字、圆角、间距、阴影全部等比放大，版式永远不会走形。
const BASE_SIZE = {
  main: { width: 336, height: 228 },
  settings: { width: 336, height: 476 },
  editor: { width: 336, height: 344 }
};

const SCALE_MIN = 0.8;
const SCALE_MAX = 1.8;
const SCALE_STEP = 0.05;

// 强调色预设：都压过饱和度，配白卡不显俗
const ACCENTS = ['#1C1C1E', '#0A84FF', '#34C759', '#FF9500', '#FF3B30', '#AF52DE'];

const CONFIG_VERSION = 2;

const DEFAULT_CONFIG = {
  version: CONFIG_VERSION,
  items: [],
  activeId: null,
  theme: 'light',      // light | dark | auto
  glass: 'css',        // css | acrylic | solid
  scale: 1,            // 0.8 ~ 1.8
  alwaysOnTop: false,
  openAtLogin: false,
  bounds: null
};

function isoDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function makeId() {
  return `i${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

function isIsoDate(v) {
  return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
}

function normalizeItem(raw) {
  const item = raw && typeof raw === 'object' ? raw : {};
  return {
    id: typeof item.id === 'string' && item.id ? item.id : makeId(),
    title: typeof item.title === 'string' && item.title.trim()
      ? item.title.trim().slice(0, 24)
      : '未命名倒计时',
    targetDate: isIsoDate(item.targetDate) ? item.targetDate : isoDate(new Date()),
    startDate: isIsoDate(item.startDate) ? item.startDate : '',
    accent: ACCENTS.includes(item.accent) ? item.accent : ACCENTS[0]
  };
}

function defaultItem() {
  const target = new Date();
  target.setDate(target.getDate() + 30);
  const item = normalizeItem({
    title: '我的倒计时',
    targetDate: isoDate(target),
    startDate: isoDate(new Date())
  });
  item.accent = ACCENTS[1];
  return item;
}

/** 老版本（单个 title/targetDate）自动迁移成 items[] */
function migrate(raw) {
  const cfg = { ...DEFAULT_CONFIG, ...(raw || {}) };

  if (Array.isArray(cfg.items) && cfg.items.length) {
    cfg.items = cfg.items.map(normalizeItem);
  } else if (raw && (raw.title || raw.targetDate)) {
    // v1 单条配置
    const item = normalizeItem({ title: raw.title, targetDate: raw.targetDate, startDate: raw.startDate });
    item.accent = ACCENTS[0];
    cfg.items = [item];
  } else {
    cfg.items = [defaultItem()];
  }

  const ids = cfg.items.map((i) => i.id);
  if (!cfg.activeId || !ids.includes(cfg.activeId)) cfg.activeId = cfg.items[0].id;

  cfg.version = CONFIG_VERSION;
  delete cfg.title;
  delete cfg.targetDate;
  delete cfg.startDate;
  return cfg;
}

function clampScale(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 1;
  return Math.min(SCALE_MAX, Math.max(SCALE_MIN, Math.round(n * 100) / 100));
}

function sizeOf(pageName) {
  const base = BASE_SIZE[pageName] || BASE_SIZE.main;
  const s = clampScale(config.scale);
  return { width: Math.round(base.width * s), height: Math.round(base.height * s) };
}

let config = { ...DEFAULT_CONFIG };
let win = null;
let tray = null;
let page = 'main';
let boundsTimer = null;

/* ------------------------------------------------------------------ 配置 */

function readConfig() {
  let raw = null;
  try {
    raw = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
  } catch (_) { /* 首次运行或文件损坏 */ }

  config = migrate(raw);
  writeConfig({}); // 迁移结果落盘
  return config;
}

function writeConfig(patch) {
  config = { ...config, ...(patch || {}) };
  try {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf8');
  } catch (err) {
    console.error('[config] 写入失败:', err.message);
  }
  return config;
}

/* -------------------------------------------------------------- 倒计时计算 */

function parseDate(str) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(str || '').trim());
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(d.getTime()) ? null : d;
}

function activeItem() {
  const items = config.items || [];
  return items.find((i) => i.id === config.activeId) || items[0] || null;
}

function daysLeft(item) {
  const it = item || activeItem();
  const target = parseDate(it && it.targetDate);
  if (!target) return null;
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((target - today) / 86400000);
}

function daysText(item) {
  const d = daysLeft(item);
  if (d === null) return '日期未设置';
  if (d > 0) return `还有 ${d} 天`;
  if (d === 0) return '就是今天';
  return `已过去 ${-d} 天`;
}

/* ------------------------------------------------------------------ 窗口 */

function defaultBounds(size) {
  const wa = screen.getPrimaryDisplay().workArea;
  return {
    x: wa.x + wa.width - size.width - 28,
    y: wa.y + wa.height - size.height - 28,
    width: size.width,
    height: size.height
  };
}

function sanitizeBounds(bounds, size) {
  const fallback = defaultBounds(size);
  if (!bounds || typeof bounds.x !== 'number' || typeof bounds.y !== 'number') return fallback;

  const displays = screen.getAllDisplays();
  const visible = displays.some((d) => {
    const wa = d.workArea;
    return (
      bounds.x + bounds.width > wa.x + 24 &&
      bounds.x < wa.x + wa.width - 24 &&
      bounds.y + bounds.height > wa.y + 24 &&
      bounds.y < wa.y + wa.height - 24
    );
  });

  if (!visible) return fallback;

  const wa = screen.getDisplayNearestPoint({ x: bounds.x, y: bounds.y }).workArea;
  return {
    x: Math.min(Math.max(bounds.x, wa.x - size.width + 60), wa.x + wa.width - 60),
    y: Math.min(Math.max(bounds.y, wa.y), wa.y + wa.height - 40),
    width: size.width,
    height: size.height
  };
}

function createWindow() {
  const glass = config.glass || 'css';
  const transparent = glass === 'css';
  const solidBg = (config.theme === 'dark') ? '#1e1e22' : '#fafafc';
  const size = sizeOf(page);
  const bounds = sanitizeBounds(config.bounds, size);

  win = new BrowserWindow({
    x: bounds.x,
    y: bounds.y,
    width: size.width,
    height: size.height,
    frame: false,
    transparent,
    backgroundColor: glass === 'solid' ? solidBg : '#00000000',
    backgroundMaterial: glass === 'acrylic' ? 'acrylic' : 'none',
    roundedCorners: glass !== 'css',
    hasShadow: false,
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    show: false,
    title: (activeItem() && activeItem().title) || '倒计时',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
      backgroundThrottling: false
    }
  });

  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  // 页面整体缩放到指定比例（字号、间距、圆角一起放大）
  win.webContents.setZoomFactor(clampScale(config.scale));
  // 导航到 file:// 之后 zoom 可能被重置，加载完再钉一次
  win.webContents.on('did-finish-load', () => {
    if (win && !win.isDestroyed()) win.webContents.setZoomFactor(clampScale(config.scale));
  });

  // 某些 Windows/DPI 组合下，创建时的实际尺寸会比请求值多出 2px，
  // 与 setPage 算出来的尺寸对不上，导致每次开关设置页尺寸都抖一下。
  // 这里统一钉死一次，保证任何路径拿到的都是同一个尺寸。
  win.setBounds({ x: bounds.x, y: bounds.y, width: size.width, height: size.height });

  // 开发用：--shot 把页面渲染结果存成 PNG 后退出（方便核对视觉）
  if (process.argv.includes('--shot')) {
    const pageArg = process.argv.find((a) => a.startsWith('--shot-page='));
    const shotPage = pageArg ? pageArg.split('=')[1] : null;
    const outFile = process.argv.find((a) => a.startsWith('--shot-name='));

    win.webContents.once('did-finish-load', () => {
      if (shotPage === 'settings' || shotPage === 'editor') {
        // 等渲染进程把事件绑好再切页
        setTimeout(() => {
          setPage(shotPage);
          const js = shotPage === 'settings'
            ? 'openSettings()'
            : 'openEditor(config.items[0] && config.items[0].id)';
          win.webContents.executeJavaScript(js).catch((err) => console.error('[shot]', err.message));
        }, 700);
      }
      setTimeout(async () => {
        try {
          const image = await win.webContents.capturePage();
          const out = path.join(ROOT, outFile ? outFile.split('=')[1] : 'preview.png');
          fs.writeFileSync(out, image.toPNG());
          console.log('[shot]', out);
        } catch (err) {
          console.error('[shot] 失败:', err.message);
        }
        app.exit(0);
      }, 1800);
    });
  }

  win.once('ready-to-show', () => {
    applyAlwaysOnTop();
    win.showInactive();
  });

  // 开发用：--dragtest 用合成鼠标事件跑一遍拖拽 + 缩放，检查窗口尺寸/位移
  if (process.argv.includes('--dragtest')) {
    win.webContents.once('did-finish-load', () => {
      setTimeout(async () => {
        const log = (...a) => console.log('[dragtest]', ...a);
        const b0 = win.getBounds();
        let allOk = true;
        log('初始      ', JSON.stringify(b0));

        // 把光标位置接管过来，这样测试能精确控制"光标移动到哪"
        const realCursor = screen.getCursorScreenPoint.bind(screen);
        let fakeCursor = null;
        screen.getCursorScreenPoint = () => fakeCursor || realCursor();

        const down = `document.getElementById('card').dispatchEvent(
          new MouseEvent('mousedown', { bubbles: true, button: 0, clientX: 150, clientY: 90 }))`;
        const up = `window.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, button: 0 }))`;

        const wait = (ms) => new Promise((r) => setTimeout(r, ms));

        try {
          // 连拖三次，跨度/方向各不相同：尺寸必须一毫米都不变，位移必须精确
          const drags = [[-160, -140], [140, 90], [-70, -60]];
          for (const [dx, dy] of drags) {
            const before = win.getBounds();
            fakeCursor = { x: 1150, y: 750 };
            await win.webContents.executeJavaScript(down);
            await wait(120);
            fakeCursor = { x: 1150 + dx, y: 750 + dy };
            await wait(160);
            await win.webContents.executeJavaScript(up);
            await wait(120);
            const after = win.getBounds();
            const sizeOk = after.width === b0.width && after.height === b0.height;
            const posOk = after.x - before.x === dx && after.y - before.y === dy;
            if (!sizeOk || !posOk) allOk = false;
            log(`拖动 (${String(dx).padStart(3)},${String(dy).padStart(3)})`,
              `${after.width}x${after.height}`,
              `位移 ${after.x - before.x},${after.y - before.y}`,
              sizeOk && posOk ? 'OK' : `不符!! 期望 ${dx},${dy} 且尺寸 ${b0.width}x${b0.height}`);
          }
        } catch (err) {
          log('拖拽测试失败:', err.message);
          allOk = false;
        }
        screen.getCursorScreenPoint = realCursor;

        setPage('settings');
        await wait(400);
        const settingsBounds = win.getBounds();
        log('打开设置  ', JSON.stringify(settingsBounds));
        setPage('main');
        await wait(400);
        log('回到主界面', JSON.stringify(win.getBounds()));

        // 缩放：窗口尺寸和 zoomFactor 必须同步
        const near = (a, b) => Math.abs(a - b) <= 2; // 150% 屏上有 1px 的 DPI 取整误差
        for (const s of [0.85, 1, 1.25, 1.5, 1.8]) {
          applyScale(s, true);
          await wait(320);
          const b = win.getBounds();
          const ew = Math.round(BASE_SIZE.main.width * s);
          const eh = Math.round(BASE_SIZE.main.height * s);
          const zoom = win.webContents.getZoomFactor();
          const ok = near(b.width, ew) && near(b.height, eh) && Math.abs(zoom - s) < 0.01;
          if (!ok) allOk = false;
          log(`缩放 ${String(Math.round(s * 100)).padStart(3)}%`,
            `窗口 ${b.width}x${b.height} (期望约 ${ew}x${eh})`,
            `zoom ${zoom.toFixed(2)}`, ok ? 'OK' : '不符!!');
        }

        // 缩放后再拖一次，尺寸必须跟着当前比例、且不漂移
        applyScale(1.25, true);
        await wait(300);
        const zBefore = win.getBounds();
        fakeCursor = { x: 900, y: 700 };
        screen.getCursorScreenPoint = () => fakeCursor;
        await win.webContents.executeJavaScript(down);
        await wait(120);
        fakeCursor = { x: 800, y: 640 };
        await wait(160);
        await win.webContents.executeJavaScript(up);
        await wait(150);
        const zAfter = win.getBounds();
        screen.getCursorScreenPoint = realCursor;
        const zOk = zAfter.width === zBefore.width && zAfter.height === zBefore.height;
        if (!zOk) allOk = false;
        log('125% 下拖动', `${zAfter.width}x${zAfter.height}`, zOk ? '尺寸 OK' : '尺寸漂移!!');

        // 走渲染进程 → IPC → save-config 的完整链路（设置页保存用的就是这条）
        applyScale(1, true);
        await wait(300);
        const ipcBefore = win.getBounds();
        try {
          await win.webContents.executeJavaScript('window.widget.saveConfig({ scale: 1.4 })');
          await wait(400);
          const ipcAfter = win.getBounds();
          const ipcOk = Math.abs(ipcAfter.width - Math.round(BASE_SIZE.main.width * 1.4)) <= 2
            && Math.abs(win.webContents.getZoomFactor() - 1.4) < 0.01;
          if (!ipcOk) allOk = false;
          log('IPC 改尺寸 1.4', `${ipcBefore.width}x${ipcBefore.height} -> ${ipcAfter.width}x${ipcAfter.height}`,
            `zoom ${win.webContents.getZoomFactor().toFixed(2)}`, ipcOk ? 'OK' : '不符!!');
        } catch (err) {
          allOk = false;
          log('IPC 改尺寸失败:', err.message);
        }

        applyScale(1, true);
        await wait(300);
        log('已恢复 100%', JSON.stringify(win.getBounds()));

        log('总判定', allOk ? '全部通过' : '有失败项');
        app.exit(allOk ? 0 : 1);
      }, 1500);
    });
  }

  win.on('moved', () => {
    if (!win || win.isDestroyed()) return;
    const b = win.getBounds();
    config.bounds = { ...(config.bounds || {}), x: b.x, y: b.y };
    // 拖动时 moved 事件非常频繁，磁盘写入做个防抖，别每个鼠标移动都写一次
    clearTimeout(boundsTimer);
    boundsTimer = setTimeout(() => {
      if (config.bounds) writeConfig({ bounds: config.bounds });
    }, 500);
  });

  win.on('closed', () => { win = null; });

  // 外部链接用系统浏览器打开
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
}

function recreateWindow() {
  const old = win;
  win = null;
  clearTimeout(boundsTimer);
  if (old && !old.isDestroyed()) {
    // 必须摘掉旧窗口的监听，否则它的 closed/moved 回调会误伤新窗口
    old.removeAllListeners();
    old.destroy();
  }
  createWindow();
}

function setPage(next) {
  page = ['settings', 'editor'].includes(next) ? next : 'main';
  if (!win || win.isDestroyed()) return;

  const { width, height } = sizeOf(page);
  const b = win.getBounds();
  const bottom = b.y + b.height;                 // 保持底边不动，向上生长
  const display = screen.getDisplayNearestPoint({ x: b.x, y: b.y });
  const wa = display.workArea;

  let y = bottom - height;
  y = Math.max(wa.y + 8, Math.min(y, wa.y + wa.height - height - 8));

  win.setBounds({ x: b.x, y, width, height });
}

/* 应用缩放：窗口尺寸和页面 zoomFactor 必须同步改 */
function applyScale(scale, anchorCenter) {
  const s = clampScale(scale);
  const prev = clampScale(config.scale);
  writeConfig({ scale: s });

  if (!win || win.isDestroyed()) return s;

  win.webContents.setZoomFactor(s);

  const { width, height } = sizeOf(page);
  const b = win.getBounds();
  const display = screen.getDisplayNearestPoint({ x: b.x, y: b.y });
  const wa = display.workArea;

  // 以中心为锚点缩放，视觉上更自然
  let x = anchorCenter ? b.x + Math.round((b.width - width) / 2) : b.x;
  let y = anchorCenter ? b.y + Math.round((b.height - height) / 2) : b.y;

  x = Math.max(wa.x, Math.min(x, wa.x + wa.width - width));
  y = Math.max(wa.y, Math.min(y, wa.y + wa.height - height));

  win.setBounds({ x, y, width, height });
  config.bounds = { ...(config.bounds || {}), x, y };

  if (s !== prev) {
    clearTimeout(boundsTimer);
    boundsTimer = setTimeout(() => writeConfig({ bounds: config.bounds }), 400);
  }
  return s;
}

function showWindow(focus) {
  if (!win || win.isDestroyed()) {
    createWindow();
    return;
  }
  if (focus) {
    win.show();
    win.focus();
  } else {
    win.showInactive();
  }
}

function toggleWindow() {
  if (!win || win.isDestroyed()) return createWindow();
  if (win.isVisible()) win.hide();
  else win.showInactive();
}

function applyAlwaysOnTop() {
  if (!win || win.isDestroyed()) return;
  win.setAlwaysOnTop(!!config.alwaysOnTop, config.alwaysOnTop ? 'floating' : 'normal');
}

/* ------------------------------------------------------------- 行为/开关 */

function setTheme(theme) {
  writeConfig({ theme });
  pushState();
  refreshTrayMenu();
}

function setGlass(glass) {
  if (glass === config.glass) return;
  writeConfig({ glass });
  recreateWindow();
  refreshTrayMenu();
}

function setAlwaysOnTop(on) {
  writeConfig({ alwaysOnTop: !!on });
  applyAlwaysOnTop();
  pushState();
  refreshTrayMenu();
}

function setAutoLaunch(on) {
  writeConfig({ openAtLogin: !!on });
  try {
    app.setLoginItemSettings({
      openAtLogin: !!on,
      path: process.execPath,
      args: app.isPackaged ? [] : [ROOT]
    });
  } catch (err) {
    console.error('[autostart] 设置失败:', err.message);
  }
  refreshTrayMenu();
}

function pushState() {
  if (win && !win.isDestroyed()) {
    win.webContents.send('app:state', { config, days: daysLeft() });
  }
}

/* ------------------------------------------------------------------ 菜单 */

function selectItem(id) {
  if (!(config.items || []).some((i) => i.id === id)) return;
  writeConfig({ activeId: id });
  pushState();
  refreshTrayMenu();
  if (win && !win.isDestroyed()) win.setTitle(activeItem().title);
}

function buildMenu() {
  const current = activeItem();
  const summary = current
    ? `${current.title} · ${daysText(current)}`
    : '还没有倒计时';

  return Menu.buildFromTemplate([
    { label: summary, enabled: false },
    { type: 'separator' },
    { label: '显示 / 隐藏', click: () => toggleWindow() },
    {
      label: '编辑设置…',
      click: () => {
        showWindow(true);
        setPage('settings');
        if (win && !win.isDestroyed()) win.webContents.send('app:open-settings');
      }
    },
    {
      label: '切换倒计时',
      submenu: (config.items || []).map((item) => ({
        label: `${item.title}   ${daysText(item)}`,
        type: 'radio',
        checked: item.id === config.activeId,
        click: () => selectItem(item.id)
      }))
    },
    { type: 'separator' },
    {
      label: '置顶显示',
      type: 'checkbox',
      checked: !!config.alwaysOnTop,
      click: (item) => setAlwaysOnTop(item.checked)
    },
    {
      label: '开机自动启动',
      type: 'checkbox',
      checked: !!config.openAtLogin,
      click: (item) => setAutoLaunch(item.checked)
    },
    { type: 'separator' },
    {
      label: `尺寸（当前 ${Math.round(clampScale(config.scale) * 100)}%）`,
      submenu: [
        { label: '小 · 85%', type: 'radio', checked: Math.abs(clampScale(config.scale) - 0.85) < 0.001, click: () => { applyScale(0.85, true); pushState(); refreshTrayMenu(); } },
        { label: '标准 · 100%', type: 'radio', checked: Math.abs(clampScale(config.scale) - 1) < 0.001, click: () => { applyScale(1, true); pushState(); refreshTrayMenu(); } },
        { label: '大 · 125%', type: 'radio', checked: Math.abs(clampScale(config.scale) - 1.25) < 0.001, click: () => { applyScale(1.25, true); pushState(); refreshTrayMenu(); } },
        { label: '特大 · 150%', type: 'radio', checked: Math.abs(clampScale(config.scale) - 1.5) < 0.001, click: () => { applyScale(1.5, true); pushState(); refreshTrayMenu(); } },
        { type: 'separator' },
        { label: `放大 ${Math.round(SCALE_STEP * 100)}%（Ctrl+滚轮上）`, click: () => { applyScale(config.scale + SCALE_STEP, true); pushState(); refreshTrayMenu(); } },
        { label: `缩小 ${Math.round(SCALE_STEP * 100)}%（Ctrl+滚轮下）`, click: () => { applyScale(config.scale - SCALE_STEP, true); pushState(); refreshTrayMenu(); } }
      ]
    },
    {
      label: '外观',
      submenu: [
        { label: '浅色', type: 'radio', checked: config.theme === 'light', click: () => setTheme('light') },
        { label: '深色', type: 'radio', checked: config.theme === 'dark', click: () => setTheme('dark') },
        { label: '跟随系统', type: 'radio', checked: config.theme === 'auto', click: () => setTheme('auto') }
      ]
    },
    {
      label: '毛玻璃',
      submenu: [
        { label: '标准（自定义大圆角）', type: 'radio', checked: config.glass === 'css', click: () => setGlass('css') },
        { label: '亚克力（真实背景模糊）', type: 'radio', checked: config.glass === 'acrylic', click: () => setGlass('acrylic') },
        { label: '不透明（窗口显示异常时用）', type: 'radio', checked: config.glass === 'solid', click: () => setGlass('solid') }
      ]
    },
    { type: 'separator' },
    {
      label: '退出',
      click: () => {
        app.isQuitting = true;
        app.quit();
      }
    }
  ]);
}

function refreshTrayMenu() {
  if (!tray || tray.isDestroyed()) return;
  tray.setContextMenu(buildMenu());
  const current = activeItem();
  tray.setToolTip(current ? `${current.title} · ${daysText(current)}` : '倒计时');
}

/**
 * 资源路径解析：打包后资源可能在 app.asar 内，也可能被 electron-builder
 * 解包到 resources/ 下（asar 内读图片在个别环境下不稳），两个位置都找一下。
 */
function assetPath(name) {
  const candidates = [
    process.resourcesPath ? path.join(process.resourcesPath, 'assets', name) : null,
    path.join(ROOT, 'assets', name)
  ].filter(Boolean);

  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) return p;
    } catch (_) { /* ignore */ }
  }
  return candidates[candidates.length - 1];
}

function trayImage() {
  // 深色任务栏配浅色图标，反之亦然
  const name = nativeTheme.shouldUseDarkColors ? 'tray-light.png' : 'tray-dark.png';
  const file = assetPath(name);
  let img = nativeImage.createFromPath(file);
  if (img.isEmpty()) {
    console.error('[tray] 图标读取失败:', file);
    img = nativeImage.createEmpty();
  } else {
    img = img.resize({ width: 16, height: 16 });
  }
  return img;
}

function createTray() {
  try {
    tray = new Tray(trayImage());
  } catch (err) {
    console.error('[tray] 创建失败:', err.message);
    return;
  }

  tray.on('click', () => toggleWindow());
  tray.on('double-click', () => showWindow(true));
  nativeTheme.on('updated', () => {
    if (tray && !tray.isDestroyed()) tray.setImage(trayImage());
  });
  refreshTrayMenu();
}

/* ------------------------------------------------------------------ IPC */

ipcMain.handle('app:get-state', () => ({
  config,
  days: daysLeft(),
  page,
  accents: ACCENTS,
  versions: { electron: process.versions.electron, chrome: process.versions.chrome }
}));

ipcMain.handle('app:save-config', (_e, patch) => {
  const prevGlass = config.glass;
  const prevScale = clampScale(config.scale);
  if (patch && typeof patch === 'object') writeConfig(patch);

  // items 可能被增删改，统一清洗一遍，避免脏数据写进配置
  if (patch && Array.isArray(patch.items)) {
    writeConfig({ items: config.items.map(normalizeItem) });
    const ids = config.items.map((i) => i.id);
    if (!ids.includes(config.activeId)) writeConfig({ activeId: ids[0] });
  }

  refreshTrayMenu();
  if (win && !win.isDestroyed()) win.setTitle((activeItem() && activeItem().title) || '倒计时');

  if (config.glass !== prevGlass) {
    // 透明/亚克力/不透明是三种不同的窗口形态，必须重建。
    // 延后一点执行，先让 invoke 的返回值送达渲染进程。
    page = 'main';
    setTimeout(() => recreateWindow(), 160);
    return config;
  }

  if (clampScale(config.scale) !== prevScale) {
    applyScale(config.scale, true);
  }

  pushState();
  return config;
});

ipcMain.on('app:select-item', (_e, id) => selectItem(String(id)));

ipcMain.on('app:context-menu', () => {
  if (!win || win.isDestroyed()) return;
  buildMenu().popup({ window: win });
});

ipcMain.on('app:set-page', (_e, next) => setPage(next));

/* 缩放：Ctrl+滚轮 / 设置页 / 托盘菜单都走这里 */
ipcMain.on('app:bump-scale', (_e, dir) => {
  const next = clampScale(config.scale + (dir > 0 ? SCALE_STEP : -SCALE_STEP));
  if (next === clampScale(config.scale)) return;
  applyScale(next, true);
  pushState();
  refreshTrayMenu();
});

ipcMain.handle('app:set-scale', (_e, value) => {
  applyScale(value, true);
  refreshTrayMenu();
  return config.scale;
});

/* 自绘拖拽：-webkit-app-region:drag 会吞掉点击/双击事件，
   所以自己实现。位置由主进程轮询真实光标决定 —— 完全不依赖渲染进程传来的
   坐标，所以既不受页面缩放影响，也不会因为窗口被遮挡而卡住。 */
let dragState = null;

function endDrag() {
  if (dragState && dragState.timer) clearInterval(dragState.timer);
  dragState = null;
  if (win && !win.isDestroyed()) {
    const b = win.getBounds();
    config.bounds = { ...(config.bounds || {}), x: b.x, y: b.y };
    clearTimeout(boundsTimer);
    writeConfig({ bounds: config.bounds });
  }
}

ipcMain.on('app:drag-start', () => {
  if (!win || win.isDestroyed()) return;
  if (dragState) endDrag();

  const cursor = screen.getCursorScreenPoint();
  const [wx, wy] = win.getPosition();
  dragState = {
    grabX: cursor.x - wx,
    grabY: cursor.y - wy,
    timer: setInterval(() => {
      if (!win || win.isDestroyed() || !dragState) return;
      const p = screen.getCursorScreenPoint();
      const { width, height } = sizeOf(page);
      const wa = screen.getDisplayNearestPoint(p).workArea;

      // 始终留一角在屏幕内，避免手一抖把挂件拖没了
      const minX = wa.x - Math.round(width * 0.6);
      const maxX = wa.x + wa.width - Math.round(width * 0.4);
      const minY = wa.y;
      const maxY = wa.y + wa.height - Math.round(height * 0.3);

      const x = Math.min(Math.max(p.x - dragState.grabX, minX), maxX);
      const y = Math.min(Math.max(p.y - dragState.grabY, minY), maxY);
      win.setBounds({ x, y, width, height });
    }, 16)
  };

  // 兜底：万一 mouseup 丢在窗口外，20 秒后自动结束
  setTimeout(() => { if (dragState) endDrag(); }, 20000);
});

ipcMain.on('app:drag-end', () => { if (dragState) endDrag(); });

ipcMain.on('app:quit', () => { app.isQuitting = true; app.quit(); });
ipcMain.on('app:hide', () => { if (win && !win.isDestroyed()) win.hide(); });
ipcMain.on('app:title', (_e, text) => {
  if (tray && !tray.isDestroyed() && text) tray.setToolTip(String(text));
});

/* ----------------------------------------------------------------- 图标渲染 */
/* 开发用：把 tools/icon.html 按多个尺寸渲染成 PNG，供 tools/make-icon.js 打成 ico */

async function renderIconSizes() {
  const sizes = [16, 24, 32, 48, 64, 128, 256, 512];
  const BIG = 512;
  const outDir = path.join(ROOT, 'assets', 'icon-sizes');
  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(outDir, { recursive: true });

  const tmp = new BrowserWindow({
    width: BIG,
    height: BIG,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    show: false,
    resizable: true,
    skipTaskbar: true,
    webPreferences: { contextIsolation: true, nodeIntegration: false }
  });

  await tmp.loadFile(path.join(ROOT, 'tools', 'icon.html'));
  await new Promise((r) => setTimeout(r, 900));
  tmp.setContentSize(BIG, BIG);
  await new Promise((r) => setTimeout(r, 400));

  // Windows 对窗口有最小尺寸限制（约 48×56），小尺寸没法直接渲染窗口，
  // 所以只渲染一张 512，再用 nativeImage 高质量缩放。
  const big = await tmp.webContents.capturePage();
  console.log('[icon-shot] base', JSON.stringify(big.getSize()));

  for (const size of sizes) {
    const image = size === BIG ? big : big.resize({ width: size, height: size, quality: 'best' });
    fs.writeFileSync(path.join(outDir, `icon-${size}.png`), image.toPNG());
    console.log('[icon-shot]', size, JSON.stringify(image.getSize()));
  }

  tmp.destroy();
  app.exit(0);
}

/* ----------------------------------------------------------------- 生命周期 */

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => showWindow(true));

  app.whenReady().then(() => {
    if (ICON_SHOT) {
      renderIconSizes().catch((err) => {
        console.error('[icon-shot] 失败:', err.message);
        app.exit(1);
      });
      return;
    }

    readConfig();
    createWindow();
    createTray();

    screen.on('display-metrics-changed', () => applyAlwaysOnTop());
  });

  app.on('window-all-closed', () => {
    // 常驻托盘，不随窗口关闭退出
  });

  app.on('before-quit', () => { app.isQuitting = true; });
}
