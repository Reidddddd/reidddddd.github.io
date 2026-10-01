const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const {createDocument} = require('./helpers/dom.cjs');

const frontendRoot = path.resolve(__dirname, '..');
const encoder = new TextEncoder();

function event(name, data) {
  return `event: ${name}\ndata: ${JSON.stringify(data)}\n\n`;
}

function createHarness(chunks, {status = 200, requestPath = '/api/jie-gua'} = {}) {
  const document = createDocument();
  const response = new Response(new ReadableStream({
    start(controller) {
      chunks.forEach(chunk => controller.enqueue(
        typeof chunk === 'string' ? encoder.encode(chunk) : chunk,
      ));
      controller.close();
    },
  }), {
    status,
    headers: {'Content-Type': 'text/event-stream', 'X-API-Contract-Version': '1'},
  });
  const reader = response.body.getReader();
  const cleanup = {cancelled: false, released: false};
  const context = vm.createContext({
    document, console, TextDecoder,
    MYHS_API_CONFIG: {
      environment: 'production',
      environments: {production: {baseUrl: 'https://sse-test.invalid'}},
    },
    fetch: async () => ({
      ok: response.ok,
      status: response.status,
      headers: response.headers,
      body: {getReader: () => ({
        read: () => reader.read(),
        async cancel() {
          cleanup.cancelled = true;
          await reader.cancel();
        },
        releaseLock() {
          cleanup.released = true;
          reader.releaseLock();
        },
      })},
    }),
  });
  context.window = context;
  for (const file of ['api-client.js', 'jie-gua-result.js']) {
    vm.runInContext(fs.readFileSync(path.join(frontendRoot, file), 'utf8'), context, {filename: file});
  }
  const dom = {
    resultViewButtons: ['guwen', 'baihua', 'yili'].map(view => {
      const button = document.createElement('button');
      button.dataset.resultView = view;
      return button;
    }),
    btnSaveResult: document.createElement('button'),
    resultTools: document.createElement('div'),
    resultPlaceholder: document.createElement('div'),
    resultContent: document.createElement('div'),
    resultStatus: document.createElement('div'),
  };
  dom.resultTools.style.display = 'none';
  dom.resultContent.innerHTML = '';
  const result = new context.MYHS_JIE_GUA_RESULT.JieGuaResult({
    document, dom, escapeHtml: text => text, onSyncLayout() {},
  });
  result.setCastSnapshot({question: '测试', numbers: [8, 13], mode: '数字起卦', waiYing: '无'});
  result.setHexagramsHtml('<div>卦象</div>');
  result.setGuwenHtml('<p>古文</p>');
  const events = [];
  const client = context.MYHS_API_CLIENT;
  const requestBody = JSON.stringify({numbers: [8, 13], question: '测试'});

  return {
    client, result, dom, events, cleanup,
    run(handler = () => {}) {
      return client.runSSERequest(requestPath, requestBody, (name, rawData) => {
        const data = JSON.parse(rawData);
        events.push([name, data]);
        if (name === 'yi_li_chunk') result.appendStreamText('yili', data);
        if (name === 'result_chunk') result.appendStreamText('baihua', data);
        if (name === 'result') result.renderResult(data);
        if (name === 'yi_li') result.setYiLi(data);
        handler(name, data);
      });
    },
  };
}

test('完整 SSE：JSON 字符串结果经真实客户端解析后启用结果标签与保存', async () => {
  const expected = [
    ['progress', '正在起卦排盘……'],
    ['hexagrams', {guas: []}],
    ['progress', '正在解卦，请稍候……'],
    ['heartbeat', ''],
    ['thinking', '正在深入分析卦象……'],
    ['yi_li_chunk', '**专业**\n<img src=x onerror=alert(1)>'],
    ['yi_li_chunk', '\n专业后续'],
    ['progress', '正在整理白话解读……'],
    ['result_chunk', '白话「片段」\n下一行'],
    ['result_chunk', '\n白话后续'],
    ['result', '<p>白话结果</p>'],
    ['yi_li', '<p>专业结果</p>'],
    ['done', ''],
  ];
  const bytes = encoder.encode(expected.map(([name, data]) => event(name, data)).join(''));
  // 每个字节单独传递，确保分片确实切入 UTF-8 中文字符内部。
  const page = createHarness(Array.from(bytes, byte => Uint8Array.of(byte)));
  const accumulated = {yi_li_chunk: '', result_chunk: ''};
  await page.run((name, data) => {
    if (name.endsWith('_chunk')) {
      accumulated[name] += data;
      assert.equal(page.dom.resultContent.textContent, accumulated[name]);
      assert.equal(page.dom.resultContent.innerHTML, '');
      assert.equal(page.dom.btnSaveResult.disabled, true);
    }
  });
  page.result.revealCompleteResultTabs();

  assert.equal(JSON.stringify(page.events), JSON.stringify(expected));
  assert.equal(page.dom.resultContent.innerHTML, '<p>白话结果</p>');
  assert.equal(page.dom.resultContent.classList.contains('is-streaming'), false);
  assert.equal(page.dom.btnSaveResult.disabled, false);
  assert.ok(page.dom.resultViewButtons.every(button => !button.disabled));
  page.result.selectResultView('yili');
  assert.equal(page.dom.resultContent.innerHTML, '<p>专业结果</p>');
  assert.equal(page.cleanup.released, true);
  assert.equal(page.cleanup.cancelled, false);
});

test('起卦 SSE：卦象对象与空字符串 done 完整返回', async () => {
  const page = createHarness([
    event('progress', '正在起卦排盘……'),
    event('hexagrams', {guas: []}),
    event('done', ''),
  ], {requestPath: '/api/qi-gua'});
  await page.run();

  assert.equal(JSON.stringify(page.events), JSON.stringify([
    ['progress', '正在起卦排盘……'], ['hexagrams', {guas: []}], ['done', ''],
  ]));
  assert.equal(page.cleanup.released, true);
});

test('SSE 降级：有白话和 done，但无易理时仍可显示白话且不可保存', async () => {
  const page = createHarness([
    event('progress', '正在起卦排盘……'),
    event('hexagrams', {guas: []}),
    event('progress', '正在解卦，请稍候……'),
    event('yi_li_chunk', '专业解读的部分内容'),
    event('result_chunk', '白话解读的部分内容'),
    event('result', '<p>深度求索解读暂时不可用</p>'),
    event('done', ''),
  ]);
  await page.run();
  page.result.revealCompleteResultTabs();

  assert.equal(page.dom.resultContent.innerHTML, '<p>深度求索解读暂时不可用</p>');
  assert.equal(page.dom.resultViewButtons.find(button => button.dataset.resultView === 'yili').disabled, true);
  assert.equal(page.dom.btnSaveResult.disabled, true);
});

test('流内 error：保留已接收事件，拒绝完成请求并清理读取器', async () => {
  const page = createHarness([
    event('hexagrams', {guas: []}),
    event('error', '服务暂时不可用（请求 ID: test-id）'),
  ]);
  await assert.rejects(page.run(), error => {
    assert.equal(error.errorKind, page.client.API_ERROR_KIND.SSE);
    assert.equal(error.message, '服务暂时不可用（请求 ID: test-id）');
    return true;
  });

  assert.equal(page.events.length, 1);
  assert.equal(page.events[0][0], 'hexagrams');
  assert.equal(page.cleanup.cancelled, true);
  assert.equal(page.cleanup.released, true);
});

test('HTTP 429：读取 SSE 字符串提示，不进入正常结果处理', async () => {
  const page = createHarness([event('error', '今天已达次数上限，二十四小时后再来')], {status: 429});
  await assert.rejects(page.run(), error => {
    assert.equal(error.errorKind, page.client.API_ERROR_KIND.RATE_LIMIT);
    assert.equal(error.status, 429);
    assert.equal(error.message, '今天已达次数上限，二十四小时后再来');
    return true;
  });

  assert.equal(page.events.length, 0);
  assert.equal(page.cleanup.cancelled, true);
  assert.equal(page.cleanup.released, true);
});

test('连接提前结束：即使已有结果或心跳，没有 done 也不能算完成', async () => {
  for (const name of ['result', 'heartbeat']) {
    const page = createHarness([event(name, name === 'result' ? '<p>部分结果</p>' : '')]);
    await assert.rejects(page.run(), error => {
      assert.equal(error.errorKind, page.client.API_ERROR_KIND.DISCONNECT);
      return true;
    });
    assert.equal(page.cleanup.released, true);
  }
});

test('CRLF、注释与多行 data：按事件边界组装后再解析 JSON', async () => {
  const page = createHarness([
    ': comment\r\nevent: hexagrams\r\ndata: {\r\ndata: "guas": []}\r\n\r',
    '\nevent: heartbeat\r\ndata: ""\r\n\r\nevent: done\r\ndata: ""\r\n\r\n',
  ]);
  await page.run();

  assert.equal(JSON.stringify(page.events), JSON.stringify([
    ['hexagrams', {guas: []}], ['heartbeat', ''], ['done', ''],
  ]));
  assert.equal(page.cleanup.released, true);
});
