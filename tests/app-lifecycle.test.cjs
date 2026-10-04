const assert = require('node:assert/strict');
const test = require('node:test');
const {createPage} = require('./helpers/homepage.cjs');

function chooseNumbers(page) {
  page.element('question').value = '所问何事';
  page.element('waiying').value = '窗外有风';
  const tiles = page.element('numberGrid').querySelectorAll('.number-tile');
  tiles[2].events.get('click')();
  tiles[6].events.get('click')();
}

async function prepareHexagrams(page) {
  chooseNumbers(page);
  const operation = page.click('btnQiGua');
  const request = page.requests.at(-1);
  request.emit('hexagrams', {guas: [page.gua]});
  request.emit('done', '');
  request.resolve();
  await operation;
  return request;
}

function completeInterpretation(page, request, {withYiLi = true} = {}) {
  request.emit('hexagrams', {guas: [page.gua]});
  request.emit('result', '<p>白话结果</p>');
  if (withYiLi) request.emit('yi_li', '<p>易理结果</p>');
  request.emit('done', '');
  request.resolve();
}

async function confirmReset(page) {
  const reset = page.click('btnReset');
  if (page.element('confirmModal').style.display === 'flex') {
    page.element('confirmOk').onclick();
  }
  await reset;
}

test('主页按真实脚本顺序组装，模式切换、输入锁定与起卦按钮保持原行为', async () => {
  const page = createPage({manualRequests: true});
  await page.selectMode('custom');
  assert.equal(page.element('customCastPanel').hidden, false);
  assert.equal(page.element('numberCastPanel').hidden, true);
  assert.equal(page.element('btnQiGua').disabled, true);
  page.element('question').value = '所问何事';
  page.element('question').events.get('input')();
  assert.equal(page.element('btnQiGua').disabled, false);

  const operation = page.click('btnQiGua');
  assert.deepEqual(page.requests[0].body.numbers, [1, 1, 1]);
  assert.ok(page.modeButtons.every(button => button.disabled));
  await page.selectMode('random');
  await page.click('btnQiGua');
  assert.equal(page.requests.length, 1);
  assert.equal(page.element('randomCastPanel').hidden, true);
  page.requests[0].emit('done', '');
  page.requests[0].resolve();
  await operation;
  assert.equal(page.element('btnJieGua').disabled, false);
  assert.equal(page.element('question').disabled, false);
});

test('起卦中重起：取消请求，迟到事件与旧 finally 不覆盖新操作', async () => {
  const page = createPage({manualRequests: true});
  chooseNumbers(page);
  const oldOperation = page.click('btnQiGua');
  const oldRequest = page.requests[0];
  await confirmReset(page);
  assert.equal(oldRequest.signal.aborted, true);
  assert.equal(page.element('question').value, '');
  assert.equal(page.element('selectedNums').textContent, '');

  chooseNumbers(page);
  const newOperation = page.click('btnQiGua');
  oldRequest.emit('hexagrams', {guas: [page.gua]});
  oldRequest.emit('done', '');
  oldRequest.resolve();
  await oldOperation;
  assert.equal(page.element('hexCols').style.display, 'none');
  assert.equal(page.element('question').disabled, true);
  assert.equal(page.element('btnJieGua').disabled, true);
  page.requests[1].emit('done', '');
  page.requests[1].resolve();
  await newOperation;
  assert.equal(page.element('question').disabled, false);
  assert.equal(page.element('btnJieGua').disabled, false);
});

test('解卦流：进度、增量、最终结果、标签切换与保存继续共用结果模块', async () => {
  const page = createPage({manualRequests: true});
  await prepareHexagrams(page);
  const operation = page.click('btnJieGua');
  const request = page.requests[1];
  request.emit('progress', '正在排盘');
  assert.equal(page.element('statusText').textContent, '正在排盘');
  request.emit('thinking', '正在分析');
  assert.equal(page.element('statusText').textContent, '正在分析');
  request.emit('yi_li_chunk', '**易理**');
  assert.equal(page.element('resultContent').textContent, '**易理**');
  request.emit('result_chunk', '<img src=x>');
  assert.equal(page.element('resultContent').textContent, '<img src=x>');
  completeInterpretation(page, request);
  await operation;
  assert.equal(page.element('statusNotice').hidden, true);
  assert.equal(page.element('resultTools').style.display, 'flex');
  assert.equal(page.element('resultContent').innerHTML, '<p>白话结果</p>');
  assert.equal(page.element('btnSaveResult').disabled, false);
  assert.equal(page.element('question').disabled, true);
  page.resultViewButtons.find(button => button.dataset.resultView === 'guwen').events.get('click')();
  assert.equal(page.element('resultContent').style.display, 'grid');
  assert.ok(page.element('resultContent').innerHTML.includes('大哉乾元'));
  page.resultViewButtons.find(button => button.dataset.resultView === 'yili').events.get('click')();
  assert.equal(page.element('resultContent').innerHTML, '<p>易理结果</p>');
});

test('解卦中重起需确认，取消确认保留请求，确认后忽略旧结果与旧错误', async () => {
  const page = createPage({manualRequests: true});
  await prepareHexagrams(page);
  const operation = page.click('btnJieGua');
  const request = page.requests[1];
  const reset = page.click('btnReset');
  page.element('confirmCancel').onclick();
  await reset;
  assert.equal(request.signal.aborted, false);
  assert.equal(page.element('question').disabled, true);

  await confirmReset(page);
  request.emit('result_chunk', '旧增量');
  request.emit('result', '<p>旧结果</p>');
  request.reject(new Error('迟到的旧错误'));
  await operation;
  assert.equal(request.signal.aborted, true);
  assert.equal(page.element('statusNotice').hidden, true);
  assert.equal(page.element('resultContent').style.display, 'none');
  assert.equal(page.element('resultContent').textContent, '');
  assert.equal(page.element('btnSaveResult').disabled, true);
  assert.equal(page.element('question').disabled, false);
});

test('结果展示延迟中重起会取消等待，不会在重起后重新显示旧标签', async () => {
  const page = createPage({manualRequests: true});
  await prepareHexagrams(page);
  const operation = page.click('btnJieGua');
  completeInterpretation(page, page.requests[1]);
  // 让 Promise 链进入展示延迟，不推进 setTimeout。
  for (let i = 0; i < 6; i++) await Promise.resolve();
  assert.equal(page.element('resultTools').style.display, 'none');
  await confirmReset(page);
  await operation;
  assert.equal(page.element('resultTools').style.display, 'none');
  assert.equal(page.element('btnSaveResult').disabled, true);
  assert.equal(page.element('question').disabled, false);
});

test('无易理的降级结果仍显示白话，但不启用易理和保存', async () => {
  const page = createPage({manualRequests: true});
  await prepareHexagrams(page);
  const operation = page.click('btnJieGua');
  completeInterpretation(page, page.requests[1], {withYiLi: false});
  await operation;
  assert.equal(page.element('resultContent').innerHTML, '<p>白话结果</p>');
  assert.equal(page.resultViewButtons.find(button => button.dataset.resultView === 'yili').disabled, true);
  assert.equal(page.element('btnSaveResult').disabled, true);
});

test('解卦无最终正文时沿用不完整提示，并解锁输入供重试', async () => {
  const page = createPage({manualRequests: true});
  await prepareHexagrams(page);
  const operation = page.click('btnJieGua');
  page.requests[1].emit('result_chunk', '只有增量');
  page.requests[1].emit('done', '');
  page.requests[1].resolve();
  await operation;
  assert.equal(page.element('statusText').textContent, '返回不完整');
  assert.equal(page.element('statusReminder').hidden, true);
  assert.equal(page.element('question').disabled, false);
  assert.equal(page.element('btnJieGua').disabled, false);
});

for (const [kind, status, message, expected] of [
  ['rate_limit', 429, '次数已达上限', '次数已达上限'],
  ['http', 400, '数字不合法', '请求参数有误'],
  ['http', 504, '上游超时', '服务响应超时'],
  ['sse', null, '处理失败', '服务处理失败'],
  ['network', null, '请检查连接', '连接失败'],
  ['disconnect', null, '连接结束', '连接中断'],
  ['contract', null, '版本错误', '接口版本不匹配'],
  ['cancelled', null, '已取消', '请求已取消'],
  ['unknown', null, '内部错误', '连接出错'],
]) {
  test(`请求错误 ${kind}/${status}：保留原提示映射与起卦失败清理`, async () => {
    const page = createPage({manualRequests: true});
    chooseNumbers(page);
    const operation = page.click('btnQiGua');
    const ErrorType = page.context.MYHS_API_CLIENT.ApiRequestError;
    page.requests[0].emit('hexagrams', {guas: [page.gua]});
    page.requests[0].reject(new ErrorType(kind, message, status));
    await operation;
    assert.equal(page.element('statusText').textContent, expected);
    assert.equal(page.element('hexCols').style.display, 'none');
    assert.equal(page.element('statusReminder').hidden, true);
    assert.equal(page.element('question').disabled, false);
    assert.equal(page.element('btnQiGua').disabled, false);
    assert.equal(page.element('btnJieGua').disabled, true);
  });
}

test('天选数滚动中重起会结束动画等待，不再发送起卦请求', async () => {
  const page = createPage({manualRequests: true});
  await page.selectMode('random');
  page.element('question').value = '所问何事';
  const operation = page.click('btnQiGua');
  assert.equal(page.element('randomCastPanel').classList.contains('is-rolling'), true);
  await confirmReset(page);
  await operation;
  assert.equal(page.requests.length, 0);
  assert.equal(page.element('randomCastPanel').classList.contains('is-rolling'), false);
  assert.equal(page.element('randomNumber').textContent, '');
  assert.equal(page.element('question').disabled, false);
});

test('农历换算中重起：迟到的换算不写入新模式，也不结束新请求', async () => {
  let resolveLunar;
  const page = createPage({
    manualRequests: true,
    fetchLunarData: async (_, {signal} = {}) => {
      if (!signal) return {json: async () => ({})};
      return new Promise(resolve => { resolveLunar = resolve; });
    },
  });
  await page.selectMode('lunar');
  page.element('question').value = '所问何事';
  const oldOperation = page.click('btnQiGua');
  await confirmReset(page);
  await page.selectMode('numbers');
  chooseNumbers(page);
  const newOperation = page.click('btnQiGua');
  resolveLunar({json: async () => ({lunar_cast: {numbers: [8, 9, 10], minuteShu: 10}})});
  await oldOperation;
  assert.equal(page.requests.length, 1);
  assert.equal(page.requests[0].body.cast_mode, 'numbers');
  assert.equal(page.element('question').disabled, true);
  page.requests[0].emit('done', '');
  page.requests[0].resolve();
  await newOperation;
});

test('桌面布局继续按左右列边缘同步，窗口变化与移动端回退保持不变', () => {
  const desktop = createPage({isMobile: false});
  desktop.flushFrames();
  assert.equal(desktop.element('rightCol').style.height, '390px');
  desktop.layout.leftBottom = 837.5;
  desktop.windowEvent('resize');
  desktop.flushFrames();
  assert.equal(desktop.element('rightCol').style.height, '658px');
  desktop.layout.leftBottom = 100;
  desktop.windowEvent('load');
  desktop.flushFrames();
  assert.equal(desktop.element('rightCol').style.height, '');
  const mobile = createPage();
  mobile.flushFrames();
  assert.equal(mobile.element('rightCol').style.height, '');
});

test('解卦收尾继续等待背景转完，收尾中重起也会结束等待', async () => {
  for (const resetDuringAnimation of [false, true]) {
    const page = createPage({manualRequests: true, withBackground: true, reducedMotion: false});
    await prepareHexagrams(page);
    const operation = page.click('btnJieGua');
    page.flushFrames(100);
    assert.equal(page.rotation.get('--bg-rotation'), '43deg');
    completeInterpretation(page, page.requests[1]);
    for (let i = 0; i < 6; i++) await Promise.resolve();
    assert.equal(page.element('resultTools').style.display, 'none');
    if (resetDuringAnimation) await confirmReset(page);
    else page.flushFrames(1000);
    await operation;
    assert.equal(page.rotation.has('--bg-rotation'), false);
    assert.equal(page.element('resultTools').style.display, resetDuringAnimation ? 'none' : 'flex');
    assert.equal(page.element('question').disabled, !resetDuringAnimation);
    page.flushFrames(2000);
    assert.equal(page.rotation.has('--bg-rotation'), false);
  }
});
