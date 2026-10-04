const assert = require('node:assert/strict');
const test = require('node:test');
const vm = require('node:vm');
const {createPage} = require('./helpers/homepage.cjs');

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
