const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const {normalizeValue, parseStyleRules, declarationTable} = require('./helpers/css.cjs');

const frontendRoot = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(frontendRoot, file), 'utf8');

function stylesheetLinks(page) {
  return [...read(page).matchAll(/<link rel="stylesheet" href="([^"]+)">/g)]
    .map(match => match[1]);
}

function pageStyles(page) {
  return declarationTable(stylesheetLinks(page)
    .map(href => read(href.split('?')[0])).join('\n'));
}

function declarations(page, selector, condition) {
  return pageStyles(page).get(JSON.stringify([condition ? [normalizeValue(condition)] : [], selector]));
}

function assertProperties(page, selector, expected, condition) {
  const values = declarations(page, selector, condition);
  assert.ok(values, `${page}: ${selector}`);
  for (const [property, value] of Object.entries(expected)) {
    assert.equal(values[property], normalizeValue(value), `${page}: ${selector} / ${property}`);
  }
}

test('两页先加载共享主题，再加载独立布局；修改的样式使用同一缓存版本', () => {
  for (const [page, files] of [
    ['index.html', ['site-theme.css', 'site-background.css', 'site-tabs.css', 'app.css']],
    ['guestbook.html', ['site-theme.css', 'site-background.css', 'site-tabs.css', 'guestbook.css', 'site-footer.css']],
  ]) {
    const links = stylesheetLinks(page);
    assert.deepEqual(links.map(href => href.split('?')[0]), files);
    for (const href of links) {
      assert.ok(fs.existsSync(path.join(frontendRoot, href.split('?')[0])));
      if (!href.startsWith('site-background.css')) assert.ok(href.endsWith('?v=shared-theme-1'));
    }
  }
});

test('原配色集中为一套主题变量，页面没有遗留的留言页变量或未定义变量', () => {
  const rootRules = parseStyleRules(read('site-theme.css')).filter(rule => rule.selector === ':root');
  assert.equal(rootRules.length, 1);
  assert.deepEqual(Object.fromEntries(rootRules[0].declarations), {
    '--bg': '#f5f0e8', '--card': 'rgba(255,254,249,0.65)', '--border': '#d4c8b0',
    '--text': '#3d3226', '--text-soft': '#5f5146', '--text-dim': '#8b7d6b',
    '--accent': '#8b2500', '--accent-light': '#c75b3a', '--tile-bg': '#faf7f0',
    '--tile-hover': '#f0e6d2', '--tile-selected': '#8b2500', '--tile-selected-text': '#fff',
    '--placeholder': '#c0b8a8', '--tag-bg': '#fef5f0', '--tag-border': '#f0d0b8',
    '--shadow': '0 1px 8px rgba(0,0,0,0.05)',
  });
  for (const page of ['index.html', 'guestbook.html']) {
    const css = stylesheetLinks(page).map(href => read(href.split('?')[0])).join('\n');
    assert.ok(!css.includes('--guestbook-'));
    const defined = new Set([...css.matchAll(/(--[\w-]+)\s*:/g)].map(match => match[1]));
    for (const match of css.matchAll(/var\((--[\w-]+)\)/g)) {
      assert.ok(defined.has(match[1]), `${page}: ${match[1]}`);
    }
  }
  for (const file of ['app.css', 'guestbook.css']) {
    assert.ok(!parseStyleRules(read(file)).some(rule => rule.selector === ':root'));
  }
});

test('共享字体、底色和视口高度保留原值，只有留言页调整移动端留白', () => {
  for (const page of ['index.html', 'guestbook.html']) {
    assertProperties(page, 'html', {
      'font-size': '16px', 'min-height': '100%',
      '-webkit-text-size-adjust': '100%', 'text-size-adjust': '100%',
    });
    assertProperties(page, 'body', {
      'font-family': '"PingFang SC", "Noto Serif SC", "Source Han Serif SC", "Hiragino Mincho Pro", "Songti SC", serif',
      'background': 'radial-gradient(ellipse at 50% 30%, #faf6ec 0%, #efe8d6 60%, #e0d8c0 100%)',
      'color': '#3d3226', 'min-height': '100dvh', 'padding': '2.3rem 0.8rem', 'overflow-x': 'hidden',
    });
  }
  const body = parseStyleRules(read('site-theme.css')).find(rule => rule.selector === 'body');
  assert.deepEqual(body.declarations.filter(([property]) => property === 'min-height'), [
    ['min-height', '100vh'], ['min-height', '100dvh'],
  ]);
  assertProperties('index.html', 'body', {'overflow-y': 'auto', '-webkit-overflow-scrolling': 'touch'});
  assertProperties('guestbook.html', 'body', {padding: '1.4rem 0.7rem'}, '@media (max-width: 860px)');
  assert.equal(declarations('index.html', 'body', '@media (max-width: 860px)'), undefined);
});

test('卡片、标签、输入和按钮外观不变，各页保留尺寸与禁用状态差异', () => {
  for (const [page, card, label, input, button] of [
    ['index.html', '.card', '.input-group label', '.input-group input', '.btn'],
    ['guestbook.html', '.guestbook-card', '.form-field label', '.form-field textarea', '.submit-button'],
  ]) {
    assertProperties(page, card, {
      background: 'rgba(255, 254, 249, 0.65)', border: '1px solid #d4c8b0',
      'border-radius': '8px', 'box-shadow': '0 1px 8px rgba(0, 0, 0, 0.05)',
    });
    assertProperties(page, label, {'font-size': '0.9rem', 'font-weight': '600', color: '#5f5146'});
    assertProperties(page, input, {
      'font-size': '0.95rem', padding: '0.4rem 0.55rem', border: '1.5px solid #d4c8b0',
      'border-radius': '6px', background: '#faf7f0', color: '#3d3226', outline: 'none',
    });
    assertProperties(page, button, {
      'font-size': '0.95rem', 'font-weight': '600', padding: '0.42rem 1rem',
      'border-radius': '6px', cursor: 'pointer', 'letter-spacing': '0.04em',
    });
  }
  assertProperties('index.html', '.btn-primary:disabled', {background: '#c0b0a0', cursor: 'not-allowed'});
  assertProperties('guestbook.html', '.submit-button:disabled', {opacity: '0.55', cursor: 'default'});
  assertProperties('guestbook.html', '.form-field textarea', {'min-height': '8rem', resize: 'vertical'});
});

test('两页网格、留言自适应高度和主页古文／保存按钮约束保持原样', () => {
  for (const [page, selector] of [['index.html', '.main-row'], ['guestbook.html', '.guestbook-layout']]) {
    assertProperties(page, selector, {'grid-template-columns': '380px minmax(0, 1fr)'});
    assertProperties(page, selector, {'grid-template-columns': '1fr'}, '@media (max-width: 860px)');
  }
  assertProperties('guestbook.html', '.wall-card', {
    display: 'flex', 'max-height': '754px', 'min-height': '0', overflow: 'hidden',
  });
  assertProperties('guestbook.html', '.wall-card', {
    display: 'block', height: 'auto !important', 'max-height': 'none !important', overflow: 'visible',
  }, '@media (max-width: 860px)');
  assertProperties('index.html', '.gua-detail-col', {height: '100%', 'min-height': '0', 'overflow-y': 'auto'});
  assertProperties('index.html', '.gua-detail-col', {height: 'auto', 'max-height': '18rem'}, '@media (max-width: 860px)');
  assertProperties('index.html', '.result-section', {'padding-bottom': '2.4rem'}, '@media (max-width: 860px)');
  assertProperties('index.html', '#btnSaveResult', {
    position: 'absolute', bottom: '0.6rem', right: '0.6rem',
  }, '@media (max-width: 860px)');
  assert.ok(!read('site-theme.css').includes('@media'));
});

test('背景、导航大小和两页题句的字体尺寸保留原值', () => {
  for (const page of ['index.html', 'guestbook.html']) {
    assertProperties(page, '.bg-temple', {position: 'fixed', inset: '0', 'pointer-events': 'none', 'z-index': '0'});
    assertProperties(page, '.bg-temple .tai-ji', {
      '--s': '34vmin', top: '50%', left: '50%', translate: '-50% -50%',
      rotate: 'calc(180deg + var(--bg-rotation, 0deg))', width: 'var(--s)', height: 'var(--s)',
    });
    assertProperties(page, '.site-tab', {'font-size': '1.15rem', 'font-weight': '700', 'line-height': '1.2', color: '#8b7d6b'});
    assertProperties(page, '.site-tab', {'font-size': '1.1rem'}, '@media (max-width: 460px)');
  }
  for (const [page, selector] of [['index.html', '.header p'], ['guestbook.html', '.guestbook-heading p']]) {
    assertProperties(page, selector, {'font-size': '0.9rem', 'font-weight': '400', 'line-height': '1.2', color: '#8b7d6b'});
  }
});

test('“随喜，了缘”只共用链接外观，主页网格与留笺固定定位分别保留', () => {
  for (const [page, selector] of [['index.html', '.footer-link'], ['guestbook.html', '.site-footer-link']]) {
    assertProperties(page, selector, {
      color: '#8b2500', 'font-weight': '700', 'text-decoration': 'underline',
      'text-decoration-thickness': '1px', 'text-underline-offset': '0.16rem',
    });
    assertProperties(page, `${selector}:hover`, {color: '#7a1f00'});
  }
  assertProperties('index.html', '.footer-right', {'grid-column': '2', 'grid-row': '2', 'text-align': 'right'});
  assertProperties('index.html', '.footer-right', {'grid-column': '1', 'grid-row': '2'}, '@media (max-width: 860px)');
  assertProperties('guestbook.html', '.site-footer-link', {
    position: 'fixed', right: 'max(0.8rem, calc((100vw - 1320px) / 2))', bottom: '2.6rem',
    'z-index': '2', height: '1.25rem', 'font-size': '0.9rem', 'line-height': '1.2',
  });
  assertProperties('guestbook.html', '.site-footer-link', {right: '0.7rem', bottom: '1.7rem'}, '@media (max-width: 860px)');
});
