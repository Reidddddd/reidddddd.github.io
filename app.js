// API 客户端
const API_CLIENT = window.MYHS_API_CLIENT;
if (!API_CLIENT) throw new Error('缺少 API 客户端');
const {
  API_ERROR_KIND,
  ApiRequestError,
  fetchLunarData: fetchLunarDataRequest,
  runSSERequest,
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

  // 页面交互状态
  let randomTimer = null;
  let randomTiles = [];
  let diviningBgFrame = null;
  let diviningBgAngle = 0;
  let diviningBgLastTime = 0;
  let jieGuaAnimating = false;
  let jieGuaFinishPromise = null;
  let activeOperation = null;
  let randomRollCancel = null;
  let diviningBgSettleCancel = null;
  const DIVINING_BG_SPEED = 0.43;
  const RESULT_REVEAL_DELAY = 1000;
  let LUNAR_CAST = null;
  let lunarCastRevealed = false;
  // 天选数动画参数
  const RANDOM_ROLL = {
    minSteps: 20,
    maxSteps: 28,
    baseDelay: 26,
    slowDelay: 335,
    jitterMin: -10,
    jitterMax: 24,
    pauseMin: 760,
    pauseMax: 960,
  };

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
      if (castState.inputLocked) return;
      castState.addNumber(i);
      syncNumberTileStates();
      if (castState.hexReady) clearCastOutput();
      refresh();
    });
    dom.grid.appendChild(tile);
  }
  renderRandomNumberGrid();
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
      dom.btnJieGua.disabled = false;
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

  // 操作生命周期与输入锁定
  function lockCastControls() {
    castState.lock();
    syncInputLock();
  }

  function unlockCastControls() {
    castState.unlock();
    syncInputLock();
  }

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

  function beginOperation() {
    cancelActiveOperation();
    const operation = {controller: new AbortController()};
    activeOperation = operation;
    castState.setBusy(true);
    syncInputLock();
    return operation;
  }

  function isActiveOperation(operation) {
    return activeOperation === operation;
  }

  function finishOperation(operation) {
    if (!isActiveOperation(operation)) return;
    activeOperation = null;
    castState.setBusy(false);
    syncInputLock();
  }

  function cancelActiveOperation() {
    const operation = activeOperation;
    activeOperation = null;
    if (operation) operation.controller.abort();
    stopRandomRoll();
    stopDiviningBackground();
    jieGuaAnimating = false;
    castState.setBusy(false);
    syncInputLock();
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
      stopRandomRoll();
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
      if (!isActiveOperation(operation)) return false;
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
      if (!isActiveOperation(operation)) return false;
      if (error instanceof ApiRequestError) {
        const errorStatus = requestErrorStatus(error);
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

  // 天选数动画
  function randomInt1To49() {
    if (window.crypto && window.crypto.getRandomValues) {
      const values = new Uint32Array(1);
      const limit = Math.floor(0x100000000 / 49) * 49;
      do {
        window.crypto.getRandomValues(values);
      } while (values[0] >= limit);
      return (values[0] % 49) + 1;
    }
    return Math.floor(Math.random() * 49) + 1;
  }

  function randomFloat(min, max) {
    if (window.crypto && window.crypto.getRandomValues) {
      const values = new Uint32Array(1);
      window.crypto.getRandomValues(values);
      return min + (values[0] / 0xffffffff) * (max - min);
    }
    return min + Math.random() * (max - min);
  }

  function renderRandomNumberGrid() {
    dom.randomNumberGrid.innerHTML = Array.from({length: 49}, (_, index) =>
      `<span class="random-number-tile" data-value="${index + 1}">${index + 1}</span>`
    ).join('');
    randomTiles = Array.from(dom.randomNumberGrid.querySelectorAll('.random-number-tile'));
  }

  function clearRandomTileState() {
    randomTiles.forEach(tile => tile.classList.remove('is-lit', 'is-final'));
  }

  function lightRandomTile(value, final = false) {
    randomTiles.forEach(tile => {
      const active = Number(tile.dataset.value) === value;
      tile.classList.toggle('is-lit', active && !final);
      tile.classList.toggle('is-final', active && final);
    });
  }

  function startRandomRoll() {
    return new Promise(resolve => {
      if (castState.mode !== 'random') { resolve(null); return; }
      stopRandomRoll();
      dom.randomCastPanel.classList.add('is-rolling');
      clearRandomTileState();
      let step = 0;
      let currentValue = null;
      let settled = false;
      const totalSteps = Math.round(randomFloat(RANDOM_ROLL.minSteps, RANDOM_ROLL.maxSteps));
      // 重起时主动结束当前 Promise，避免随机数流程停在 await。
      const finish = value => {
        if (settled) return;
        settled = true;
        randomTimer = null;
        if (randomRollCancel === cancel) randomRollCancel = null;
        dom.randomCastPanel.classList.remove('is-rolling');
        resolve(value);
      };
      const cancel = () => finish(null);
      randomRollCancel = cancel;
      const rollTile = () => {
        if (settled) return;
        const value = randomInt1To49();
        currentValue = value;
        dom.randomNumber.textContent = value;
        lightRandomTile(value);
        step += 1;
        if (step < totalSteps) {
          const progress = step / (totalSteps - 1);
          const eased = progress * progress;
          const delay = RANDOM_ROLL.baseDelay +
            eased * RANDOM_ROLL.slowDelay +
            randomFloat(RANDOM_ROLL.jitterMin, RANDOM_ROLL.jitterMax);
          randomTimer = setTimeout(rollTile, Math.round(delay));
        } else {
          finish(currentValue);
        }
      };
      rollTile();
    });
  }

  function stopRandomRoll() {
    if (randomTimer !== null) {
      clearTimeout(randomTimer);
      randomTimer = null;
    }
    if (randomRollCancel) randomRollCancel();
    if (dom.randomCastPanel) dom.randomCastPanel.classList.remove('is-rolling');
  }

  function resetRandomCast(resetCasting = true) {
    stopRandomRoll();
    if (resetCasting) castState.setRandomCasting(false);
    castState.clearRandomNumbers();
    dom.randomNumber.textContent = '';
    clearRandomTileState();
  }

  async function pickRandomNumbers(operation) {
    resetRandomCast(false);
    for (let i = 0; i < MAX; i++) {
      if (!isActiveOperation(operation)) return false;
      const n = await startRandomRoll();
      if (n === null || !isActiveOperation(operation)) return false;
      lightRandomTile(n, true);
      castState.addRandomNumber(n);
      refresh();
      if (i < MAX - 1) {
        const ready = await waitFor(
          Math.round(randomFloat(RANDOM_ROLL.pauseMin, RANDOM_ROLL.pauseMax)),
          operation.controller.signal,
        );
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
    if (jieGuaAnimating || dom.resultContent.style.display !== 'none') {
      if (!(await showConfirm('卦解存乎，重起即散。'))) return;
    }
    cancelActiveOperation();
    unlockCastControls();
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

  // API 请求
  const apiBody = () => JSON.stringify({
    cast_mode: castState.mode,
    numbers: activeNumbers(),
    question: dom.question.value.trim(),
    wai_ying: dom.waiying.value.trim(),
  });

  function requestErrorStatus(error) {
    if (error.errorKind === API_ERROR_KIND.RATE_LIMIT || error.status === 429) {
      return {
        statusText: error.message || '今天已达次数上限，二十四小时后再来',
        statusDetail: '',
      };
    }
    if (error.errorKind === API_ERROR_KIND.HTTP) {
      return {
        statusText: httpErrorStatusText(error.status),
        statusDetail: error.message,
      };
    }
    if (error.errorKind === API_ERROR_KIND.SSE) {
      return {
        statusText: '服务处理失败',
        statusDetail: error.message || '服务暂时不可用，请稍后重试。',
      };
    }
    if (error.errorKind === API_ERROR_KIND.NETWORK) {
      return {
        statusText: '连接失败',
        statusDetail: error.message,
      };
    }
    if (error.errorKind === API_ERROR_KIND.DISCONNECT) {
      return {
        statusText: '连接中断',
        statusDetail: '本次结果未完整返回，请保持本页面打开并保持网络连接后重试。',
      };
    }
    if (error.errorKind === API_ERROR_KIND.CONTRACT) {
      return {
        statusText: '接口版本不匹配',
        statusDetail: '请刷新页面后重试。',
      };
    }
    if (error.errorKind === API_ERROR_KIND.CANCELLED) {
      return {
        statusText: '请求已取消',
        statusDetail: '',
      };
    }
    return {
      statusText: '连接出错',
      statusDetail: '请稍后重试。',
    };
  }

  function httpErrorStatusText(status) {
    if (status === 400) return '请求参数有误';
    if (status === 401 || status === 403) return '请求未获允许';
    if (status === 404) return '服务接口不存在';
    if (status === 408 || status === 504) return '服务响应超时';
    if (status >= 500) return '服务暂时不可用';
    return `请求失败（HTTP ${status}）`;
  }

  function showRequestErrorStatus(error) {
    renderErrorStatus(requestErrorStatus(error));
  }

  function renderErrorStatus(errorStatus) {
    dom.statusNotice.hidden = false;
    dom.statusReminder.hidden = true;
    dom.statusSpinner.classList.remove('active');
    dom.resultStatus.style.display = '';
    dom.resultContent.classList.remove('is-streaming');
    dom.resultContent.style.display = 'none';
    dom.statusText.textContent = errorStatus.statusText;
    dom.statusDetail.textContent = errorStatus.statusDetail;
  }

  function resetQiGuaErrorState() {
    castState.resetQiGuaProgress();
    jieGuaResult.resetForCast();
    dom.hexCols.style.display = 'none';
    dom.hexCols.innerHTML = '';
    dom.hexPlaceholder.style.display = '';
    dom.hexPlaceholder.textContent = `${castModeName()}后，卦象显示于此`;
  }

  function beginQiGua() {
    dom.hexPlaceholder.style.display = 'none';
    jieGuaResult.resetForCast();
    dom.resultContent.style.display = 'none';
    dom.resultContent.textContent = '';
    dom.resultPlaceholder.style.display = '';
    dom.resultStatus.style.display = 'none';
    dom.statusNotice.hidden = true;
    dom.statusReminder.hidden = false;
    dom.statusSpinner.classList.add('active');
    dom.resultTools.style.display = 'none';
    castState.setHexReady(false);
  }

  // 起卦流程
  dom.btnQiGua.addEventListener('click', async () => {
    if (castState.inputLocked) return;
    if (!canCast()) return;
    const operation = beginOperation();

    try {
      if (castState.mode === 'lunar') {
        const lunarReady = await prepareLunarCastFromPicker(operation);
        if (!lunarReady || !isActiveOperation(operation)) {
          requestAnimationFrame(syncRightColumnHeight);
          return;
        }
      }
      beginQiGua();

      if (castState.mode === 'random') {
        castState.setRandomCasting(true);
        refresh();
        const randomReady = await pickRandomNumbers(operation);
        if (!randomReady || !isActiveOperation(operation)) return;
      }

      jieGuaResult.setCastSnapshot(makeCastSnapshot());

      await runSSERequest(
        '/api/qi-gua',
        apiBody(),
        (event, raw) => {
          if (isActiveOperation(operation)) handleQiGua(event, raw);
        },
        {signal: operation.controller.signal},
      );
    } catch (error) {
      if (!isActiveOperation(operation)) return;
      showRequestErrorStatus(error);
      resetQiGuaErrorState();
      refresh();
    } finally {
      finishOperation(operation);
    }
  });

  // 起卦 SSE 事件
  function handleQiGua(event, raw) {
    let data; try { data = JSON.parse(raw); } catch (_) { data = raw; }
    if (event === 'hexagrams') {
      renderHexagrams(data.guas);
      requestAnimationFrame(syncRightColumnHeight);
    } else if (event === 'done') {
      castState.setRandomCasting(false);
      castState.setHexReady(true);
      requestAnimationFrame(syncRightColumnHeight);
    }
  }

  function beginJieGua() {
    jieGuaAnimating = true;
    startDiviningBackground();
    if (castState.mode === 'random') stopRandomRoll();
    dom.resultPlaceholder.style.display = 'none';
    dom.statusNotice.hidden = false;
    dom.statusReminder.hidden = false;
    dom.resultStatus.style.display = '';
    dom.statusSpinner.classList.add('active');
    dom.statusText.textContent = '正在解卦，请稍候……';
    dom.statusDetail.textContent = '';
    dom.resultTools.style.display = 'none';
    jieGuaResult.resetForInterpretation();
    jieGuaFinishPromise = null;
  }

  function finishJieGua({showResult = true, statusText = '', statusDetail = ''} = {}) {
    const operation = activeOperation;
    if (!operation) return Promise.resolve();
    if (jieGuaFinishPromise) return jieGuaFinishPromise;
    if (showResult) dom.statusNotice.hidden = true;
    jieGuaFinishPromise = (async () => {
      await settleDiviningBackground();
      if (!isActiveOperation(operation)) return;
      jieGuaAnimating = false;
      if (showResult) {
        dom.statusReminder.hidden = false;
        dom.statusSpinner.classList.add('active');
        dom.resultStatus.style.display = 'none';
        lockCastControls();
        const ready = await waitFor(RESULT_REVEAL_DELAY, operation.controller.signal);
        if (!ready || !isActiveOperation(operation)) return;
        jieGuaResult.revealCompleteResultTabs();
      } else {
        renderErrorStatus({statusText, statusDetail});
      }
    })().catch(error => {
      if (!isActiveOperation(operation)) return;
      console.error('解读结果展示失败', error);
      stopDiviningBackground();
      jieGuaAnimating = false;
      unlockCastControls();
      renderErrorStatus({
        statusText: '解读暂时不可用',
        statusDetail: '解读结果展示失败，请稍后重试。',
      });
    });
    return jieGuaFinishPromise;
  }

  function waitFor(ms, signal) {
    // 等待也纳入取消流程，避免重起后延迟回调继续推进旧操作。
    return new Promise(resolve => {
      let timer = null;
      let settled = false;
      const cleanup = () => signal?.removeEventListener('abort', onAbort);
      const finish = result => {
        if (settled) return;
        settled = true;
        if (timer !== null) clearTimeout(timer);
        cleanup();
        resolve(result);
      };
      const onAbort = () => finish(false);
      timer = setTimeout(() => finish(true), ms);
      if (signal?.aborted) finish(false);
      else signal?.addEventListener('abort', onAbort, {once: true});
    });
  }

  function startDiviningBackground() {
    stopDiviningBackground();
    if (!dom.bgTemple || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    diviningBgAngle = 0;
    diviningBgLastTime = performance.now();

    const spin = now => {
      if (diviningBgFrame === null) return;
      const delta = now - diviningBgLastTime;
      diviningBgAngle = (diviningBgAngle + delta * DIVINING_BG_SPEED) % 360;
      dom.bgTemple.style.setProperty('--bg-rotation', `${diviningBgAngle}deg`);
      diviningBgLastTime = now;
      diviningBgFrame = requestAnimationFrame(spin);
    };

    diviningBgFrame = requestAnimationFrame(spin);
  }

  function stopDiviningBackground() {
    // 收尾动画可能正被 await；取消时必须同时让它的 Promise 结束。
    if (diviningBgSettleCancel) {
      diviningBgSettleCancel();
      return;
    }
    if (diviningBgFrame !== null) cancelAnimationFrame(diviningBgFrame);
    diviningBgFrame = null;
    diviningBgAngle = 0;
    if (dom.bgTemple) dom.bgTemple.style.removeProperty('--bg-rotation');
  }

  function settleDiviningBackground() {
    if (!dom.bgTemple) return Promise.resolve();
    if (diviningBgSettleCancel) diviningBgSettleCancel();
    if (diviningBgFrame !== null) cancelAnimationFrame(diviningBgFrame);
    diviningBgFrame = null;

    const startAngle = diviningBgAngle;
    if (!startAngle) {
      dom.bgTemple.style.removeProperty('--bg-rotation');
      return Promise.resolve();
    }

    const remainingAngle = 360 - startAngle;
    const targetAngle = startAngle + remainingAngle;
    const startTime = performance.now();
    const duration = Math.max(240, remainingAngle / DIVINING_BG_SPEED);

    return new Promise(resolve => {
      const finish = () => {
        if (diviningBgFrame !== null) cancelAnimationFrame(diviningBgFrame);
        diviningBgFrame = null;
        diviningBgAngle = 0;
        dom.bgTemple.style.removeProperty('--bg-rotation');
        if (diviningBgSettleCancel === finish) diviningBgSettleCancel = null;
        resolve();
      };
      diviningBgSettleCancel = finish;
      const settle = now => {
        if (diviningBgSettleCancel !== finish) return;
        const progress = Math.min(1, (now - startTime) / duration);
        const angle = startAngle + (targetAngle - startAngle) * progress;
        dom.bgTemple.style.setProperty('--bg-rotation', `${angle}deg`);
        if (progress < 1) {
          diviningBgFrame = requestAnimationFrame(settle);
        } else {
          finish();
        }
      };

      diviningBgFrame = requestAnimationFrame(settle);
    });
  }

  function renderJieGuaProgress(data) {
    dom.statusNotice.hidden = false;
    dom.statusReminder.hidden = false;
    dom.resultStatus.style.display = '';
    dom.statusSpinner.classList.add('active');
    dom.statusText.textContent = data;
    dom.statusDetail.textContent = '';
  }

  function showJieGuaError(error) {
    const errorStatus = requestErrorStatus(error);
    return finishJieGua({
      showResult: false,
      statusText: errorStatus.statusText,
      statusDetail: errorStatus.statusDetail,
    });
  }

  // 解卦流程
  dom.btnJieGua.addEventListener('click', async () => {
    if (castState.inputLocked || !castState.hexReady) return;
    const operation = beginOperation();

    try {
      beginJieGua();
      await runSSERequest(
        '/api/jie-gua',
        apiBody(),
        (event, raw) => {
          if (isActiveOperation(operation)) handleJieGua(event, raw);
        },
        {signal: operation.controller.signal},
      );
      if (!isActiveOperation(operation)) return;
      finishJieGuaWhenReady();
      if (jieGuaFinishPromise) {
        await jieGuaFinishPromise;
      } else {
        await finishJieGua({
          showResult: false,
          statusText: '返回不完整',
          statusDetail: '解卦结果缺少白话或易理内容',
        });
      }
    } catch (error) {
      if (!isActiveOperation(operation)) return;
      if (jieGuaFinishPromise) {
        await jieGuaFinishPromise;
      } else {
        await showJieGuaError(error);
      }
    } finally {
      finishOperation(operation);
    }
  });

  // 解卦 SSE 事件
  function handleJieGua(event, raw) {
    let data; try { data = JSON.parse(raw); } catch (_) { data = raw; }
    if (event === 'hexagrams') {
      renderHexagrams(data.guas);
      renderGuwenDetail(data.guas);
    } else if (event === 'progress') {
      renderJieGuaProgress(data);
    } else if (event === 'thinking') {
      renderJieGuaProgress(data);
    } else if (event === 'yi_li_chunk') {
      jieGuaResult.appendStreamText('yili', data);
    } else if (event === 'result_chunk') {
      jieGuaResult.appendStreamText('baihua', data);
    } else if (event === 'result') {
      jieGuaResult.renderResult(data);
    } else if (event === 'yi_li') {
      jieGuaResult.setYiLi(data);
    }
  }

  function finishJieGuaWhenReady() {
    if (jieGuaResult.hasPlainResult()) finishJieGua();
  }

  // 卦象渲染适配
  function renderHexagrams(guas) {
    const html = hexagramRenderer.renderHexagrams(guas);
    jieGuaResult.setHexagramsHtml(html);
    dom.hexCols.innerHTML = html;
    dom.hexCols.style.display = 'flex';
  }

  function renderGuwenDetail(guas) {
    const html = hexagramRenderer.renderGuwenDetail(guas);
    jieGuaResult.setGuwenHtml(html);
  }
