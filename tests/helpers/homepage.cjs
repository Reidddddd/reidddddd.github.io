const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {createDocument} = require('./dom.cjs');

const frontendRoot = path.resolve(__dirname, '../..');

function createPage({
  manualRequests = false, isMobile = true, fetchLunarData,
  withBackground = false, reducedMotion = true,
} = {}) {
  const document = createDocument();
  const element = id => document.getElementById(id);
  element('resultContent').style.display = 'none';
  element('resultTools').style.display = 'none';
  element('hexCols').style.display = 'none';
  const modeButtons = ['numbers', 'random', 'lunar', 'custom'].map(mode => {
    const button = document.createElement('button');
    button.dataset.castMode = mode;
    return button;
  });
  const resultViewButtons = ['guwen', 'baihua', 'yili'].map(view => {
    const button = document.createElement('button');
    button.dataset.resultView = view;
    return button;
  });
  const layout = {rightTop: 180, leftBottom: 570};
  const rotation = new Map();
  const background = withBackground ? element('background') : null;
  if (background) {
    background.style.setProperty = (name, value) => rotation.set(name, value);
    background.style.removeProperty = name => rotation.delete(name);
  }
  const leftCol = element('leftCol');
  const rightCol = element('rightCol');
  leftCol.getBoundingClientRect = () => ({bottom: layout.leftBottom});
  rightCol.getBoundingClientRect = () => ({top: layout.rightTop});
  const querySelectorAll = document.querySelectorAll;
  document.querySelectorAll = selector => {
    if (selector === '[data-cast-mode]') return modeButtons;
    if (selector === '[data-result-view]') return resultViewButtons;
    return querySelectorAll(selector);
  };
  const querySelector = document.querySelector;
  document.querySelector = selector => {
    if (selector === '.left-col') return leftCol;
    if (selector === '.right-col') return rightCol;
    if (selector === '.bg-temple') return background;
    return querySelector(selector);
  };
  const gua = {
    label: '本卦', name: '乾卦', sym_shang: '☰', sym_xia: '☰',
    color_shang: '#8b2500', color_xia: '#8b2500',
    zhou_yi: {gua_ci: '元亨利贞。', tuan_zhuan: '大哉乾元。', xiang_zhuan: '天行健。', yao_ci: []},
  };
  const requests = [];
  const frames = new Map();
  const windowEvents = new Map();
  let nextFrame = 0;
  let frameTime = 0;
  let finishRequest;
  const context = vm.createContext({
    document, console, AbortController,
    performance: {now: () => frameTime},
    // 缩短纯展示延迟；保留异步时序和取消机制。
    setTimeout: callback => setTimeout(callback, 0),
    clearTimeout,
    requestAnimationFrame(callback) {
      const frame = ++nextFrame;
      frames.set(frame, callback);
      return frame;
    },
    cancelAnimationFrame: frame => frames.delete(frame),
    matchMedia: query => ({matches: query.includes('max-width') ? isMobile : reducedMotion}),
    addEventListener: (type, callback) => windowEvents.set(type, callback),
    crypto: {getRandomValues: values => values.fill(0)},
    MYHS_API_CLIENT: {
      API_ERROR_KIND: {
        RATE_LIMIT: 'rate_limit', HTTP: 'http', SSE: 'sse', NETWORK: 'network',
        DISCONNECT: 'disconnect', CONTRACT: 'contract', CANCELLED: 'cancelled',
      },
      ApiRequestError: class extends Error {
        constructor(errorKind, message, status = null) {
          super(message);
          this.errorKind = errorKind;
          this.status = status;
        }
      },
      fetchLunarData: fetchLunarData || (async () => {
        return {json: async () => ({lunar_cast: {numbers: [2, 5, 1], minuteShu: 10}})};
      }),
      async runSSERequest(requestPath, requestBody, handleEvent, {signal}) {
        const request = {
          path: requestPath, body: JSON.parse(requestBody), signal,
          emit: (event, data) => handleEvent(event, JSON.stringify(data)),
        };
        requests.push(request);
        if (manualRequests) {
          // 不自动响应 abort，以便确认页面会忽略迟到的旧事件和旧 finally。
          await new Promise((resolve, reject) => {
            request.resolve = resolve;
            request.reject = reject;
          });
          return;
        }
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
      refreshNow() {}
      setToNow() {}
    }},
  });
  context.window = context;
  // 按真实加载顺序运行模块，网络和日期选择器由夹具替代。
  const pageHtml = fs.readFileSync(path.join(frontendRoot, 'index.html'), 'utf8');
  const files = [...pageHtml.matchAll(/<script src="([^"]+)"><\/script>/g)]
    .map(match => match[1])
    .filter(file => !['api-config.js', 'api-client.js', 'lunar-picker.js'].includes(file));
  for (const file of files) {
    vm.runInContext(fs.readFileSync(path.join(frontendRoot, file), 'utf8'), context, {filename: file});
  }

  return {
    context,
    requests,
    gua,
    layout,
    rotation,
    modeButtons,
    resultViewButtons,
    element,
    click: id => element(id).events.get('click')(),
    selectMode: mode => modeButtons.find(button => button.dataset.castMode === mode).events.get('click')(),
    flushFrames(time = frameTime) {
      frameTime = time;
      const callbacks = [...frames.values()];
      frames.clear();
      callbacks.forEach(callback => callback(frameTime));
    },
    windowEvent: type => windowEvents.get(type)(),
    finishRequest: error => finishRequest(error),
    savedHtml: () => vm.runInContext('jieGuaResult.buildSavedResultHtml()', context),
  };
}

module.exports = {createPage};
