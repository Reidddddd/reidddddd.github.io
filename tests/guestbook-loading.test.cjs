const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const {createDocument} = require('./helpers/dom.cjs');

const flush = () => new Promise(resolve => setImmediate(resolve));

function makeEntries(count = 20, start = 1) {
  return Array.from({length: count}, (_, index) => ({
    id: start + index,
    nickname: `别号${start + index}`,
    content: `笺文${start + index}`,
    created_at: '2026-10-01T12:00:00Z',
    replies: [],
  }));
}

function enqueueRequest(requests, data) {
  return new Promise((resolve, reject) => {
    requests.push({...data, resolve, reject});
  });
}

function createPage() {
  const document = createDocument();
  const form = document.getElementById('guestbookForm');
  const nickname = document.getElementById('guestbookNickname');
  const content = document.getElementById('guestbookContent');
  const submit = document.getElementById('guestbookSubmit');
  nickname.tagName = 'INPUT';
  nickname.name = 'nickname';
  content.tagName = 'TEXTAREA';
  content.name = 'content';
  submit.tagName = 'BUTTON';
  form.append(nickname, content, submit);

  const reads = [];
  const writes = [];
  const context = vm.createContext({document, window: {
    MYHS_API_CLIENT: {
      fetchGuestbook: parameters => enqueueRequest(reads, parameters),
      createGuestbookEntry: body => enqueueRequest(writes, {body}),
      createGuestbookReply: (entryId, body) => enqueueRequest(writes, {entryId, body}),
    },
  }});
  vm.runInContext(
    fs.readFileSync(path.join(__dirname, '..', 'guestbook.js'), 'utf8'),
    context,
    {filename: 'guestbook.js'},
  );

  return {
    reads,
    writes,
    element: id => document.getElementById(id),
    load: options => context.window.MYHS_GUESTBOOK.loadEntries(options),
    entries: () => document.getElementById('guestbookEntries')
      .querySelectorAll('.guestbook-entry'),
  };
}

async function loadedPage(entries = makeEntries()) {
  const page = createPage();
  page.reads[0].resolve({entries});
  await flush();
  return page;
}

function compose(page, kind) {
  const thread = page.entries()[0]?.querySelector('.reply-thread');
  const form = kind === 'entry' ? page.element('guestbookForm') : thread.querySelector('form');
  const status = kind === 'entry' ? page.element('guestbookFormStatus') : thread.querySelector('.reply-status');
  form.elements.nickname.value = ' 新别号 ';
  form.elements.content.value = ' 新笺文 ';
  return {
    form,
    status,
    submit: () => form.events.get('submit')({preventDefault() {}}),
  };
}

test('正常投笺后刷新列表，清空输入并保留成功提示', async () => {
  const page = await loadedPage([]);
  const composer = compose(page, 'entry');
  const operation = composer.submit();
  assert.equal(composer.status.textContent, '正在投笺……');
  assert.equal(page.writes.length, 1);
  assert.equal(page.writes[0].body.nickname, '新别号');
  assert.equal(page.writes[0].body.content, '新笺文');
  page.writes[0].resolve();
  await flush();
  assert.equal(page.reads[1].offset, 0);
  page.reads[1].resolve({entries: makeEntries(1, 100)});
  await operation;
  assert.equal(page.entries().length, 1);
  assert.equal(composer.form.elements.content.value, '');
  assert.equal(page.element('guestbookCharCount').textContent, '0 / 500');
  assert.equal(composer.status.textContent, '笺文已留。');
  assert.equal(page.element('guestbookLoadMore').hidden, true);
});

for (const kind of ['entry', 'reply']) {
  test(`分页进行中${kind}投递成功，刷新等待分页结束而不被跳过`, async () => {
    const page = await loadedPage();
    const paging = page.load();
    assert.equal(page.reads[1].offset, 20);
    assert.equal(await page.load(), false);
    assert.equal(page.reads.length, 2);
    const composer = compose(page, kind);
    const operation = composer.submit();
    page.writes[0].resolve();
    await flush();
    assert.equal(page.reads.length, 2, '分页未结束时不能并发刷新');
    assert.equal(composer.form.elements.content.value, '');
    if (kind === 'reply') {
      assert.equal(page.writes[0].entryId, 1);
      assert.equal(composer.status.textContent, '', '已投递回复不能继续显示投递中');
    }

    page.reads[1].resolve({entries: makeEntries(20, 21)});
    assert.equal(await paging, true);
    await flush();
    assert.equal(page.reads.length, 3);
    assert.equal(page.reads[2].offset, 0);
    assert.equal(page.element('guestbookLoadMore').disabled, true);
    const latest = makeEntries(20, 100);
    latest[0].replies = [{nickname: '新别号', content: '新笺文', created_at: '2026-10-01T12:01:00Z'}];
    page.reads[2].resolve({entries: latest});
    await operation;
    assert.equal(page.entries().length, 20);
    assert.equal(page.entries()[0].querySelector('.entry-content').textContent, '笺文100');
    assert.equal(page.entries()[0].querySelector('.reply-toggle').textContent, '1 条回复 · 展开');
    assert.equal(page.element('guestbookWallStatus').textContent, '');
    assert.equal(page.element('guestbookLoadMore').disabled, false);
    assert.equal(page.writes.length, 1, '刷新不能重复投递');
  });

  test(`${kind}投递成功但刷新失败，保留旧列表和分页进度`, async () => {
    const page = await loadedPage();
    const previousEntries = page.entries();
    const composer = compose(page, kind);
    const operation = composer.submit();
    page.writes[0].resolve();
    await flush();
    assert.deepEqual(page.entries(), previousEntries, '刷新返回前不得清空旧列表');
    page.reads[1].reject(new Error('模拟刷新失败'));
    await operation;
    assert.deepEqual(page.entries(), previousEntries);
    assert.equal(composer.form.elements.content.value, '');
    assert.ok(composer.form.querySelectorAll('input, textarea, button')
      .every(control => !control.disabled));
    if (kind === 'reply') {
      assert.equal(composer.status.isConnected, true);
      assert.equal(composer.status.textContent, '');
      assert.equal(page.element('guestbookWallStatus').textContent, '回复已留，但笺集暂时未刷新。');
    } else {
      assert.equal(composer.status.textContent, '笺文已留，但笺集暂时未刷新。');
    }

    const paging = page.load();
    assert.equal(page.reads[2].offset, 20, '刷新失败不得重置分页偏移');
    page.reads[2].resolve({entries: makeEntries(1, 21)});
    assert.equal(await paging, true);
    assert.equal(page.entries().length, 21);
    assert.equal(page.writes.length, 1);
  });

  test(`${kind}投递失败保留输入，不触发列表刷新`, async () => {
    const page = await loadedPage();
    const composer = compose(page, kind);
    const operation = composer.submit();
    page.writes[0].reject(new Error('模拟投递失败'));
    await operation;
    assert.equal(composer.form.elements.content.value, ' 新笺文 ');
    assert.equal(composer.status.textContent, '模拟投递失败');
    assert.equal(page.reads.length, 1);
    assert.ok(composer.form.querySelectorAll('input, textarea, button')
      .every(control => !control.disabled));
  });
}

test('多个刷新请求依次执行，每个调用都等待自己的刷新结果', async () => {
  const page = await loadedPage();
  const paging = page.load();
  const firstReset = page.load({reset: true});
  const secondReset = page.load({reset: true});
  assert.equal(page.reads.length, 2);
  page.reads[1].resolve({entries: makeEntries(20, 21)});
  await paging;
  await flush();
  assert.equal(page.reads.length, 3);
  assert.equal(page.reads[2].offset, 0);
  page.reads[2].resolve({entries: makeEntries(20, 100)});
  assert.equal(await firstReset, true);
  await flush();
  assert.equal(page.reads.length, 4);
  assert.equal(page.reads[3].offset, 0);
  assert.equal(page.element('guestbookLoadMore').disabled, true);
  page.reads[3].resolve({entries: makeEntries(1, 200)});
  assert.equal(await secondReset, true);
  assert.equal(page.entries().length, 1);
  assert.equal(page.entries()[0].querySelector('.entry-content').textContent, '笺文200');
  assert.equal(page.element('guestbookLoadMore').disabled, false);
});

test('分页失败也会继续执行已排队的投笺后刷新', async () => {
  const page = await loadedPage();
  const paging = page.load();
  const composer = compose(page, 'entry');
  const operation = composer.submit();
  page.writes[0].resolve();
  await flush();
  page.reads[1].reject(new Error('模拟分页失败'));
  assert.equal(await paging, false);
  await flush();
  assert.equal(page.reads[2].offset, 0);
  page.reads[2].resolve({entries: makeEntries(1, 100)});
  await operation;
  assert.equal(composer.status.textContent, '笺文已留。');
  assert.equal(page.entries().length, 1);
  assert.equal(page.element('guestbookWallStatus').textContent, '');
});

test('刷新为空列表后显示唯一空态，后续刷新可恢复正常分页', async () => {
  const page = await loadedPage();
  let operation = page.load({reset: true});
  page.reads[1].resolve({entries: []});
  assert.equal(await operation, true);
  assert.equal(page.entries().length, 0);
  assert.equal(page.element('guestbookEntries').querySelectorAll('.empty-state').length, 1);
  assert.equal(await page.load(), false);

  operation = page.load({reset: true});
  page.reads[2].resolve({entries: makeEntries()});
  assert.equal(await operation, true);
  assert.equal(page.element('guestbookEntries').querySelectorAll('.empty-state').length, 0);
  const paging = page.load();
  assert.equal(page.reads[3].offset, 20);
  page.reads[3].resolve({entries: []});
  assert.equal(await paging, true);
});

test('其他用户新增笺文使分页重叠时，仅追加新 ID 且按返回条数推进偏移', async () => {
  const page = await loadedPage();
  const previousEntries = page.entries();
  const thread = previousEntries[19].querySelector('.reply-thread');
  thread.hidden = false;
  thread.querySelector('form').elements.content.value = '尚未投递的回复';

  const paging = page.load();
  assert.equal(page.reads[1].offset, 20);
  page.reads[1].resolve({entries: makeEntries(20, 20)});
  assert.equal(await paging, true);
  assert.equal(page.entries().length, 39);
  assert.deepEqual(page.entries().slice(0, 20), previousEntries);
  assert.equal(thread.hidden, false);
  assert.equal(thread.querySelector('form').elements.content.value, '尚未投递的回复');
  assert.equal(page.element('guestbookLoadMore').hidden, false);

  const nextPage = page.load();
  assert.equal(page.reads[2].offset, 40, '偏移按服务返回条数推进，而不是新增节点数');
  page.reads[2].resolve({entries: makeEntries(1, 40)});
  assert.equal(await nextPage, true);
  assert.equal(page.entries().length, 40);
  assert.equal(page.element('guestbookLoadMore').hidden, true);
});

test('整页都是已显示的 ID 时仍推进分页，同一响应内部也不重复显示', async () => {
  const page = await loadedPage();
  let operation = page.load();
  page.reads[1].resolve({entries: makeEntries()});
  assert.equal(await operation, true);
  assert.equal(page.entries().length, 20);
  assert.equal(page.element('guestbookLoadMore').hidden, false);

  operation = page.load();
  assert.equal(page.reads[2].offset, 40);
  const latest = makeEntries(1, 21)[0];
  page.reads[2].resolve({entries: [latest, latest]});
  assert.equal(await operation, true);
  assert.equal(page.entries().length, 21);
  assert.equal(page.entries()[20].querySelector('.entry-content').textContent, '笺文21');
});

test('刷新失败保留已显示 ID，刷新成功重新渲染相同 ID 的最新内容与回复', async () => {
  const page = await loadedPage();
  let operation = page.load({reset: true});
  page.reads[1].reject(new Error('模拟刷新失败'));
  assert.equal(await operation, false);

  operation = page.load();
  assert.equal(page.reads[2].offset, 20);
  page.reads[2].resolve({entries: makeEntries(20, 20)});
  assert.equal(await operation, true);
  assert.equal(page.entries().length, 39);

  operation = page.load({reset: true});
  const latest = makeEntries();
  latest[0].content = '刷新后的笺文';
  latest[0].replies = [{nickname: '来客', content: '新回复', created_at: '2026-10-01T12:01:00Z'}];
  page.reads[3].resolve({entries: latest});
  assert.equal(await operation, true);
  assert.equal(page.entries().length, 20);
  assert.equal(page.entries()[0].querySelector('.entry-content').textContent, '刷新后的笺文');
  assert.equal(page.entries()[0].querySelector('.reply-toggle').textContent, '1 条回复 · 展开');

  operation = page.load();
  assert.equal(page.reads[4].offset, 20);
  page.reads[4].resolve({entries: makeEntries(1, 21)});
  assert.equal(await operation, true);
  assert.equal(page.entries().length, 21, '刷新后已移除的 ID 必须能再次载入');
});

test('刷新为空集后清除去重记录，原 ID 再出现时正常显示', async () => {
  const page = await loadedPage();
  let operation = page.load({reset: true});
  page.reads[1].resolve({entries: []});
  assert.equal(await operation, true);
  operation = page.load({reset: true});
  page.reads[2].resolve({entries: makeEntries(1)});
  assert.equal(await operation, true);
  assert.equal(page.entries().length, 1);
  assert.equal(page.element('guestbookEntries').querySelectorAll('.empty-state').length, 0);
});
