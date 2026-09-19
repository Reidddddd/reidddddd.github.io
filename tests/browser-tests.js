(function (global) {
  const API_CLIENT = global.MYHS_API_CLIENT;
  const CAST_STATE = global.MYHS_CAST_STATE;
  const HEXAGRAM_RENDERER = global.MYHS_HEXAGRAM_RENDERER;
  const JIE_GUA_RESULT = global.MYHS_JIE_GUA_RESULT;
  const dom = {
    runButton: document.getElementById('runTests'),
    summary: document.getElementById('summary'),
    results: document.getElementById('results'),
  };
  const testCases = [
    ['SSE 客户端解析分片、多行 data 与注释', testSSEClient],
    ['前后端 SSE 事件与 payload 契约', testSSEContract],
    ['起卦状态覆盖四种模式', testCastModes],
    ['解卦结果标签切换与保存状态', testResultTabs],
  ];
  let isRunning = false;

  // 测试断言与模拟读取器
  function assert(condition, message) {
    if (!condition) throw new Error(message);
  }

  function assertEqual(actual, expected, message) {
    if (actual !== expected) {
      throw new Error(`${message}：实际为 ${String(actual)}，应为 ${String(expected)}`);
    }
  }

  function assertDeepEqual(actual, expected, message) {
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
      throw new Error(
        `${message}：实际为 ${JSON.stringify(actual)}，应为 ${JSON.stringify(expected)}`,
      );
    }
  }

  function makeReader(chunks) {
    const encoder = new global.TextEncoder();
    let index = 0;
    let released = false;

    return {
      async read() {
        if (index >= chunks.length) return {done: true, value: undefined};
        return {done: false, value: encoder.encode(chunks[index++])};
      },
      async cancel() {},
      releaseLock() {
        released = true;
      },
      wasReleased() {
        return released;
      },
    };
  }

  function makeSSEEvent(event, data) {
    return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  }

  // API 客户端测试
  async function testSSEClient() {
    const events = [];
    const reader = makeReader([
      'event: heartbeat\ndata: ""\n\nevent: progress\ndata: 第一行',
      '\ndata: 第二行\n\n',
      'event: done\ndata: {}\n\n',
    ]);
    const originalFetch = global.fetch;
    let requestUrl = '';
    let requestOptions = null;

    global.fetch = async (url, options) => {
      requestUrl = url;
      requestOptions = options;
      return {
        ok: true,
        status: 200,
        headers: new global.Headers({'X-API-Contract-Version': '1'}),
        body: {getReader: () => reader},
      };
    };

    try {
      await API_CLIENT.runSSERequest(
        '/api/test',
        '{"question":"测试"}',
        (event, data) => events.push([event, data]),
      );
    } finally {
      global.fetch = originalFetch;
    }

    assertEqual(
      requestUrl,
      'https://browser-test.invalid/api/test',
      'SSE 请求地址错误',
    );
    assertEqual(requestOptions.method, 'POST', 'SSE 请求方法错误');
    assertEqual(requestOptions.body, '{"question":"测试"}', 'SSE 请求体错误');
    assertDeepEqual(
      events,
      [['heartbeat', ''], ['progress', '第一行\n第二行'], ['done', '{}']],
      'SSE 事件解析错误',
    );
    assert(reader.wasReleased(), 'SSE 读取器没有释放');
  }

  // 前后端 SSE 事件和 payload 契约测试。
  async function testSSEContract() {
    const hexagramsPayload = {
      guas: [{
        label: '本卦',
        name: '乾卦',
        sym_shang: '☰',
        sym_xia: '☰',
        color_shang: '#8b2500',
        color_xia: '#8b2500',
        zhou_yi: {
          gua_ci: '元亨利贞。',
          tuan_zhuan: '大哉乾元。',
          xiang_zhuan: '天行健。',
          yao_ci: [{yao_ming: '初九', yao_ci: '潜龙勿用。', is_dong: true}],
        },
      }],
    };
    const expectedEvents = [
      ['progress', '正在起卦排盘……'],
      ['hexagrams', hexagramsPayload],
      ['progress', '正在解卦，请稍候……'],
      ['heartbeat', ''],
      ['yi_li_chunk', '专业片段'],
      ['result_chunk', '白话片段'],
      ['result', {html: '<p>白话结果</p>'}],
      ['yi_li', {html: '<p>专业结果</p>'}],
      ['done', ''],
    ];
    const streamText = expectedEvents
      .map(([event, data]) => makeSSEEvent(event, data))
      .join('');
    const reader = makeReader([
      streamText.slice(0, 23),
      streamText.slice(23, 91),
      streamText.slice(91),
    ]);
    const events = [];
    const originalFetch = global.fetch;
    let requestUrl = '';
    let requestBody = '';

    global.fetch = async (url, options) => {
      requestUrl = url;
      requestBody = options.body;
      return {
        ok: true,
        status: 200,
        headers: new global.Headers({'X-API-Contract-Version': '1'}),
        body: {getReader: () => reader},
      };
    };

    try {
      await API_CLIENT.runSSERequest(
        '/api/jie-gua',
        JSON.stringify({numbers: [8, 13, 5], question: '测试'}),
        (event, rawData) => {
          let data;
          try {
            data = JSON.parse(rawData);
          } catch (_) {
            data = rawData;
          }
          events.push([event, data]);
        },
      );
    } finally {
      global.fetch = originalFetch;
    }

    assertEqual(requestUrl, 'https://browser-test.invalid/api/jie-gua', '解卦请求地址错误');
    assertEqual(
      requestBody,
      JSON.stringify({numbers: [8, 13, 5], question: '测试'}),
      '解卦请求体错误',
    );
    assertDeepEqual(events, expectedEvents, '前后端 SSE 事件或 payload 不一致');
  }

  // 起卦状态测试
  function testCastModes() {
    const numbers = new CAST_STATE.CastStateMachine();
    numbers.addNumber(3);
    numbers.addNumber(7);
    assertDeepEqual(numbers.activeNumbers(), [3, 7], '数字起卦结果错误');
    assert(numbers.canCast({question: '数字问题'}), '数字起卦不能满足起卦条件');

    const random = new CAST_STATE.CastStateMachine();
    assert(random.setMode('random'), '切换天选数模式失败');
    random.addRandomNumber(4);
    random.addRandomNumber(6);
    assertDeepEqual(random.activeNumbers(), [4, 6], '天选数起卦结果错误');
    assert(random.canCast({question: '天选数问题'}), '天选数起卦不能满足起卦条件');

    const lunar = new CAST_STATE.CastStateMachine();
    assert(lunar.setMode('lunar'), '切换农历时模式失败');
    const lunarCast = {numbers: [2, 5, 1]};
    assertDeepEqual(lunar.activeNumbers(lunarCast), [2, 5, 1], '农历时起卦结果错误');
    assert(
      lunar.canCast({hasLunarDate: true, question: '农历时问题'}),
      '农历时起卦不能满足起卦条件',
    );

    const custom = new CAST_STATE.CastStateMachine();
    assert(custom.setMode('custom'), '切换自定义模式失败');
    custom.setCustomValue('shang', 8);
    custom.setCustomValue('xia', 3);
    custom.setCustomValue('dong', 2);
    assertDeepEqual(custom.activeNumbers(), [8, 3, 2], '自定义起卦结果错误');
    assert(custom.canCast({question: '自定义问题'}), '自定义起卦不能满足起卦条件');

    custom.setBusy(true);
    assert(!custom.setCustomValue('shang', 1), '忙碌时仍允许修改起卦输入');
    assert(!custom.canCast({question: '忙碌问题'}), '忙碌时仍允许起卦');
    custom.setBusy(false);
  }

  // 解卦结果测试
  function createResultFixture() {
    const root = document.createElement('div');
    const resultTools = document.createElement('div');
    const resultViewButtons = ['guwen', 'baihua', 'yili'].map(view => {
      const button = document.createElement('button');
      button.dataset.resultView = view;
      resultTools.appendChild(button);
      return button;
    });
    const btnSaveResult = document.createElement('button');
    const resultPlaceholder = document.createElement('div');
    const resultContent = document.createElement('div');
    const resultStatus = document.createElement('div');
    resultTools.style.display = 'none';
    resultPlaceholder.style.display = '';
    resultContent.style.display = 'none';
    resultStatus.style.display = 'block';
    resultTools.appendChild(btnSaveResult);
    root.append(resultTools, resultPlaceholder, resultContent, resultStatus);
    document.body.appendChild(root);

    return {
      root,
      dom: {
        resultViewButtons,
        btnSaveResult,
        resultTools,
        resultPlaceholder,
        resultContent,
        resultStatus,
      },
    };
  }

  function testResultTabs() {
    const fixture = createResultFixture();
    const result = new JIE_GUA_RESULT.JieGuaResult({
      document,
      dom: fixture.dom,
      escapeHtml: HEXAGRAM_RENDERER.escapeHtml,
      onSyncLayout: () => {},
    });

    try {
      result.resetForCast();
      assert(
        fixture.dom.resultViewButtons.every(button => button.disabled),
        '没有结果时标签不应可用',
      );
      assert(fixture.dom.btnSaveResult.disabled, '没有完整结果时保存按钮不应可用');

      result.setCastSnapshot({
        question: '测试问题',
        numbers: [1, 2],
        mode: '数字起卦',
        waiYing: '无',
      });
      result.setHexagramsHtml('<div>卦象</div>');
      result.setGuwenHtml('<p>古文</p>');
      result.appendStreamText('baihua', '白话');
      result.appendStreamText('baihua', '片段');
      assertEqual(
        fixture.dom.resultContent.textContent,
        '白话片段',
        '白话流式片段没有按顺序累积',
      );
      result.appendStreamText('yili', '专业片段');
      assertEqual(
        fixture.dom.resultContent.textContent,
        '专业片段',
        '易理流式片段没有按顺序累积',
      );
      assert(
        fixture.dom.btnSaveResult.disabled,
        '流式结果未完成时保存按钮不应可用',
      );
      result.renderResult({html: '<p>白话</p>'});
      result.setYiLi({html: '<p>易理</p>'});
      result.revealCompleteResultTabs();

      assert(
        fixture.dom.resultViewButtons.every(button => !button.disabled),
        '完整结果的标签应全部可用',
      );
      assert(!fixture.dom.btnSaveResult.disabled, '完整结果的保存按钮应可用');
      assert(
        fixture.dom.resultViewButtons
          .find(button => button.dataset.resultView === 'baihua')
          .classList.contains('active'),
        '完整结果应默认显示白话',
      );
      assertEqual(fixture.dom.resultContent.innerHTML, '<p>白话</p>', '默认结果内容错误');

      result.selectResultView('guwen');
      assertEqual(fixture.dom.resultContent.innerHTML, '<p>古文</p>', '古文标签内容错误');
      assertEqual(fixture.dom.resultContent.style.display, 'grid', '古文结果布局错误');

      result.selectResultView('yili');
      assertEqual(fixture.dom.resultContent.innerHTML, '<p>易理</p>', '易理标签内容错误');
      assertEqual(fixture.dom.resultContent.style.display, 'block', '易理结果布局错误');

      result.resetForInterpretation();
      assert(
        fixture.dom.resultViewButtons.every(button => button.disabled),
        '重新解卦前不应保留旧结果标签',
      );
      assert(fixture.dom.btnSaveResult.disabled, '重新解卦前保存按钮应禁用');
    } finally {
      fixture.root.remove();
    }
  }

  function renderTestResult(name, error) {
    const item = document.createElement('li');
    item.className = `test-result ${error ? 'is-fail' : 'is-pass'}`;
    item.textContent = name;
    if (error) {
      const detail = document.createElement('span');
      detail.className = 'test-error';
      detail.textContent = error.stack || error.message || String(error);
      item.appendChild(detail);
    }
    dom.results.appendChild(item);
  }

  async function runTests() {
    if (isRunning) return;
    isRunning = true;
    dom.runButton.disabled = true;
    dom.results.replaceChildren();
    dom.summary.className = '';
    dom.summary.textContent = '测试运行中……';
    let passed = 0;

    for (const [name, test] of testCases) {
      let error = null;
      try {
        await test();
        passed += 1;
      } catch (testError) {
        error = testError;
      }
      renderTestResult(name, error);
    }

    const total = testCases.length;
    const success = passed === total;
    dom.summary.className = success ? 'is-success' : 'is-failure';
    dom.summary.textContent = `${passed}/${total} 项测试通过`;
    dom.runButton.disabled = false;
    isRunning = false;
  }

  dom.runButton.addEventListener('click', runTests);
  runTests();
})(window);
