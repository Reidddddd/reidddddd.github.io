const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const {createDocument} = require('./helpers/dom.cjs');
const {createPage} = require('./helpers/homepage.cjs');

const frontendRoot = path.resolve(__dirname, '..');

function createTimeScroll(document) {
  const scroll = document.createElement('div');
  const counters = {queries: 0, geometryReads: 0, classUpdates: 0};
  const geometry = {padding: 30, height: 29, hidden: false};
  const querySelectorAll = scroll.querySelectorAll.bind(scroll);
  scroll.scrollTop = 0;
  scroll.clientHeight = 90;
  scroll.querySelectorAll = selector => {
    counters.queries++;
    return querySelectorAll(selector);
  };
  scroll.querySelector = selector => {
    counters.queries++;
    const match = selector.match(/^\[data-cycle="(\d+)"\]\[data-value="(\d+)"\]$/);
    if (match) {
      return scroll.children.find(item => item.dataset.cycle === match[1] && item.dataset.value === match[2]);
    }
    return querySelectorAll(selector)[0] || null;
  };
  Object.defineProperty(scroll, 'innerHTML', {
    set(html) {
      scroll.replaceChildren();
      for (const match of html.matchAll(/data-cycle="(\d+)" data-value="(\d+)">([^<]*)<\/div>/g)) {
        const item = document.createElement('div');
        const index = scroll.children.length;
        item.className = 'time-item';
        item.dataset = {cycle: match[1], value: match[2]};
        item.textContent = match[3];
        Object.defineProperties(item, {
          offsetTop: {get() {
            counters.geometryReads++;
            return geometry.hidden ? 0 : Math.round(geometry.padding + index * geometry.height);
          }},
          offsetHeight: {get() {
            counters.geometryReads++;
            return geometry.hidden ? 0 : Math.round(geometry.height);
          }},
        });
        const toggle = item.classList.toggle;
        item.classList.toggle = (...args) => {
          counters.classUpdates++;
          return toggle(...args);
        };
        scroll.append(item);
      }
    },
  });
  return {scroll, counters, geometry};
}

function createPicker() {
  const document = createDocument();
  document.addEventListener = () => {};
  const hour = createTimeScroll(document);
  const minute = createTimeScroll(document);
  const frames = [];
  const clock = {value: new Date(2026, 0, 31, 12, 5)};
  let locked = false;
  let revealed = false;
  let hexReady = false;
  let lunarMode = true;
  const callbacks = [];
  class ClockDate extends Date {
    constructor(...args) {
      if (args.length) super(...args);
      else super(clock.value.getTime());
    }
  }
  const context = vm.createContext({
    Date: ClockDate,
    requestAnimationFrame: callback => frames.push(callback),
  });
  context.window = context;
  vm.runInContext(fs.readFileSync(path.join(frontendRoot, 'lunar-picker.js'), 'utf8'), context);
  const picker = new context.MYHS_LUNAR_PICKER.LunarPicker({
    document,
    dom: {
      hourScroll: hour.scroll,
      minuteScroll: minute.scroll,
      calPrev: document.createElement('button'),
      calNext: document.createElement('button'),
      calYearBtn: document.createElement('button'),
      calYearDrop: document.createElement('div'),
      calMonthText: document.createElement('span'),
      calDays: document.createElement('div'),
    },
    isLocked: () => locked,
    isLunarMode: () => lunarMode,
    isLunarCastRevealed: () => revealed,
    hasHexReady: () => hexReady,
    onClearCastOutput() { callbacks.push('clear'); hexReady = false; revealed = false; },
    onHideLunarCastResult() { callbacks.push('hide'); revealed = false; },
    onRefresh() { callbacks.push('refresh'); },
    onSyncLayout() { callbacks.push('layout'); },
  });
  const flushFrames = () => {
    while (frames.length) frames.shift()();
  };
  picker.initialize();
  flushFrames();
  callbacks.length = 0;
  return {
    picker, hour, minute, clock, flushFrames, callbacks,
    setLocked: value => { locked = value; },
    setRevealed: value => { revealed = value; },
    setHexReady: value => { hexReady = value; },
    setLunarMode: value => { lunarMode = value; },
  };
}

function resetCounters(column) {
  Object.keys(column.counters).forEach(key => { column.counters[key] = 0; });
}

function selectItem(column, index) {
  const item = column.scroll.children[index];
  column.scroll.scrollTop = item.offsetTop + item.offsetHeight / 2 - column.scroll.clientHeight / 2;
}

function scanClosest(scroll) {
  const center = scroll.scrollTop + scroll.clientHeight / 2;
  let closest = scroll.children[0];
  let distance = Infinity;
  for (const item of scroll.children) {
    const currentDistance = Math.abs(item.offsetTop + item.offsetHeight / 2 - center);
    if (currentDistance < distance) {
      closest = item;
      distance = currentDistance;
    }
  }
  return {value: Number(closest.dataset.value), cycle: Number(closest.dataset.cycle)};
}

function assertClosest(picker, column) {
  const expected = scanClosest(column.scroll);
  assert.deepEqual({...picker.closestTimeItem(column.scroll)}, expected);
}

function assertActive(column, value) {
  const active = column.scroll.children.filter(item => item.classList.contains('is-active'));
  assert.equal(active.length, 5);
  assert.ok(active.every(item => Number(item.dataset.value) === value));
}

test('滚轮初始化仍生成五轮时分，并居中选中当前时间', () => {
  const {picker, hour, minute} = createPicker();
  assert.equal(hour.scroll.children.length, 120);
  assert.equal(minute.scroll.children.length, 300);
  assert.equal(hour.scroll.children[0].textContent, '00');
  assert.equal(minute.scroll.children[299].textContent, '59');
  assert.deepEqual({...picker.closestTimeItem(hour.scroll)}, {value: 12, cycle: 2});
  assert.deepEqual({...picker.closestTimeItem(minute.scroll)}, {value: 5, cycle: 2});
  assertActive(hour, 12);
  assertActive(minute, 5);
});

test('农历起卦后改变小时或分钟，清除旧结果并刷新操作按钮与布局', () => {
  for (const [which, count, value] of [['hour', 24, 21], ['minute', 60, 10]]) {
    const page = createPicker();
    page.setHexReady(true);
    page.setRevealed(true);
    selectItem(page[which], 2 * count + value);
    page[which].scroll.events.get('scroll')();
    assert.deepEqual(page.callbacks, ['clear', 'refresh', 'layout']);
    assert.equal(page.picker.hasHexReady(), false);
    assert.equal(page.picker.isLunarCastRevealed(), false);
    assert.equal(page.picker.readSolarDateTime().getDate(), 31);
  }
});

test('没有卦象时调整时间仍清除旧农历换算结果', () => {
  const page = createPicker();
  page.setRevealed(true);
  selectItem(page.minute, 2 * 60 + 10);
  page.minute.scroll.events.get('scroll')();
  assert.deepEqual(page.callbacks, ['hide', 'refresh', 'layout']);
  assert.equal(page.picker.isLunarCastRevealed(), false);
});

test('时间变更调用主页实际回调，清空农历缓存并要求重新起卦', async () => {
  const page = createPage();
  page.element('question').value = '此事如何';
  page.selectMode('lunar');
  await page.click('btnQiGua');
  assert.equal(page.element('btnJieGua').disabled, false);
  assert.notEqual(vm.runInContext('LUNAR_CAST', page.context), null);

  const {picker, minute} = createPicker();
  const options = vm.runInContext('lunarPicker.options', page.context);
  for (const name of ['isLocked', 'isLunarMode', 'hasHexReady', 'onClearCastOutput',
    'onHideLunarCastResult', 'onRefresh', 'onSyncLayout']) {
    picker[name] = options[name];
  }
  selectItem(minute, 2 * 60 + 10);
  minute.scroll.events.get('scroll')();

  assert.equal(vm.runInContext('LUNAR_CAST', page.context), null);
  assert.equal(vm.runInContext('castState.hexReady', page.context), false);
  assert.equal(page.element('hexCols').style.display, 'none');
  assert.equal(page.element('lunarCastResult').hidden, true);
  assert.equal(page.element('btnJieGua').disabled, true);
  assert.equal(page.element('btnQiGua').disabled, false);
});

test('相同时间、循环复位、程序定位和锁定滚动均不清除结果', () => {
  const page = createPicker();
  page.setHexReady(true);
  page.setRevealed(true);
  page.hour.scroll.events.get('scroll')();
  selectItem(page.hour, 12);
  page.hour.scroll.events.get('scroll')();
  page.hour.scroll.events.get('scroll')();
  page.flushFrames();
  page.hour.scroll.events.get('scroll')();

  page.picker.setTimeScrollTo(12, 5);
  page.minute.scroll.events.get('scroll')();
  page.flushFrames();
  page.minute.scroll.events.get('scroll')();

  page.setLocked(true);
  selectItem(page.hour, 2 * 24 + 21);
  page.hour.scroll.events.get('scroll')();
  page.flushFrames();
  assert.deepEqual(page.callbacks, []);
  assert.equal(page.picker.hasHexReady(), true);
  assert.equal(page.picker.isLunarCastRevealed(), true);
});

test('非农历模式调整时间不清除其它起卦模式的结果', () => {
  const page = createPicker();
  page.setLunarMode(false);
  page.setHexReady(true);
  selectItem(page.hour, 2 * 24 + 21);
  page.hour.scroll.events.get('scroll')();
  assert.deepEqual(page.callbacks, []);
  assert.equal(page.picker.hasHexReady(), true);
});

test('所有循环位置、相邻边界和滚动范围外的选中项与原线性扫描一致', () => {
  const {picker, hour, minute} = createPicker();
  for (const column of [hour, minute]) {
    const items = column.scroll.children;
    for (let index = 0; index < items.length; index++) {
      const center = items[index].offsetTop + items[index].offsetHeight / 2;
      const next = items[index + 1];
      const centers = [center, center - 0.25, center + 0.25];
      if (next) {
        const boundary = (center + next.offsetTop + next.offsetHeight / 2) / 2;
        centers.push(boundary, boundary - 0.01, boundary + 0.01);
      }
      for (const position of centers) {
        column.scroll.scrollTop = position - column.scroll.clientHeight / 2;
        assertClosest(picker, column);
      }
    }
    for (const position of [-100, 100000]) {
      column.scroll.scrollTop = position;
      assertClosest(picker, column);
    }
  }
});

test('重复滚动不重新查询节点，只更新变化列的新旧值高亮', () => {
  const {picker, hour, minute} = createPicker();
  selectItem(minute, 2 * 60 + 17);
  resetCounters(hour);
  resetCounters(minute);
  minute.scroll.events.get('scroll')();
  assert.equal(picker.lunarPickerMinute, 17);
  assert.equal(hour.counters.queries + minute.counters.queries, 0);
  assert.equal(hour.counters.classUpdates, 0);
  assert.equal(minute.counters.classUpdates, 10);
  assert.ok(minute.counters.geometryReads <= 25, '选中项不应读取整列布局');
  assertActive(hour, 12);
  assertActive(minute, 17);

  resetCounters(hour);
  resetCounters(minute);
  minute.scroll.events.get('scroll')();
  assert.equal(hour.counters.queries + minute.counters.queries, 0);
  assert.equal(hour.counters.classUpdates + minute.counters.classUpdates, 0);
});

test('小时与分钟跨首尾循环时仍回到中间轮，保持原值并忽略程序滚动', () => {
  const page = createPicker();
  for (const [which, column, count] of [['hour', page.hour, 24], ['minute', page.minute, 60]]) {
    for (const [cycle, value] of [[0, 0], [0, count - 1], [4, 0], [4, count - 1]]) {
      selectItem(column, cycle * count + value);
      column.scroll.events.get('scroll')();
      assert.deepEqual({...page.picker.closestTimeItem(column.scroll)}, {value, cycle: 2});
      assert.equal(which === 'hour' ? page.picker.lunarPickerHour : page.picker.lunarPickerMinute, value);
      assertActive(column, value);
      assert.equal(page.picker.timeScrollBusy, true);
      const date = page.picker.readSolarDateTime().getTime();
      column.scroll.events.get('scroll')();
      assert.equal(page.picker.readSolarDateTime().getTime(), date);
      page.flushFrames();
      assert.equal(page.picker.timeScrollBusy, false);
    }
  }
});

test('锁定时滚动复位且不修改日期、时间或跟随状态', () => {
  const page = createPicker();
  const before = page.picker.readSolarDateTime().getTime();
  page.setLocked(true);
  selectItem(page.hour, 2 * 24 + 21);
  page.hour.scroll.events.get('scroll')();
  assert.equal(page.picker.readSolarDateTime().getTime(), before);
  assert.equal(page.picker.lunarPickerFollowsNow, true);
  assert.deepEqual({...page.picker.closestTimeItem(page.hour.scroll)}, {value: 12, cycle: 2});
  assertActive(page.hour, 12);
  page.flushFrames();
});

test('浏览其它月份再调时分仍保留已选日期', () => {
  const cases = [
    {selected: [2026, 0, 31], displayed: [2026, 1]},
    {selected: [2024, 1, 29], displayed: [2025, 1]},
    {selected: [2026, 11, 31], displayed: [2027, 0]},
    {selected: [2026, 8, 16], displayed: [2026, 8]},
  ];
  for (const {selected, displayed} of cases) {
    const page = createPicker();
    page.picker.lunarPickerDate = new Date(...selected, 12, 5);
    [page.picker.calendarYear, page.picker.calendarMonth] = displayed;
    selectItem(page.hour, 2 * 24 + 21);
    page.hour.scroll.events.get('scroll')();
    selectItem(page.minute, 2 * 60 + 10);
    page.minute.scroll.events.get('scroll')();
    const date = page.picker.readSolarDateTime();
    assert.deepEqual([date.getFullYear(), date.getMonth(), date.getDate(), date.getHours(), date.getMinutes()],
      [...selected, 21, 10]);
    assert.deepEqual([page.picker.calendarYear, page.picker.calendarMonth], displayed);
    assert.equal(page.picker.lunarPickerFollowsNow, false);
  }
});

test('缓存节点不冻结布局，字体和窗口尺寸变化后仍正确定位', () => {
  const {picker, hour, minute, flushFrames} = createPicker();
  for (const column of [hour, minute]) {
    column.geometry.height = 36.7;
    column.geometry.padding = 42.5;
    column.scroll.clientHeight = 130;
    for (const index of [0, 30, 75, column.scroll.children.length - 1]) {
      selectItem(column, index);
      assertClosest(picker, column);
    }
  }
  picker.setTimeScrollTo(3, 58);
  flushFrames();
  assert.deepEqual({...picker.closestTimeItem(hour.scroll)}, {value: 3, cycle: 2});
  assert.deepEqual({...picker.closestTimeItem(minute.scroll)}, {value: 58, cycle: 2});
});

test('跟随当前时间、手动停止跟随及重置行为不变', () => {
  const page = createPicker();
  page.clock.value = new Date(2026, 1, 1, 8, 42);
  page.picker.refreshNow();
  page.flushFrames();
  assert.equal(page.picker.readSolarDateTime().getTime(), page.clock.value.getTime());
  assertActive(page.hour, 8);
  assertActive(page.minute, 42);

  selectItem(page.minute, 2 * 60 + 15);
  page.minute.scroll.events.get('scroll')();
  const selected = page.picker.readSolarDateTime().getTime();
  page.clock.value = new Date(2026, 1, 2, 9, 20);
  page.picker.refreshNow();
  assert.equal(page.picker.readSolarDateTime().getTime(), selected);

  page.picker.setToNow();
  page.flushFrames();
  assert.equal(page.picker.readSolarDateTime().getTime(), page.clock.value.getTime());
  assert.equal(page.picker.lunarPickerFollowsNow, true);
  assertActive(page.hour, 9);
  assertActive(page.minute, 20);

  page.setRevealed(true);
  page.clock.value = new Date(2026, 1, 3, 10, 21);
  page.picker.refreshNow();
  assert.equal(page.picker.readSolarDateTime().getDate(), 2);
});

test('隐藏列保留定位回退，恢复可见后使用实时尺寸', () => {
  const {picker, hour, minute, flushFrames} = createPicker();
  for (const column of [hour, minute]) {
    column.geometry.hidden = true;
    column.scroll.clientHeight = 0;
  }
  picker.setTimeScrollTo(4, 55);
  flushFrames();
  assert.equal(hour.scroll.scrollTop, 0);
  assert.equal(minute.scroll.scrollTop, 0);
  assertClosest(picker, hour);
  assertClosest(picker, minute);
  for (const column of [hour, minute]) {
    column.geometry.hidden = false;
    column.scroll.clientHeight = 90;
  }
  picker.setTimeScrollTo(4, 55);
  flushFrames();
  assert.deepEqual({...picker.closestTimeItem(hour.scroll)}, {value: 4, cycle: 2});
  assert.deepEqual({...picker.closestTimeItem(minute.scroll)}, {value: 55, cycle: 2});
});

test('重建滚轮后不复用旧节点或旧高亮值，空列仍使用原默认值', () => {
  const {picker, hour, minute, flushFrames} = createPicker();
  const oldItem = minute.scroll.children[125];
  picker.buildTimeScrolls();
  picker.setTimeScrollTo(12, 5);
  flushFrames();
  assert.equal(oldItem.parentNode, null);
  assertActive(hour, 12);
  assertActive(minute, 5);
  const empty = createDocument().createElement('div');
  empty.scrollTop = 0;
  empty.clientHeight = 0;
  assert.deepEqual({...picker.closestTimeItem(empty)}, {value: 0, cycle: 2});
});
