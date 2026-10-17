'use strict';

/* 倒计时桌面小组件 · 渲染进程 */

const $ = (id) => document.getElementById(id);

const WEEK = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
const INK = '#1C1C1E';       // 默认强调色（跟随主题的墨黑/白）
const URGENT_DAYS = 7;       // 进入冲刺的天数阈值

/* 直接用浏览器打开 index.html 时（没有 preload）也能预览 */
const DEMO = (() => {
  const t = new Date();
  t.setDate(t.getDate() + 30);
  return { id: 'demo', title: '我的倒计时', targetDate: isoDate(t), startDate: isoDate(new Date()), accent: '#0A84FF' };
})();

const api = window.widget || {
  getState: async () => ({
    config: { items: [DEMO], activeId: 'demo', theme: 'light', glass: 'css', scale: 1, alwaysOnTop: false },
    accents: ['#1C1C1E', '#0A84FF', '#34C759', '#FF9500', '#FF3B30', '#AF52DE']
  }),
  saveConfig: async (patch) => ({ items: [DEMO], activeId: 'demo', theme: 'light', glass: 'css', scale: 1, alwaysOnTop: false, ...patch }),
  setPage: () => {},
  selectItem: () => {},
  openMenu: () => {},
  hide: () => {},
  quit: () => {},
  setTrayTitle: () => {},
  dragStart: () => {},
  dragEnd: () => {},
  bumpScale: () => {},
  setScale: async (v) => v,
  onState: () => {},
  onOpenSettings: () => {}
};

let config = null;
let accents = [INK];
let view = 'main';
let editingId = null;
let draftAccent = INK;
let lastKey = '';
let movedRecently = false;
let currentDay = startOfDay(new Date()).getTime();
let lastWheel = 0;

/* ------------------------------------------------------------ 工具函数 */

function startOfDay(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function parseDate(str) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(str || '').trim());
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(d.getTime()) ? null : d;
}

function isoDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function fmtDate(d) {
  if (!d) return '未设置日期';
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
}

function compute(item) {
  const target = parseDate(item.targetDate);
  const start = parseDate(item.startDate);
  const today = startOfDay(new Date());
  const days = target ? Math.round((target - today) / 86400000) : null;

  let pct = null;
  if (start && target && target > start) {
    pct = Math.max(0, Math.min(1, (today - start) / (target - start)));
  }
  return { target, start, today, days, pct };
}

/** 条目的一句话天数描述 */
function daysLabel(item) {
  const { days } = compute(item);
  if (days === null) return '日期未设置';
  if (days > 0) return `还有 ${days} 天`;
  if (days === 0) return '就是今天';
  return `已过去 ${-days} 天`;
}

function activeItem() {
  const items = config.items || [];
  return items.find((i) => i.id === config.activeId) || items[0] || null;
}

/* ------------------------------------------------------------ 外观 */

function preferredTheme() {
  if (config.theme === 'auto') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  return config.theme === 'dark' ? 'dark' : 'light';
}

function applyChrome() {
  const root = document.documentElement;
  const dark = preferredTheme() === 'dark';
  root.classList.toggle('theme-dark', dark);
  root.classList.toggle('theme-light', !dark);
  const glass = ['css', 'acrylic', 'solid'].includes(config.glass) ? config.glass : 'css';
  for (const g of ['css', 'acrylic', 'solid']) root.classList.toggle(`glass-${g}`, glass === g);
}

function applyAccent(item) {
  const root = document.documentElement;
  if (item && item.accent && item.accent !== INK) {
    root.style.setProperty('--accent', item.accent);
  } else {
    root.style.removeProperty('--accent'); // 回落到 :root 的 var(--ink)
  }
}

/* ------------------------------------------------------------ 主视图 */

function renderMain() {
  const item = activeItem();
  if (!item) return;

  const { target, days, pct } = compute(item);

  let num;
  let unit;
  let status;
  let state = 'normal';

  if (days === null) {
    num = '--';
    unit = '天';
    status = '待设置';
    state = 'past';
  } else if (days > 0) {
    num = String(days);
    unit = '天';
    status = days <= URGENT_DAYS ? '冲刺中' : '进行中';
    if (days <= URGENT_DAYS) state = 'urgent';
  } else if (days === 0) {
    num = '0';
    unit = '天';
    status = '就是今天';
    state = 'today';
  } else {
    num = String(-days);
    unit = '天前';
    status = '已过去';
    state = 'past';
  }

  const numEl = $('days');
  const unitEl = $('unit');
  const key = `${item.id}|${num}|${unit}|${item.title}|${state}`;

  if (key !== lastKey) {
    if (lastKey) {
      numEl.classList.add('swap');
      window.setTimeout(() => {
        numEl.textContent = num;
        unitEl.textContent = unit;
        numEl.classList.remove('swap');
      }, 150);
    } else {
      numEl.textContent = num;
      unitEl.textContent = unit;
    }
    lastKey = key;
  }

  const hero = $('hero');
  // 只有默认墨色才用红色表示冲刺；用户自己选了颜色就尊重用户的选择
  const useUrgentRed = state === 'urgent' && (!item.accent || item.accent === INK);
  hero.classList.toggle('urgent', useUrgentRed);
  hero.classList.toggle('past', state === 'past');
  $('dot').classList.toggle('rest', state === 'past');

  applyAccent(item);

  $('label').textContent = item.title;
  document.title = item.title; // 窗口 / Alt-Tab 标题跟着当前条目走
  $('statusText').textContent = status;
  $('dateText').textContent = target ? `${fmtDate(target)} ${WEEK[target.getDay()]}` : '未设置日期';

  if (pct === null) {
    $('progress').hidden = true;
  } else {
    $('progress').hidden = false;
    $('barFill').style.width = `${(pct * 100).toFixed(1)}%`;
    $('pctText').textContent = `${Math.round(pct * 100)}%`;
  }

  renderDots();
  api.setTrayTitle(`${item.title} · ${daysLabel(item)}`);
}

function renderDots() {
  const box = $('dots');
  const items = config.items || [];
  box.hidden = items.length <= 1;
  box.innerHTML = '';
  if (items.length <= 1) return;

  for (const item of items) {
    const dot = document.createElement('i');
    if (item.id === config.activeId) dot.classList.add('on');
    dot.title = item.title;
    dot.addEventListener('click', () => selectItem(item.id));
    box.appendChild(dot);
  }
}

function animateSwap(dir) {
  const page = $('pageMain');
  const cls = dir > 0 ? 'turn-next' : 'turn-prev';
  page.classList.remove('turn-next', 'turn-prev');
  void page.offsetWidth; // 强制重排，让动画能重新触发
  page.classList.add(cls);
  window.setTimeout(() => page.classList.remove(cls), 300);
}

function selectItem(id) {
  if (!config.items.some((i) => i.id === id)) return;
  if (config.activeId === id) return;
  config.activeId = id;
  lastKey = '';
  renderMain();
  api.selectItem(id);
}

function step(dir) {
  const items = config.items || [];
  if (items.length < 2) return;
  const idx = items.findIndex((i) => i.id === config.activeId);
  const next = items[(idx + dir + items.length) % items.length];
  selectItem(next.id);
  animateSwap(dir);
}

/* ------------------------------------------------------------ 设置页 */

function markSeg(id, value) {
  for (const btn of $(id).querySelectorAll('button')) {
    btn.classList.toggle('on', String(btn.dataset.value) === String(value));
  }
}

function fillSettings() {
  markSeg('segTheme', config.theme);
  markSeg('segGlass', config.glass);
  markSeg('segScale', Math.round((config.scale || 1) * 100));
  $('swTop').setAttribute('aria-checked', String(!!config.alwaysOnTop));
}

function renderItemList() {
  const list = $('itemList');
  list.innerHTML = '';

  for (const item of config.items) {
    const row = document.createElement('button');
    row.type = 'button';
    row.className = 'item-row' + (item.id === config.activeId ? ' active' : '');

    const swatch = document.createElement('i');
    swatch.className = 'item-dot';
    swatch.style.background = item.accent === INK ? 'var(--ink)' : item.accent;

    const body = document.createElement('span');
    body.className = 'item-body';

    const title = document.createElement('span');
    title.className = 'item-title';
    title.textContent = item.title;

    const sub = document.createElement('span');
    sub.className = 'item-sub';
    const target = parseDate(item.targetDate);
    sub.textContent = `${target ? fmtDate(target) : '未设置'} · ${daysLabel(item)}`;

    body.append(title, sub);

    const chev = document.createElement('span');
    chev.className = 'item-chev';
    chev.textContent = '›';

    row.append(swatch, body, chev);
    row.addEventListener('click', () => openEditor(item.id));
    list.appendChild(row);
  }
}

function openSettings() {
  renderItemList();
  fillSettings();
  setView('settings');
}

function setView(name) {
  view = name;
  $('pageMain').hidden = name !== 'main';
  $('pageSettings').hidden = name !== 'settings';
  $('pageEditor').hidden = name !== 'editor';
  api.setPage(name);
}

async function saveGlobal(patch) {
  try {
    config = await api.saveConfig(patch);
  } catch (_) {
    return; // 切换毛玻璃会重建窗口，回执可能收不到
  }
  applyChrome();
  lastKey = '';
  renderMain();
}

/* ------------------------------------------------------------ 条目编辑 */

function renderSwatches() {
  const box = $('swatches');
  box.innerHTML = '';
  for (const color of accents) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'swatch' + (color === draftAccent ? ' on' : '');
    btn.style.background = color === INK ? 'var(--ink)' : color;
    btn.title = color;
    btn.addEventListener('click', () => {
      draftAccent = color;
      renderSwatches();
    });
    box.appendChild(btn);
  }
}

function openEditor(id) {
  const item = id ? config.items.find((i) => i.id === id) : null;
  editingId = item ? item.id : null;

  $('editorTitle').textContent = item ? '编辑倒计时' : '新建倒计时';
  $('fTitle').value = item ? item.title : '';
  $('fTarget').value = item ? item.targetDate : isoDate(new Date());
  $('fStart').value = item ? (item.startDate || '') : '';
  draftAccent = item ? item.accent : INK;

  renderSwatches();
  $('btnDelete').disabled = !item || config.items.length <= 1;

  setView('editor');
  window.setTimeout(() => $('fTitle').focus({ preventScroll: true }), 120);
}

async function saveItem() {
  const title = $('fTitle').value.trim() || '未命名倒计时';
  const targetDate = $('fTarget').value || isoDate(new Date());
  const startDate = $('fStart').value || '';

  const items = config.items.map((i) => ({ ...i }));
  let id;

  if (editingId) {
    const idx = items.findIndex((i) => i.id === editingId);
    items[idx] = { ...items[idx], title, targetDate, startDate, accent: draftAccent };
    id = editingId;
  } else {
    id = `i${Date.now().toString(36)}`;
    items.push({ id, title, targetDate, startDate, accent: draftAccent });
  }

  try {
    config = await api.saveConfig({ items, activeId: id });
  } catch (_) {
    return;
  }

  lastKey = '';
  renderMain();
  renderItemList();
  setView('settings');
}

async function deleteItem() {
  if (!editingId || config.items.length <= 1) return;

  const items = config.items.filter((i) => i.id !== editingId);
  const activeId = config.activeId === editingId ? items[0].id : config.activeId;

  try {
    config = await api.saveConfig({ items, activeId });
  } catch (_) {
    return;
  }

  editingId = null;
  lastKey = '';
  renderMain();
  renderItemList();
  setView('settings');
}

/* ------------------------------------------------------------ 交互 */

function setupDragging() {
  let dragging = false;
  const isInteractive = (el) => !!(el && el.closest('input, button, .seg, .switch, .item-row, .swatch'));

  $('card').addEventListener('mousedown', (e) => {
    if (e.button !== 0 || isInteractive(e.target)) return;
    movedRecently = false;
    dragging = true;
    api.dragStart();
    e.preventDefault();
  });

  window.addEventListener('mousemove', () => {
    if (!dragging) return;
    movedRecently = true;
  });

  window.addEventListener('mouseup', () => {
    if (!dragging) return;
    dragging = false;
    api.dragEnd();
  });
}

function bind() {
  setupDragging();

  for (const seg of document.querySelectorAll('.seg')) {
    seg.addEventListener('click', (e) => {
      const btn = e.target.closest('button');
      if (!btn) return;

      if (seg.id === 'segTheme') saveGlobal({ theme: btn.dataset.value });
      else if (seg.id === 'segGlass') saveGlobal({ glass: btn.dataset.value });
      else if (seg.id === 'segScale') saveGlobal({ scale: Number(btn.dataset.value) / 100 });

      for (const b of seg.querySelectorAll('button')) b.classList.toggle('on', b === btn);
    });
  }

  $('swTop').addEventListener('click', (e) => {
    const on = e.currentTarget.getAttribute('aria-checked') !== 'true';
    e.currentTarget.setAttribute('aria-checked', String(on));
    saveGlobal({ alwaysOnTop: on });
  });

  $('btnAdd').addEventListener('click', () => openEditor(null));
  $('btnDone').addEventListener('click', () => setView('main'));
  $('btnSaveItem').addEventListener('click', saveItem);
  $('btnDelete').addEventListener('click', deleteItem);
  $('btnCancelEdit').addEventListener('click', () => setView('settings'));

  // 双击卡片 → 设置（拖拽之后不触发）
  $('card').addEventListener('dblclick', (e) => {
    if (view !== 'main' || movedRecently) return;
    if (e.target.closest('input, button, .seg, .switch, .item-row, .swatch, .dots')) return;
    openSettings();
  });

  window.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    api.openMenu();
  });

  // Ctrl + 滚轮缩放；普通滚轮切换条目
  window.addEventListener('wheel', (e) => {
    if (e.ctrlKey) {
      e.preventDefault();
      api.bumpScale(e.deltaY < 0 ? 1 : -1);
      return;
    }
    if (view !== 'main') return;
    if (Math.abs(e.deltaY) < 2) return;
    const now = Date.now();
    if (now - lastWheel < 260) return; // 触控板会连续发一堆事件
    lastWheel = now;
    step(e.deltaY > 0 ? 1 : -1);
  }, { passive: false });

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (view === 'editor') setView('settings');
      else if (view === 'settings') setView('main');
      else api.hide();
      return;
    }

    if (view === 'editor' && e.key === 'Enter') {
      saveItem();
      return;
    }

    if (view === 'main') {
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); step(1); }
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); step(-1); }
      else if (e.key === 'Enter') openSettings();
    }
  });

  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (config && config.theme === 'auto') applyChrome();
  });

  api.onState((payload) => {
    if (!payload || !payload.config) return;
    config = payload.config;
    lastKey = '';
    applyChrome();
    renderMain();
    if (view === 'settings') {
      renderItemList();
      fillSettings();
    }
  });

  api.onOpenSettings(() => openSettings());

  // 跨天自动刷新
  window.setInterval(() => {
    const day = startOfDay(new Date()).getTime();
    if (day !== currentDay) {
      currentDay = day;
      lastKey = '';
      renderMain();
      if (view === 'settings') renderItemList();
    }
  }, 20000);
}

/* ------------------------------------------------------------ 启动 */

(async function boot() {
  const state = await api.getState();
  config = state.config;
  accents = (state.accents && state.accents.length) ? state.accents : [INK];

  applyChrome();
  bind();
  renderMain();
})();
