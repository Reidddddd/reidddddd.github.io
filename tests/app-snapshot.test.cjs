const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const frontendRoot = path.resolve(__dirname, '..');

// 只模拟控制流程用到的 DOM，不启动浏览器，也不请求真实服务。
class Element {
  constructor() {
    this.children = [];
    this.dataset = {};
    this.events = new Map();
    this.className = '';
    this.value = '';
    this.style = {setProperty() {}, removeProperty() {}};
    this.classList = {
      toggle: (name, enabled) => {
        const classes = new Set(this.className.split(' ').filter(Boolean));
        if (enabled) classes.add(name);
        else classes.delete(name);
        this.className = [...classes].join(' ');
      },
      add: name => this.classList.toggle(name, true),
      remove: name => this.classList.toggle(name, false),
    };
  }

  addEventListener(type, callback) {
    this.events.set(type, callback);
  }

  appendChild(child) {
    this.children.push(child);
  }

  setAttribute(name, value) {
    this[name] = value;
  }

  querySelectorAll(selector) {
    const children = this.children.flatMap(child => [child, ...child.querySelectorAll('*')]);
    return children.filter(child => selector === '*'
      || (selector.startsWith('.') && child.className.split(' ').includes(selector.slice(1))));
  }
}

function createPage() {
  const elements = new Map();
  const body = new Element();
  const document = {
    body,
    createElement: () => new Element(),
    getElementById(id) {
      if (!elements.has(id)) {
        const element = new Element();
        elements.set(id, element);
        body.appendChild(element);
      }
      return elements.get(id);
    },
    querySelectorAll: selector => body.querySelectorAll(selector),
    querySelector: () => new Element(),
  };
  const gua = {
    label: '本卦', name: '乾卦', sym_shang: '☰', sym_xia: '☰',
    color_shang: '#8b2500', color_xia: '#8b2500',
    zhou_yi: {gua_ci: '元亨利贞。', tuan_zhuan: '大哉乾元。', xiang_zhuan: '天行健。', yao_ci: []},
  };
  const requests = [];
  let finishRequest;
  const context = vm.createContext({
    document, console, AbortController, performance,
    // 缩短纯展示延迟；保留异步时序和取消机制。
    setTimeout: callback => setTimeout(callback, 0),
    clearTimeout,
    requestAnimationFrame: () => 0,
    cancelAnimationFrame() {},
    matchMedia: () => ({matches: true}),
    addEventListener() {},
    crypto: {getRandomValues: values => values.fill(0)},
    MYHS_API_CLIENT: {
      API_ERROR_KIND: {},
      ApiRequestError: class extends Error {},
      async fetchLunarData() {
        return {json: async () => ({lunar_cast: {numbers: [2, 5, 1], minuteShu: 10}})};
      },
      async runSSERequest(requestPath, requestBody, handleEvent) {
        requests.push({path: requestPath, body: JSON.parse(requestBody)});
        if (requestPath === '/api/jie-gua') {
          await new Promise((resolve, reject) => {
            finishRequest = error => error ? reject(error) : resolve();
          });
        }
        handleEvent('hexagrams', JSON.stringify({guas: [gua]}));
        if (requestPath === '/api/jie-gua') {
          handleEvent('result', JSON.stringify('<p>白话结果</p>'));
          handleEvent('yi_li', JSON.stringify('<p>易理结果</p>'));
        }
        handleEvent('done', '""');
      },
    },
    // 日期选择器已有独立回归测试，这里只提供页面初始化所需的接口。
    MYHS_LUNAR_PICKER: {LunarPicker: class {
      constructor(options) { this.options = options; }
      initialize() { this.options.onRefresh(); }
      readSolarDateTime() { return new Date(2026, 8, 16, 21, 10); }
      formatSolarDateTime() { return '2026-09-16T21:10'; }
      stopFollowingNow() {}
    }},
  });
  context.window = context;
  for (const file of ['cast-state.js', 'hexagram-renderer.js', 'jie-gua-result.js', 'app.js']) {
    vm.runInContext(fs.readFileSync(path.join(frontendRoot, file), 'utf8'), context, {filename: file});
  }

  return {
    context,
    requests,
    element: id => document.getElementById(id),
    click: id => document.getElementById(id).events.get('click')(),
    finishRequest: error => finishRequest(error),
    savedHtml: () => vm.runInContext('jieGuaResult.buildSavedResultHtml()', context),
  };
}

async function cast(page, mode) {
  vm.runInContext(`castState.setMode('${mode}')`, page.context);
  page.element('question').value = ' 起卦时的问题 ';
  page.element('waiying').value = ' 起卦时的外应 ';
  const tiles = page.element('numberGrid').querySelectorAll('.number-tile');
  tiles[2].events.get('click')();
  tiles[6].events.get('click')();
  await page.click('btnQiGua');
  assert.equal(page.requests[0].path, '/api/qi-gua');
  assert.equal(page.requests[0].body.question, '起卦时的问题');
  assert.equal(page.requests[0].body.wai_ying, '起卦时的外应');
}

for (const mode of ['numbers', 'random', 'lunar', 'custom']) {
  test(`${mode}：保存报告使用当次解卦输入，不受起卦快照或后续编辑影响`, async () => {
    const page = createPage();
    await cast(page, mode);
    page.element('question').value = ' 解卦问题 <B> ';
    page.element('waiying').value = ' 解卦外应 <B> ';
    const operation = page.click('btnJieGua');
    const request = page.requests[1];
    assert.equal(request.path, '/api/jie-gua');
    assert.deepEqual(request.body, {
      cast_mode: mode,
      numbers: page.requests[0].body.numbers,
      question: '解卦问题 <B>',
      wai_ying: '解卦外应 <B>',
    });
    assert.equal(page.element('question').disabled, true);
    assert.equal(page.element('waiying').disabled, true);

    // 即使外部代码改变输入值，正在生成的报告也不能被污染。
    page.element('question').value = '请求期间改写的问题';
    page.element('waiying').value = '请求期间改写的外应';
    page.finishRequest();
    await operation;

    assert.equal(page.element('btnSaveResult').disabled, false);
    const html = page.savedHtml();
    assert.ok(html.includes('<title>解卦问题 &lt;B&gt;</title>'));
    assert.ok(html.includes('<dd>解卦外应 &lt;B&gt;</dd>'));
    assert.ok(html.includes(`<dd>${request.body.numbers.join(' ')}</dd>`));
    assert.ok(html.includes('乾卦'));
    assert.ok(!html.includes('起卦时的'));
    assert.ok(!html.includes('请求期间改写的'));
  });
}

test('解卦失败后重试更新快照，空外应仍保存为“无”', async () => {
  const page = createPage();
  await cast(page, 'numbers');
  page.element('question').value = '失败请求的问题';
  let operation = page.click('btnJieGua');
  page.finishRequest(new Error('模拟请求失败'));
  await operation;
  assert.equal(page.element('btnSaveResult').disabled, true);
  assert.equal(page.element('question').disabled, false);

  page.element('question').value = ' 重试的问题 ';
  page.element('waiying').value = '   ';
  operation = page.click('btnJieGua');
  page.finishRequest();
  await operation;
  const request = page.requests[2];
  assert.equal(request.body.question, '重试的问题');
  assert.equal(request.body.wai_ying, '');
  assert.equal(page.element('btnSaveResult').disabled, false);
  const html = page.savedHtml();
  assert.ok(html.includes('<title>重试的问题</title>'));
  assert.ok(html.includes('<dd>无</dd>'));
  assert.ok(!html.includes('失败请求的问题'));
});
