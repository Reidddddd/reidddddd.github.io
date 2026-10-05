const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const frontendRoot = path.resolve(__dirname, '..');

function report(overrides = {}) {
  // 报告生成不需要 DOM、网络或解卦结果组件。
  const context = vm.createContext({});
  context.window = context;
  vm.runInContext(fs.readFileSync(path.join(frontendRoot, 'saved-report.js'), 'utf8'), context);
  return context.MYHS_SAVED_REPORT.buildSavedResultHtml({
    castSnapshot: {question: '所问何事', mode: '数字起卦', numbers: [8, 13], waiYing: ''},
    hexagramsHtml: '<div class="hex-col">乾卦</div>',
    plainHtml: '<h2>白话</h2><p>白话正文</p>',
    yiLiHtml: '<h3>易理</h3><p>易理正文</p>',
    guwenHtml: '<p>元亨利贞</p>',
    escapeHtml: value => String(value).replace(/[&<>"']/g, character => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    })[character]),
    ...overrides,
  });
}

test('独立报告保留全部内容与内嵌样式，无需外部资源即可离线打开', () => {
  const html = report();
  assert.ok(html.startsWith('<!doctype html>'));
  for (const content of ['数字起卦', '8 13', '<dt>外应</dt><dd>无</dd>',
    '乾卦', '白话正文', '易理正文', '元亨利贞', '<style>', '@media (max-width: 640px)', 'bg-temple']) {
    assert.ok(html.includes(content), content);
  }
  assert.doesNotMatch(html, /<script|<link|<img|\burl\(/i);
});

test('报告元信息仍进行 HTML 转义，已经清洗的正文与卦象 HTML 保持原样', () => {
  const html = report({castSnapshot: {
    question: '<script>"问&卦"</script>', mode: '<数字>', numbers: [8, 13], waiYing: "'<外应>",
  }});
  assert.ok(html.includes('<title>&lt;script&gt;&quot;问&amp;卦&quot;&lt;/script&gt;</title>'));
  assert.ok(html.includes('<dd>&lt;数字&gt;</dd>'));
  assert.ok(html.includes('<dd>&#39;&lt;外应&gt;</dd>'));
  assert.ok(html.includes('<div class="hex-col">乾卦</div>'));
  assert.ok(html.includes('<p>元亨利贞</p>'));
  assert.doesNotMatch(html, /<script>/);
});

test('只去掉正文开头的重复白话和易理标题，保留后续章节与不同标题', () => {
  const html = report({
    plainHtml: '  <h1 class="heading"> 白话 </h1>\n<p>正文</p><h2>白话</h2>',
    yiLiHtml: '<h2>判断依据</h2><p>易理内容</p>',
  });
  assert.ok(html.includes('<div class="result-content"><p>正文</p><h2>白话</h2></div>'));
  assert.ok(html.includes('<h2>判断依据</h2><p>易理内容</p>'));
  assert.doesNotMatch(html, /<h1 class="heading">/);
});
