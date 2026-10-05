// API 客户端
const API_CLIENT = window.MYHS_API_CLIENT;
if (!API_CLIENT) throw new Error('缺少 API 客户端');
const {
  ApiRequestError,
  fetchLunarData: fetchLunarDataRequest,
} = API_CLIENT;

// 起卦状态
const CAST_STATE_MODULE = window.MYHS_CAST_STATE;
if (!CAST_STATE_MODULE) throw new Error('缺少起卦状态模块');
const {CastStateMachine, MAX} = CAST_STATE_MODULE;
const castState = new CastStateMachine();

// 农历选择器
const LUNAR_PICKER_MODULE = window.MYHS_LUNAR_PICKER;
if (!LUNAR_PICKER_MODULE) throw new Error('缺少农历选择器模块');
const {LunarPicker} = LUNAR_PICKER_MODULE;

// 卦象渲染器
const HEXAGRAM_RENDERER_MODULE = window.MYHS_HEXAGRAM_RENDERER;
if (!HEXAGRAM_RENDERER_MODULE) throw new Error('缺少卦象渲染器模块');
const {HexagramRenderer, escapeHtml} = HEXAGRAM_RENDERER_MODULE;
const hexagramRenderer = new HexagramRenderer();

// 解卦结果
const JIE_GUA_RESULT_MODULE = window.MYHS_JIE_GUA_RESULT;
if (!JIE_GUA_RESULT_MODULE) throw new Error('缺少解卦结果模块');
const {JieGuaResult} = JIE_GUA_RESULT_MODULE;

// 动画与请求控制
const ANIMATIONS_MODULE = window.MYHS_CAST_ANIMATIONS;
if (!ANIMATIONS_MODULE) throw new Error('缺少起卦动画模块');
const {CastAnimations} = ANIMATIONS_MODULE;
const REQUEST_CONTROLLER_MODULE = window.MYHS_CAST_REQUEST_CONTROLLER;
if (!REQUEST_CONTROLLER_MODULE) throw new Error('缺少起卦请求控制模块');
const {CastRequestController} = REQUEST_CONTROLLER_MODULE;

// DOM 引用
const $ = id => document.getElementById(id);
const dom = {
  grid: $('numberGrid'),
  btnQiGua: $('btnQiGua'), btnJieGua: $('btnJieGua'), btnReset: $('btnReset'), btnSaveResult: $('btnSaveResult'),
  selectedNums: $('selectedNums'),
  castSummaryLine1: $('castSummaryLine1'), castSummaryLine2: $('castSummaryLine2'),
  question: $('question'), waiying: $('waiying'),
  hexPlaceholder: $('hexPlaceholder'), hexCols: $('hexCols'),
  resultPlaceholder: $('resultPlaceholder'), resultContent: $('resultContent'),
  resultStatus: $('resultStatus'), resultTools: $('resultTools'), statusNotice: $('statusNotice'),
  statusSpinner: $('statusSpinner'), statusReminder: $('statusReminder'),
  resultViewButtons: Array.from(document.querySelectorAll('[data-result-view]')),
  statusText: $('statusText'), statusDetail: $('statusDetail'),
  bgTemple: document.querySelector('.bg-temple'),
  leftCol: document.querySelector('.left-col'), rightCol: document.querySelector('.right-col'), lunarPanel: $('lunarPanel'),
  modeButtons: Array.from(document.querySelectorAll('[data-cast-mode]')),
  numberCastPanel: $('numberCastPanel'), randomCastPanel: $('randomCastPanel'),
  lunarCastPanel: $('lunarCastPanel'), customCastPanel: $('customCastPanel'),
  randomNumberGrid: $('randomNumberGrid'), randomNumber: $('randomNumber'),
  customShangOptions: $('customShangOptions'), customXiaOptions: $('customXiaOptions'),
  customDongOptions: $('customDongOptions'),
  lunarCastSource: $('lunarCastSource'), lunarCastError: $('lunarCastError'),
  lunarCastResult: $('lunarCastResult'),
  lunarShang: $('lunarShang'), lunarXia: $('lunarXia'), lunarDong: $('lunarDong'),
  lunarShangFormula: $('lunarShangFormula'), lunarXiaFormula: $('lunarXiaFormula'),
  lunarDongFormula: $('lunarDongFormula'),
  confirmModal: $('confirmModal'), confirmMessage: $('confirmMessage'), confirmOk: $('confirmOk'), confirmCancel: $('confirmCancel'),
};

const jieGuaResult = new JieGuaResult({
  document,
  dom: {
    resultViewButtons: dom.resultViewButtons,
    btnSaveResult: dom.btnSaveResult,
    resultTools: dom.resultTools,
    resultPlaceholder: dom.resultPlaceholder,
    resultContent: dom.resultContent,
    resultStatus: dom.resultStatus,
  },
  escapeHtml,
  onSyncLayout: () => requestAnimationFrame(syncRightColumnHeight),
});

const animations = new CastAnimations({
  dom: {
    randomCastPanel: dom.randomCastPanel,
    randomNumberGrid: dom.randomNumberGrid,
    randomNumber: dom.randomNumber,
    bgTemple: dom.bgTemple,
  },
  isRandomMode: () => castState.mode === 'random',
});
const requestController = new CastRequestController({
  dom,
  castState,
  jieGuaResult,
  hexagramRenderer,
  apiClient: API_CLIENT,
  animations,
  canCast,
  makeCastSnapshot,
  prepareLunarCast: prepareLunarCastFromPicker,
  pickRandomNumbers,
  onRefresh: refresh,
  onSyncInputLock: syncInputLock,
  onSyncLayout: () => requestAnimationFrame(syncRightColumnHeight),
});

// 农历起卦展示状态
let LUNAR_CAST = null;
let lunarCastRevealed = false;

const lunarPicker = new LunarPicker({
  document,
  dom: {
    hourScroll: $('hourScroll'),
    minuteScroll: $('minuteScroll'),
    calDays: $('calDays'),
    calMonthText: $('calMonthText'),
    calYearBtn: $('calYearBtn'),
    calYearDrop: $('calYearDrop'),
    calPrev: $('calPrev'),
    calNext: $('calNext'),
  },
  isLocked: () => castState.inputLocked,
  isLunarMode: () => castState.mode === 'lunar',
  isLunarCastRevealed: () => lunarCastRevealed,
  hasHexReady: () => castState.hexReady,
  onClearCastOutput: () => clearCastOutput(),
  onHideLunarCastResult: () => hideLunarCastResult(),
  onRefresh: () => refresh(),
  onSyncLayout: () => requestAnimationFrame(syncRightColumnHeight),
});

// 页面初始数据
function formatSolarDateTime(date) {
  return lunarPicker.formatSolarDateTime(date);
}

function fetchLunarData(date, {signal} = {}) {
  return fetchLunarDataRequest(formatSolarDateTime(date), {signal});
}

function readSolarDateTime() {
  return lunarPicker.readSolarDateTime();
}

fetchLunarData(new Date())
  .then(response => response.json())
  .then(data => { renderLunarPanel(data); requestAnimationFrame(syncRightColumnHeight); })
  .catch(error => {
    // 底部农历栏不是起卦前置条件，失败时保留页面主流程并记录原因。
    console.warn('初始农历数据加载失败', error.message);
  });

// 基础卦象数据
const JING_GUA = [
  {shu: 1, ming: '乾卦', xiang: '☰', wuXingClass: 'wu-xing-jin'},
  {shu: 2, ming: '兑卦', xiang: '☱', wuXingClass: 'wu-xing-jin'},
  {shu: 3, ming: '离卦', xiang: '☲', wuXingClass: 'wu-xing-huo'},
  {shu: 4, ming: '震卦', xiang: '☳', wuXingClass: 'wu-xing-mu'},
  {shu: 5, ming: '巽卦', xiang: '☴', wuXingClass: 'wu-xing-mu'},
  {shu: 6, ming: '坎卦', xiang: '☵', wuXingClass: 'wu-xing-shui'},
  {shu: 7, ming: '艮卦', xiang: '☶', wuXingClass: 'wu-xing-tu'},
  {shu: 8, ming: '坤卦', xiang: '☷', wuXingClass: 'wu-xing-tu'},
];
const DONG_YAO = [
  {shu: 1, ming: '初爻'},
  {shu: 2, ming: '二爻'},
  {shu: 3, ming: '三爻'},
  {shu: 4, ming: '四爻'},
  {shu: 5, ming: '五爻'},
  {shu: 6, ming: '上爻'},
];
// 自选数
// 生成 1–49 格子
for (let i = 1; i <= 49; i++) {
  const tile = Object.assign(document.createElement('div'), {className: 'number-tile', textContent: i});
  tile.dataset.value = i;
  tile.addEventListener('click', () => {
    if (castState.inputLocked || !castState.addNumber(i)) return;
    syncNumberTileStates();
    if (castState.hexReady) clearCastOutput();
    refresh();
  });
  dom.grid.appendChild(tile);
}
animations.renderRandomNumberGrid();
renderCustomCastOptions();

// 通用刷新与模式切换
function refresh() {
  renderCastSummary();
  renderActionButtons();
  requestAnimationFrame(syncRightColumnHeight);
}

function renderCastSummary() {
  if (castState.mode === 'lunar') {
    const lunarCast = updateLunarCastPanel();
    dom.castSummaryLine1.textContent = '';
    dom.castSummaryLine2.textContent = lunarCast ? '农时既得，卦数从之' : '公历择时，卦起农定';
    dom.selectedNums.textContent = lunarCast ? lunarCast.numbers.join(' ') : '';
  } else if (castState.mode === 'random') {
    dom.castSummaryLine1.textContent = '天运自转，数由天定';
    dom.castSummaryLine2.textContent = '三数既得，象从此生';
    dom.selectedNums.textContent = castState.randomPicked.join(' ');
  } else if (castState.mode === 'custom') {
    dom.castSummaryLine1.textContent = '上下卦由心，动爻随意定';
    dom.castSummaryLine2.textContent = '';
    dom.selectedNums.textContent = activeNumbers().join(' ');
  } else {
    dom.castSummaryLine1.textContent = '大衍之数五十，其用四十有九';
    dom.castSummaryLine2.textContent = '随心取数二三，以观其象所成';
    dom.selectedNums.textContent = castState.selected.join(' ');
  }
}

function renderActionButtons() {
  if (castState.isBusy) {
    dom.btnQiGua.disabled = true;
    dom.btnJieGua.style.display = castState.hexReady ? '' : 'none';
    dom.btnJieGua.disabled = true;
    return;
  }
  if (castState.resultsLocked) {
    dom.btnQiGua.disabled = true;
    dom.btnJieGua.style.display = castState.hexReady ? '' : 'none';
    dom.btnJieGua.disabled = true;
    return;
  }
  if (castState.hexReady) {
    dom.btnQiGua.disabled = true;
    dom.btnJieGua.style.display = '';
    dom.btnJieGua.disabled = !dom.question.value.trim();
    return;
  }
  if (castState.mode === 'random' && castState.randomCasting) {
    dom.btnQiGua.disabled = true;
    dom.btnJieGua.style.display = 'none';
    dom.btnJieGua.disabled = true;
    return;
  }
  dom.btnQiGua.disabled = !canCast();
  dom.btnJieGua.style.display = 'none';
  dom.btnJieGua.disabled = true;
}

async function setCastMode(mode) {
  if (!castState.setMode(mode)) return;
  dom.modeButtons.forEach(btn => btn.classList.toggle('active', btn.dataset.castMode === mode));
  dom.numberCastPanel.hidden = mode !== 'numbers';
  dom.randomCastPanel.hidden = mode !== 'random';
  dom.lunarCastPanel.hidden = mode !== 'lunar';
  dom.customCastPanel.hidden = mode !== 'custom';
  if (mode === 'lunar') lunarPicker.refreshNow();
  clearCastOutput();
  refresh();
}

// 输入锁定与输出清理
function syncInputLock() {
  const locked = castState.inputLocked;
  dom.question.disabled = locked;
  dom.waiying.disabled = locked;
  dom.modeButtons.forEach(btn => { btn.disabled = locked; });
  document.querySelectorAll('.number-tile').forEach(tile => {
    tile.classList.toggle('is-locked', locked);
    tile.setAttribute('aria-disabled', String(locked));
  });
  document.querySelectorAll('.custom-gua-btn, .custom-yao-btn').forEach(btn => {
    btn.disabled = locked;
  });
  renderActionButtons();
}

function showConfirm(message) {
  return new Promise(resolve => {
    dom.confirmMessage.textContent = message;
    dom.confirmModal.style.display = 'flex';
    dom.confirmOk.onclick = () => { dom.confirmModal.style.display = 'none'; resolve(true); };
    dom.confirmCancel.onclick = () => { dom.confirmModal.style.display = 'none'; resolve(false); };
  });
}

function clearCastOutput() {
  castState.setHexReady(false);
  dom.hexCols.style.display = 'none'; dom.hexCols.innerHTML = '';
  jieGuaResult.resetForCast();
  dom.hexPlaceholder.style.display = '';
  dom.hexPlaceholder.textContent = `${castModeName()}后，卦象显示于此`;
  dom.resultContent.style.display = 'none'; dom.resultContent.textContent = '';
  dom.resultPlaceholder.style.display = '';
  dom.resultPlaceholder.textContent = `${castModeName()}后，解卦结果显示于此`;
  dom.resultStatus.style.display = 'none';
  dom.statusNotice.hidden = true;
  dom.statusReminder.hidden = false;
  dom.statusSpinner.classList.add('active');
  dom.resultTools.style.display = 'none';
  dom.btnQiGua.style.display = '';
  renderActionButtons();
  if (castState.mode === 'random') resetRandomCast();
  else {
    castState.setRandomCasting(false);
    animations.stopRandomRoll();
  }
  if (castState.mode === 'lunar') hideLunarCastResult();
}

function castModeName() {
  return castState.modeName();
}

function makeCastSnapshot() {
  return castState.makeSnapshot({
    lunarCast: LUNAR_CAST,
    question: dom.question.value,
    waiYing: dom.waiying.value,
  });
}

function canCast() {
  return castState.canCast({
    hasLunarDate: Boolean(readSolarDateTime()),
    question: dom.question.value,
  });
}

function activeNumbers() {
  return castState.activeNumbers(LUNAR_CAST);
}

function syncNumberTileStates() {
  document.querySelectorAll('.number-tile').forEach(tile => {
    const value = Number(tile.dataset.value);
    const count = castState.selected.filter(n => n === value).length;
    tile.classList.toggle('selected', count > 0);
    tile.dataset.count = count > 1 ? String(count) : '';
  });
}

// 自定义起卦
function renderCustomCastOptions() {
  renderGuaOptions(dom.customShangOptions, 'shang');
  renderGuaOptions(dom.customXiaOptions, 'xia');
  renderDongYaoOptions();
}

function renderGuaOptions(container, role) {
  container.innerHTML = JING_GUA.map(gua => `<button type="button" class="custom-gua-btn" data-role="${role}" data-value="${gua.shu}">
    <span class="${gua.wuXingClass}">${gua.xiang}</span>
    <strong class="${gua.wuXingClass}">${gua.ming}</strong>
  </button>`).join('');
  container.querySelectorAll('.custom-gua-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      if (!castState.setCustomValue(role, Number(btn.dataset.value))) return;
      if (castState.hexReady) clearCastOutput();
      refreshCustomCastOptions();
      refresh();
    });
  });
}

function renderDongYaoOptions() {
  dom.customDongOptions.innerHTML = DONG_YAO.map(yao => `<button type="button" class="custom-yao-btn" data-value="${yao.shu}">
    ${yao.ming}
  </button>`).join('');
  dom.customDongOptions.querySelectorAll('.custom-yao-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      if (!castState.setCustomValue('dong', Number(btn.dataset.value))) return;
      if (castState.hexReady) clearCastOutput();
      refreshCustomCastOptions();
      refresh();
    });
  });
  refreshCustomCastOptions();
}

function refreshCustomCastOptions() {
  document.querySelectorAll('.custom-gua-btn').forEach(btn => {
    btn.classList.toggle('selected', castState.customCast[btn.dataset.role] === Number(btn.dataset.value));
  });
  document.querySelectorAll('.custom-yao-btn').forEach(btn => {
    btn.classList.toggle('selected', castState.customCast.dong === Number(btn.dataset.value));
  });
}

// 农历时：农历换算和起卦结果
function hideLunarCastResult() {
  lunarCastRevealed = false;
  LUNAR_CAST = null;
  dom.lunarCastResult.hidden = true;
  dom.lunarCastPanel.classList.remove('is-error');
  dom.lunarCastError.textContent = '';
}

function showLunarError(message) {
  lunarCastRevealed = false;
  LUNAR_CAST = null;
  dom.lunarCastResult.hidden = true;
  dom.lunarCastPanel.classList.add('is-error');
  dom.lunarCastError.textContent = message;
}

async function prepareLunarCastFromPicker(operation) {
  const date = readSolarDateTime();
  if (!date) {
    showLunarError('请选择有效的公历日期和时刻。');
    return false;
  }

  const requestedDateTime = formatSolarDateTime(date);
  const lunarDate = new Date(date);
  // 保留早子时规则：23:00 起按次日的农历日期换算。
  if (lunarDate.getHours() >= 23) lunarDate.setDate(lunarDate.getDate() + 1);
  try {
    const response = await fetchLunarData(lunarDate, {
      signal: operation.controller.signal,
    });
    const data = await response.json();
    const lunarCast = data.lunar_cast;
    const lunarNumbers = lunarCast?.numbers;
    const minuteShu = lunarCast?.minuteShu;
    if (!requestController.isActiveOperation(operation)) return false;
    const currentDateTime = formatSolarDateTime(readSolarDateTime());
    if (castState.mode !== 'lunar' || currentDateTime !== requestedDateTime) return false;
    if (
      !Array.isArray(lunarNumbers) ||
      lunarNumbers.length !== 3 ||
      !Number.isInteger(minuteShu)
    ) {
      throw new Error('农历起卦数据不完整');
    }
    LUNAR_CAST = lunarCast;
  } catch (error) {
    if (!requestController.isActiveOperation(operation)) return false;
    if (error instanceof ApiRequestError) {
      const errorStatus = requestController.requestErrorStatus(error);
      const message = errorStatus.statusDetail
        ? `${errorStatus.statusText}：${errorStatus.statusDetail}`
        : errorStatus.statusText;
      showLunarError(message);
    } else {
      showLunarError('农历换算失败，请检查网络连接后重试。');
    }
    return false;
  }

  lunarCastRevealed = true;
  lunarPicker.stopFollowingNow();
  updateLunarCastPanel();
  refresh();
  requestAnimationFrame(syncRightColumnHeight);
  return true;
}

// 底部农历栏
function renderLunarPanel(data) {
  const cols = dom.lunarPanel.querySelectorAll('.lunar-col');
  if (data.nong_li) {
    cols[0].querySelector('.lunar-top').textContent = data.nong_li.yue;
    cols[0].querySelector('.lunar-top').className = `lunar-top ${data.nong_li.yue_wu_xing_class}`;
    cols[0].querySelector('.lunar-bottom').textContent = data.nong_li.ri;
    cols[0].querySelector('.lunar-bottom').className = `lunar-bottom ${data.nong_li.ri_wu_xing_class}`;
  }
  if (data.jie_qi) {
    cols[1].querySelector('.lunar-top').textContent = data.jie_qi.shang || '--';
    cols[1].querySelector('.lunar-top').className = `lunar-top ${data.jie_qi.wu_xing_class || ''}`;
    cols[1].querySelector('.lunar-bottom').textContent = data.jie_qi.xia || '--';
    cols[1].querySelector('.lunar-bottom').className = `lunar-bottom ${data.jie_qi.wu_xing_class || ''}`;
  }
  if (data.gan_zhi) {
    data.gan_zhi.forEach((item, i) => {
      if (cols[i + 2]) {
        cols[i + 2].querySelector('.lunar-top').textContent = item.tian_gan;
        cols[i + 2].querySelector('.lunar-top').className = `lunar-top ${item.yin_class} ${item.tian_gan_wu_xing_class}`;
        cols[i + 2].querySelector('.lunar-bottom').textContent = item.di_zhi;
        cols[i + 2].querySelector('.lunar-bottom').className = `lunar-bottom ${item.yin_class} ${item.di_zhi_wu_xing_class}`;
      }
    });
  }
}

function updateLunarCastPanel() {
  if (!lunarCastRevealed) {
    dom.lunarCastResult.hidden = true;
    dom.lunarCastPanel.classList.remove('is-error');
    dom.lunarCastError.textContent = '';
    return null;
  }
  if (!LUNAR_CAST) {
    showLunarError('当前农历信息不足，暂时不能折算。');
    return null;
  }
  dom.lunarCastPanel.classList.remove('is-error');
  dom.lunarCastResult.hidden = false;
  const c = LUNAR_CAST;
  dom.lunarCastSource.textContent = c.display;
  dom.lunarShang.textContent = c.numbers[0];
  dom.lunarXia.textContent = c.numbers[1];
  dom.lunarDong.textContent = c.numbers[2];
  dom.lunarShangFormula.textContent = `${c.yearShu}+${c.monthShu}+${c.dayShu}`;
  dom.lunarXiaFormula.textContent = `${c.yearShu}+${c.monthShu}+${c.dayShu}+${c.hourShu}`;
  dom.lunarDongFormula.textContent = `${c.yearShu}+${c.monthShu}+${c.dayShu}+${c.hourShu}+${c.minuteShu}`;
  return c;
}

// 天选数：将动画选出的数字写入起卦状态
function resetRandomCast(resetCasting = true) {
  animations.stopRandomRoll();
  if (resetCasting) castState.setRandomCasting(false);
  castState.clearRandomNumbers();
  dom.randomNumber.textContent = '';
  animations.clearRandomTileState();
}

async function pickRandomNumbers(operation) {
  resetRandomCast(false);
  for (let i = 0; i < MAX; i++) {
    if (!requestController.isActiveOperation(operation)) return false;
    const value = await animations.startRandomRoll();
    if (value === null || !requestController.isActiveOperation(operation)) return false;
    animations.lightRandomTile(value, true);
    castState.addRandomNumber(value);
    refresh();
    if (i < MAX - 1) {
      const ready = await animations.waitBetweenRandomNumbers(operation.controller.signal);
      if (!ready) return false;
    }
  }
  return true;
}

// 布局同步
function syncRightColumnHeight() {
  if (window.matchMedia('(max-width: 860px)').matches) {
    dom.rightCol.style.height = '';
    return;
  }
  const rightTop = dom.rightCol.getBoundingClientRect().top;
  const lunarBottom = dom.leftCol.getBoundingClientRect().bottom;
  const height = Math.max(0, Math.round(lunarBottom - rightTop));
  dom.rightCol.style.height = height ? `${height}px` : '';
}

// 页面事件绑定
window.addEventListener('resize', () => requestAnimationFrame(syncRightColumnHeight));
window.addEventListener('load', () => {
  lunarPicker.refreshNow();
  requestAnimationFrame(syncRightColumnHeight);
});
window.addEventListener('focus', () => {
  lunarPicker.refreshNow();
  refresh();
});

dom.btnReset.addEventListener('click', async () => {
  if (requestController.jieGuaAnimating || dom.resultContent.style.display !== 'none') {
    if (!(await showConfirm('卦解存乎，重起即散。'))) return;
  }
  requestController.cancelActiveOperation();
  requestController.unlockCastControls();
  dom.question.value = '';
  dom.waiying.value = '';
  castState.clearSelected();
  syncNumberTileStates();
  if (castState.mode === 'lunar') lunarPicker.setToNow();
  clearCastOutput();
  refresh();
  requestAnimationFrame(syncRightColumnHeight);
});
dom.question.addEventListener('input', refresh);
dom.modeButtons.forEach(btn => btn.addEventListener('click', () => setCastMode(btn.dataset.castMode)));
// 初始化农历时控件
lunarPicker.initialize();

// 请求流程交由控制器协调
dom.btnQiGua.addEventListener('click', () => requestController.cast());
dom.btnJieGua.addEventListener('click', () => requestController.interpret());
