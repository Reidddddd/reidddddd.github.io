const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const frontendRoot = path.resolve(__dirname, '..');
const requests = [
  client => client.fetchLunarData('2026-09-16T21:10'),
  client => client.fetchGuestbook(),
  client => client.createGuestbookEntry({nickname: '佚名', content: '测试'}),
  client => client.createGuestbookReply(1, {nickname: '佚名', content: '测试'}),
  client => client.runSSERequest('/api/qi-gua', '{}', () => {}),
  client => client.runSSERequest('/api/jie-gua', '{}', () => {}),
];

function createClient(response) {
  const context = vm.createContext({
    URLSearchParams, TextDecoder,
    MYHS_API_CONFIG: {
      environment: 'production',
      environments: {production: {baseUrl: 'https://api-test.invalid'}},
    },
    fetch: async () => response,
  });
  context.window = context;
  vm.runInContext(fs.readFileSync(path.join(frontendRoot, 'api-client.js'), 'utf8'), context);
  return context.MYHS_API_CLIENT;
}

test('代理返回无契约头的 502/504 时，所有接口保留 HTTP 状态与对应提示', async () => {
  for (const [status, message] of [
    [502, '服务暂时不可用，请稍后重试。'],
    [504, '服务响应超时，请稍后重试。'],
  ]) {
    for (const request of requests) {
      const client = createClient(new Response('<html>proxy error</html>', {
        status, headers: {'Content-Type': 'text/html'},
      }));
      await assert.rejects(request(client), error => {
        assert.equal(error.errorKind, client.API_ERROR_KIND.HTTP);
        assert.equal(error.status, status);
        assert.equal(error.message, message);
        return true;
      });
    }
  }
});

test('错误响应不被缺失或不匹配的契约头掩盖，仍读取 JSON 错误提示', async () => {
  for (const version of [null, '1', '2']) {
    for (const request of requests) {
      const headers = {'Content-Type': 'application/json'};
      if (version !== null) headers['X-API-Contract-Version'] = version;
      const client = createClient(new Response(JSON.stringify({error: {message: '投笺过于频繁'}}), {
        status: 429, headers,
      }));
      await assert.rejects(request(client), error => {
        assert.equal(error.errorKind, client.API_ERROR_KIND.RATE_LIMIT);
        assert.equal(error.status, 429);
        assert.equal(error.message, '投笺过于频繁');
        return true;
      });
    }
  }
});

test('无契约头且错误 JSON 无法解析时，回退到 HTTP 状态提示', async () => {
  for (const request of requests) {
    const client = createClient(new Response('not json', {
      status: 400, headers: {'Content-Type': 'application/json'},
    }));
    await assert.rejects(request(client), error => {
      assert.equal(error.errorKind, client.API_ERROR_KIND.HTTP);
      assert.equal(error.status, 400);
      assert.equal(error.message, '请求参数有误，请检查后重试。');
      return true;
    });
  }
});

test('无契约头的 SSE 429 仍读取限流提示，不触发正常事件回调', async () => {
  const client = createClient(new Response('event: error\ndata: "今日次数已用尽"\n\n', {
    status: 429, headers: {'Content-Type': 'text/event-stream'},
  }));
  let receivedEvents = 0;
  await assert.rejects(client.runSSERequest('/api/jie-gua', '{}', () => {
    receivedEvents++;
  }), error => {
    assert.equal(error.errorKind, client.API_ERROR_KIND.RATE_LIMIT);
    assert.equal(error.status, 429);
    assert.equal(error.message, '今日次数已用尽');
    return true;
  });
  assert.equal(receivedEvents, 0);
});

test('契约版本正确的成功 JSON 响应仍可正常读取', async () => {
  for (const request of requests.slice(0, 4)) {
    const client = createClient(new Response('{"message":"正常响应"}', {
      headers: {'Content-Type': 'application/json', 'X-API-Contract-Version': '1'},
    }));
    const response = await request(client);
    const data = response instanceof Response ? await response.json() : response;
    assert.equal(data.message, '正常响应');
  }
});

test('成功响应仍要求契约版本匹配，所有接口拒绝缺失或错误的版本', async () => {
  for (const version of [null, '2']) {
    for (const request of requests) {
      const headers = {'Content-Type': 'application/json'};
      if (version !== null) headers['X-API-Contract-Version'] = version;
      const client = createClient(new Response('{}', {headers}));
      await assert.rejects(request(client), error => {
        assert.equal(error.errorKind, client.API_ERROR_KIND.CONTRACT);
        assert.equal(error.message, 'API 契约版本不匹配，请刷新页面后重试。');
        return true;
      });
    }
  }
});
