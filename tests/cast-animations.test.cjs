const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const {createDocument} = require('./helpers/dom.cjs');

function createAnimation({isRandomMode = true, reducedMotion = false, withBackground = true, cryptoValues} = {}) {
  const document = createDocument();
  const dom = {
    randomCastPanel: document.createElement('div'),
    randomNumberGrid: document.createElement('div'),
    randomNumber: document.createElement('div'),
    bgTemple: withBackground ? document.createElement('div') : null,
  };
  const properties = new Map();
  if (dom.bgTemple) {
    dom.bgTemple.style.setProperty = (name, value) => properties.set(name, value);
    dom.bgTemple.style.removeProperty = name => properties.delete(name);
  }
  Object.defineProperty(dom.randomNumberGrid, 'innerHTML', {
    set(html) {
      const tiles = [...html.matchAll(/data-value="(\d+)"/g)].map(match => {
        const tile = document.createElement('span');
        tile.className = 'random-number-tile';
        tile.dataset.value = match[1];
        return tile;
      });
      dom.randomNumberGrid.replaceChildren(...tiles);
    },
  });
  const timers = new Map();
  const frames = new Map();
  let now = 0;
  let nextHandle = 0;
  const context = vm.createContext({
    AbortController,
    performance: {now: () => now},
    setTimeout(callback, delay) {
      const handle = nextHandle++;
      timers.set(handle, {callback, delay});
      return handle;
    },
    clearTimeout: handle => timers.delete(handle),
    requestAnimationFrame(callback) {
      const handle = nextHandle++;
      frames.set(handle, callback);
      return handle;
    },
    cancelAnimationFrame: handle => frames.delete(handle),
    matchMedia: () => ({matches: reducedMotion}),
    crypto: {
      getRandomValues(values) {
        values[0] = cryptoValues?.shift() ?? 0;
        return values;
      },
    },
  });
  context.window = context;
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../cast-animations.js'), 'utf8'), context);
  const {CastAnimations, waitFor} = context.MYHS_CAST_ANIMATIONS;
  const animations = new CastAnimations({dom, isRandomMode: () => isRandomMode});
  animations.renderRandomNumberGrid();
  return {
    animations, dom, properties, timers, frames, waitFor, context,
    runTimer() {
      const [handle, {callback, delay}] = timers.entries().next().value;
      timers.delete(handle);
      now += delay;
      callback();
    },
    advanceFrame(time) {
      now = time;
      const callbacks = [...frames.values()];
      frames.clear();
      callbacks.forEach(callback => callback(now));
    },
  };
}

test('随机滚动保留 49 个格子、20–28 步和最终数字的高亮', async () => {
  const fixture = createAnimation();
  const {animations, dom, timers} = fixture;
  assert.equal(dom.randomNumberGrid.children.length, 49);
  const rolling = animations.startRandomRoll();
  assert.equal(dom.randomNumber.textContent, 1);
  assert.equal(dom.randomCastPanel.classList.contains('is-rolling'), true);
  let steps = 1;
  while (timers.size) {
    fixture.runTimer();
    steps++;
  }
  assert.equal(steps, 20);
  assert.equal(await rolling, 1);
  assert.equal(dom.randomCastPanel.classList.contains('is-rolling'), false);
  animations.lightRandomTile(1, true);
  const tiles = dom.randomNumberGrid.children;
  assert.equal(tiles[0].classList.contains('is-final'), true);
  assert.ok(tiles.every(tile => !tile.classList.contains('is-lit')));
  animations.clearRandomTileState();
  assert.ok(tiles.every(tile => !tile.classList.contains('is-final')));
});

test('随机数拒绝超出均匀采样范围的值，仍可取到边界 49', async () => {
  // 第一项用于步数；第二项被拒绝，第三项应被映射为 49。
  const fixture = createAnimation({cryptoValues: [0, 0xffffffff, 48]});
  const rolling = fixture.animations.startRandomRoll();
  assert.equal(fixture.dom.randomNumber.textContent, 49);
  fixture.animations.stopRandomRoll();
  assert.equal(await rolling, null);
  assert.equal(fixture.timers.size, 0);
});

test('重复开始会结束旧滚动，停止会清理计时器并结束等待，非随机模式不启动', async () => {
  const fixture = createAnimation();
  const first = fixture.animations.startRandomRoll();
  const second = fixture.animations.startRandomRoll();
  assert.equal(await first, null);
  assert.equal(fixture.timers.size, 1);
  fixture.animations.stopRandomRoll();
  fixture.animations.stopRandomRoll();
  assert.equal(await second, null);
  assert.equal(fixture.timers.size, 0);
  assert.equal(fixture.dom.randomCastPanel.classList.contains('is-rolling'), false);
  const otherMode = createAnimation({isRandomMode: false});
  assert.equal(await otherMode.animations.startRandomRoll(), null);
  assert.equal(otherMode.timers.size, 0);
});

test('没有 crypto 时沿用 Math.random 回退，数字仍在 1–49 范围内', async () => {
  const fixture = createAnimation();
  fixture.context.crypto = null;
  vm.runInContext('Math.random = () => 0.999999', fixture.context);
  const rolling = fixture.animations.startRandomRoll();
  let steps = 1;
  while (fixture.timers.size) {
    fixture.runTimer();
    steps++;
  }
  assert.equal(steps, 28);
  assert.equal(await rolling, 49);
});

test('可取消等待：正常、提前取消、等待中取消均结束，随机间隔也使用同一机制', async () => {
  const fixture = createAnimation();
  const completed = fixture.waitFor(100);
  fixture.runTimer();
  assert.equal(await completed, true);
  const controller = new AbortController();
  const waiting = fixture.waitFor(100, controller.signal);
  controller.abort();
  assert.equal(await waiting, false);
  assert.equal(await fixture.waitFor(100, controller.signal), false);
  assert.equal(fixture.timers.size, 0);
  const pauseController = new AbortController();
  const pause = fixture.animations.waitBetweenRandomNumbers(pauseController.signal);
  assert.equal([...fixture.timers.values()][0].delay, 760);
  pauseController.abort();
  assert.equal(await pause, false);
  assert.equal(fixture.timers.size, 0);
});

test('背景按原速度旋转，收尾转完当前一圈后移除旋转属性和帧任务', async () => {
  const fixture = createAnimation();
  fixture.animations.startDiviningBackground();
  fixture.advanceFrame(100);
  assert.equal(fixture.properties.get('--bg-rotation'), '43deg');
  const settled = fixture.animations.settleDiviningBackground();
  fixture.advanceFrame(100 + (360 - 43) / 0.43 / 2);
  assert.equal(fixture.properties.get('--bg-rotation'), '201.5deg');
  fixture.advanceFrame(1000);
  await settled;
  assert.equal(fixture.properties.has('--bg-rotation'), false);
  assert.equal(fixture.frames.size, 0);
});

test('背景收尾被取消或被新动画替代时结束旧等待，旧帧不能污染新动画', async () => {
  const fixture = createAnimation();
  fixture.animations.startDiviningBackground();
  fixture.advanceFrame(100);
  const settled = fixture.animations.settleDiviningBackground();
  const oldFrame = [...fixture.frames.values()][0];
  fixture.animations.startDiviningBackground();
  await settled;
  oldFrame(1000);
  assert.equal(fixture.properties.has('--bg-rotation'), false);
  fixture.advanceFrame(200);
  assert.equal(fixture.properties.get('--bg-rotation'), '43deg');
  const cancelled = fixture.animations.settleDiviningBackground();
  fixture.animations.stopDiviningBackground();
  fixture.animations.stopDiviningBackground();
  await cancelled;
  assert.equal(fixture.properties.has('--bg-rotation'), false);
  assert.equal(fixture.frames.size, 0);
});

test('减少动态效果、没有背景、尚未旋转的收尾均不创建额外帧任务', async () => {
  for (const options of [{reducedMotion: true}, {withBackground: false}, {}]) {
    const fixture = createAnimation(options);
    if (options.reducedMotion || options.withBackground === false) {
      fixture.animations.startDiviningBackground();
    }
    await fixture.animations.settleDiviningBackground();
    assert.equal(fixture.frames.size, 0);
    assert.equal(fixture.properties.size, 0);
  }
});
