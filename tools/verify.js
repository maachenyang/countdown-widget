'use strict';

/**
 * 本地自检：
 *  1) 语法检查 main.js / preload.js / app.js
 *  2) 用 stub DOM 真正执行 app.js 的渲染逻辑，冻结时钟断言结果
 *      - 单条 / 多条倒计时、切换圆点
 *      - 天数、文案、进度、强调色
 *      - 设置页条目列表渲染
 *  3) HTML 里的 id 与 app.js 引用的 id 是否对得上
 *  4) CSS 花括号是否配平
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'src');

let failed = 0;
function check(name, ok, extra) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  -> ' + extra : ''}`);
  if (!ok) failed++;
}

/* ---------------------------------------------------- 1) 语法 */

const files = {
  main: path.join(SRC, 'main.js'),
  preload: path.join(SRC, 'preload.js'),
  app: path.join(SRC, 'renderer', 'app.js')
};

for (const [name, file] of Object.entries(files)) {
  try {
    new vm.Script(fs.readFileSync(file, 'utf8'), { filename: file });
    check(`语法 ${name}.js`, true);
  } catch (err) {
    check(`语法 ${name}.js`, false, err.message);
  }
}

/* ---------------------------------------------------- 2) stub DOM */

function makeEl(tag = 'div', id = '') {
  const classes = new Set();
  const el = {
    tagName: tag,
    id,
    textContent: '',
    innerHTML: '',
    value: '',
    hidden: false,
    disabled: false,
    title: '',
    style: {
      _props: {},
      setProperty(k, v) { this._props[k] = v; },
      removeProperty(k) { delete this._props[k]; }
    },
    dataset: {},
    children: [],
    listeners: {},
    classList: {
      add: (...cs) => cs.forEach((c) => classes.add(c)),
      remove: (...cs) => cs.forEach((c) => classes.delete(c)),
      contains: (c) => classes.has(c),
      toggle: (c, force) => {
        const on = force === undefined ? !classes.has(c) : !!force;
        if (on) classes.add(c);
        else classes.delete(c);
        return on;
      }
    },
    _classes: classes,
    setAttribute(k, v) { this[k] = v; },
    getAttribute(k) { return this[k]; },
    focus() {},
    append(...nodes) { this.children.push(...nodes); },
    appendChild(n) { this.children.push(n); return n; },
    addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn); },
    querySelectorAll() { return []; },
    querySelector() { return null; }
  };
  return el;
}

function makeSeg(id, values) {
  const seg = makeEl('div', id);
  const buttons = values.map((v) => {
    const b = makeEl('button', `${id}:${v}`);
    b.dataset.value = v;
    return b;
  });
  buttons[0].classList.add('on');
  seg.buttons = buttons;
  seg.querySelectorAll = (sel) => (sel === 'button' ? buttons : []);
  seg.querySelector = (sel) => (sel === 'button.on' ? buttons.find((b) => b.classList.contains('on')) || null : null);
  return seg;
}

const IDS = [
  'label', 'statusText', 'days', 'unit', 'hero', 'dot', 'dateText', 'progress',
  'barFill', 'pctText', 'dots', 'pageMain', 'pageSettings', 'pageEditor',
  'itemList', 'btnAdd', 'scrollArea', 'swTop', 'btnDone', 'fTitle', 'fTarget',
  'fStart', 'swatches', 'btnDelete', 'editorTitle', 'btnCancelEdit', 'btnSaveItem', 'card'
];

async function runRenderer(configObj, fixedDate) {
  const els = {};
  for (const id of IDS) els[id] = makeEl('div', id);
  els.segTheme = makeSeg('segTheme', ['light', 'dark', 'auto']);
  els.segGlass = makeSeg('segGlass', ['css', 'acrylic', 'solid']);
  els.segScale = makeSeg('segScale', ['85', '100', '125', '150']);

  const root = makeEl('html', 'html');
  const document = {
    documentElement: root,
    getElementById: (id) => els[id] || makeEl('div', id),
    querySelectorAll: (sel) => (sel === '.seg' ? [els.segTheme, els.segGlass, els.segScale] : []),
    createElement: (tag) => makeEl(tag),
    addEventListener() {}
  };

  const FIXED = fixedDate.getTime();
  class FakeDate extends Date {
    constructor(...args) {
      if (args.length === 0) super(FIXED);
      else super(...args);
    }
    static now() { return FIXED; }
  }

  const window = {
    widget: {
      getState: async () => ({ config: configObj, days: null }),
      saveConfig: async (patch) => ({ ...configObj, ...patch }),
      setPage() {}, selectItem() {}, openMenu() {}, hide() {}, quit() {}, setTrayTitle() {},
      dragStart() {}, dragEnd() {}, bumpScale() {}, setScale: async (v) => v,
      onState() {}, onOpenSettings() {}
    },
    setInterval: () => 0,
    setTimeout: (fn) => { fn(); return 0; },
    requestAnimationFrame: () => 1,
    cancelAnimationFrame() {},
    addEventListener() {},
    matchMedia: () => ({ matches: false, addEventListener() {} })
  };

  const sandbox = {
    window, document, console, Date: FakeDate, setTimeout: window.setTimeout,
    Math, JSON, String, Number, Object, Array, RegExp, isNaN, parseInt, parseFloat
  };
  sandbox.window.document = document;

  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(files.app, 'utf8'), sandbox, { filename: 'app.js' });

  await new Promise((r) => setImmediate(r));
  await new Promise((r) => setImmediate(r));

  return { els, root, sandbox };
}

/* ---------------------------------------------------- 3) 断言 */

const item = (over) => ({
  id: over.id || 'i1',
  title: over.title || '考研初试',
  targetDate: over.targetDate || '2026-12-19',
  startDate: over.startDate === undefined ? '2026-09-01' : over.startDate,
  accent: over.accent || '#1C1C1E'
});

const cfg = (items, activeId, extra) => ({
  version: 2,
  items,
  activeId: activeId || items[0].id,
  theme: 'light',
  glass: 'css',
  scale: 1,
  alwaysOnTop: false,
  ...(extra || {})
});

(async () => {
  const OCT16 = new Date(2026, 9, 16, 10, 0, 0);

  let r = await runRenderer(cfg([item({})]), OCT16);
  check('2026-10-16 -> 64 天', r.els.days.textContent === '64', `实际 ${r.els.days.textContent}`);
  check('单位 = 天', r.els.unit.textContent === '天', r.els.unit.textContent);
  check('状态 = 进行中', r.els.statusText.textContent === '进行中', r.els.statusText.textContent);
  check('日期行 = 2026.12.19 周六', r.els.dateText.textContent === '2026.12.19 周六', r.els.dateText.textContent);
  check('进度 = 41%', r.els.pctText.textContent === '41%', r.els.pctText.textContent);
  check('标题跟随条目', r.els.label.textContent === '考研初试', r.els.label.textContent);
  check('单条时隐藏切换圆点', r.els.dots.hidden === true);

  // 多条 + 切换圆点 + 强调色
  const items3 = [
    item({}),
    item({ id: 'i2', title: '项目上线', accent: '#0A84FF' }),
    item({ id: 'i3', title: '生日' })
  ];
  r = await runRenderer(cfg(items3, 'i2'), OCT16);
  check('多条时显示圆点', r.els.dots.hidden === false);
  check('圆点数量 = 条目数', r.els.dots.children.length === 3, String(r.els.dots.children.length));
  check('只有一个圆点是高亮态', r.els.dots.children.filter((d) => d._classes.has('on')).length === 1);
  check('蓝色强调色写入 CSS 变量', r.root.style._props['--accent'] === '#0A84FF', String(r.root.style._props['--accent']));
  check('标题切到第 2 条', r.els.label.textContent === '项目上线', r.els.label.textContent);

  // 墨色强调色走 var(--ink)，不写内联变量
  r = await runRenderer(cfg([item({ accent: '#1C1C1E' })]), OCT16);
  check('墨色不写内联 --accent', r.root.style._props['--accent'] === undefined, String(r.root.style._props['--accent']));

  // 当天
  r = await runRenderer(cfg([item({})]), new Date(2026, 11, 19, 8, 0, 0));
  check('当天 = 0 天', r.els.days.textContent === '0', r.els.days.textContent);
  check('当天文案', r.els.statusText.textContent === '就是今天', r.els.statusText.textContent);

  // 考完
  r = await runRenderer(cfg([item({})]), new Date(2026, 11, 25, 8, 0, 0));
  check('考完 = 6 天前', r.els.days.textContent === '6' && r.els.unit.textContent === '天前',
    `${r.els.days.textContent}${r.els.unit.textContent}`);
  check('考完文案', r.els.statusText.textContent === '已过去', r.els.statusText.textContent);

  // 冲刺
  r = await runRenderer(cfg([item({ targetDate: '2026-10-20' })]), OCT16);
  check('冲刺期变红', r.els.hero._classes.has('urgent'));

  // 自定义色不强制变红
  r = await runRenderer(cfg([item({ targetDate: '2026-10-20', accent: '#34C759' })]), OCT16);
  check('自定义色不进冲刺红', !r.els.hero._classes.has('urgent'));

  // 无起始日期不显示进度
  r = await runRenderer(cfg([item({ startDate: '' })]), OCT16);
  check('无起始日期隐藏进度条', r.els.progress.hidden === true);

  // 设置页条目列表
  r = await runRenderer(cfg(items3), OCT16);
  r.sandbox.openSettings();
  check('设置页渲染出 3 行', r.els.itemList.children.length === 3, String(r.els.itemList.children.length));

  /* ---------------------------------------------------- 4) id 一致性 */

  const html = fs.readFileSync(path.join(SRC, 'renderer', 'index.html'), 'utf8');
  const htmlIds = new Set([...html.matchAll(/id="([^"]+)"/g)].map((m) => m[1]));
  const appSrc = fs.readFileSync(files.app, 'utf8');
  const usedIds = new Set([...appSrc.matchAll(/\$\('([^']+)'\)/g)].map((m) => m[1]));
  const missing = [...usedIds].filter((id) => !htmlIds.has(id));
  check('app.js 引用的 id 都存在于 HTML', missing.length === 0, missing.join(','));

  /* ---------------------------------------------------- 5) CSS */

  const css = fs.readFileSync(path.join(SRC, 'renderer', 'style.css'), 'utf8');
  const open = (css.match(/{/g) || []).length;
  const close = (css.match(/}/g) || []).length;
  check('CSS 花括号配平', open === close, `${open} vs ${close}`);
  check('CSS 定义了 .progress[hidden]', css.includes('.progress[hidden]'));
  check('CSS 定义了条目圆点样式', css.includes('.dots > i'));

  console.log(failed === 0 ? '\n全部通过 ✅' : `\n${failed} 项失败 ❌`);
  process.exit(failed === 0 ? 0 : 1);
})();
