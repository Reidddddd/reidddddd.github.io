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

  // 页面状态
  let plainHtml = '';
  let yiLiHtml = '';
  let plainStreamText = '';
  let yiLiStreamText = '';
  let guwenHtml = '';
  let hexagramsHtml = '';
  let castSnapshot = null;
  let activeResultView = 'guwen';

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
  // 页面交互状态
  let randomTimer = null;
  let randomTiles = [];
  let diviningBgFrame = null;
  let diviningBgAngle = 0;
  let diviningBgLastTime = 0;
  let diviningBgStartTime = 0;
  let jieGuaAnimating = false;
  let jieGuaFinishPromise = null;
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
    isLocked: () => castState.resultsLocked,
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

  function fetchLunarData(date) {
    return fetchLunarDataRequest(formatSolarDateTime(date));
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
      if (castState.resultsLocked) return;
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
    if (castState.hexReady) return;
    if (castState.mode === 'random' && castState.randomCasting) {
      dom.btnQiGua.disabled = true;
      dom.btnJieGua.style.display = 'none';
      dom.btnJieGua.disabled = true;
      return;
    }
    dom.btnQiGua.disabled = !canCast();
    dom.btnJieGua.style.display = 'none';
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

  function lockCastControls() {
    castState.lock();
    dom.btnQiGua.disabled = true;
    dom.btnJieGua.disabled = true;
  }
  function unlockCastControls() {
    castState.unlock();
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
    hexagramsHtml = '';
    castSnapshot = null;
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
    plainHtml = '';
    yiLiHtml = '';
    plainStreamText = '';
    yiLiStreamText = '';
    guwenHtml = '';
    activeResultView = 'guwen';
    updateResultTabs();
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

  async function prepareLunarCastFromPicker() {
    const date = readSolarDateTime();
    if (!date) {
      showLunarError('请选择有效的公历日期和时刻。');
      return false;
    }

    dom.btnQiGua.disabled = true;
    const requestedDateTime = formatSolarDateTime(date);
    const lunarDate = new Date(date);
    // 保留早子时规则：23:00 起按次日的农历日期换算。
    if (lunarDate.getHours() >= 23) lunarDate.setDate(lunarDate.getDate() + 1);
    try {
      const response = await fetchLunarData(lunarDate);
      const data = await response.json();
      const lunarCast = data.lunar_cast;
      const lunarNumbers = lunarCast?.numbers;
      const minuteShu = lunarCast?.minuteShu;
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
      const totalSteps = Math.round(randomFloat(RANDOM_ROLL.minSteps, RANDOM_ROLL.maxSteps));
      const rollTile = () => {
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
          randomTimer = null;
          dom.randomCastPanel.classList.remove('is-rolling');
          resolve(currentValue);
        }
      };
      rollTile();
    });
  }

  function stopRandomRoll() {
    if (randomTimer) {
      clearTimeout(randomTimer);
      randomTimer = null;
    }
    if (dom.randomCastPanel) dom.randomCastPanel.classList.remove('is-rolling');
  }

  function resetRandomCast(resetCasting = true) {
    stopRandomRoll();
    if (resetCasting) castState.setRandomCasting(false);
    castState.clearRandomNumbers();
    dom.randomNumber.textContent = '';
    clearRandomTileState();
  }

  async function pickRandomNumbers() {
    resetRandomCast(false);
    for (let i = 0; i < MAX; i++) {
      const n = await startRandomRoll();
      if (n === null) break;
      lightRandomTile(n, true);
      castState.addRandomNumber(n);
      refresh();
      if (i < MAX - 1) {
        await new Promise(r => setTimeout(r, Math.round(randomFloat(RANDOM_ROLL.pauseMin, RANDOM_ROLL.pauseMax))));
      }
    }
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
    hexagramsHtml = '';
    castSnapshot = null;
    dom.hexCols.style.display = 'none';
    dom.hexCols.innerHTML = '';
    dom.hexPlaceholder.style.display = '';
    dom.hexPlaceholder.textContent = `${castModeName()}后，卦象显示于此`;
    dom.btnQiGua.disabled = !canCast();
    dom.btnJieGua.style.display = 'none';
    dom.btnJieGua.disabled = true;
  }

  function beginQiGua() {
    unlockCastControls();
    dom.hexPlaceholder.style.display = 'none';
    hexagramsHtml = '';
    castSnapshot = null;
    dom.resultContent.style.display = 'none';
    dom.resultContent.textContent = '';
    dom.resultPlaceholder.style.display = '';
    dom.resultStatus.style.display = 'none';
    dom.statusNotice.hidden = true;
    dom.statusReminder.hidden = false;
    dom.statusSpinner.classList.add('active');
    dom.resultTools.style.display = 'none';
    plainHtml = '';
    yiLiHtml = '';
    plainStreamText = '';
    yiLiStreamText = '';
    guwenHtml = '';
    activeResultView = 'guwen';
    updateResultTabs();
    castState.setHexReady(false);
  }

  // 起卦流程
  dom.btnQiGua.addEventListener('click', async () => {
    if (castState.resultsLocked) return;
    if (!canCast()) return;
    if (castState.mode === 'lunar') {
      const lunarReady = await prepareLunarCastFromPicker();
      if (!lunarReady) {
        renderActionButtons();
        requestAnimationFrame(syncRightColumnHeight);
        return;
      }
    }
    beginQiGua();

    if (castState.mode === 'random') {
      castState.setRandomCasting(true);
      refresh();
      await pickRandomNumbers();
    }

    castSnapshot = makeCastSnapshot();

    try {
      await runSSERequest('/api/qi-gua', apiBody(), handleQiGua);
    } catch (error) {
      showRequestErrorStatus(error);
      resetQiGuaErrorState();
      refresh();
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
      dom.btnQiGua.disabled = true;
      dom.btnJieGua.style.display = ''; dom.btnJieGua.disabled = false;
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
    plainHtml = '';
    yiLiHtml = '';
    plainStreamText = '';
    yiLiStreamText = '';
    guwenHtml = '';
    activeResultView = 'guwen';
    jieGuaFinishPromise = null;
    updateResultTabs();
    dom.btnJieGua.disabled = true;
  }

  function finishJieGua({showResult = true, statusText = '', statusDetail = ''} = {}) {
    if (jieGuaFinishPromise) return jieGuaFinishPromise;
    if (showResult) dom.statusNotice.hidden = true;
    jieGuaFinishPromise = (async () => {
      await settleDiviningBackground();
      jieGuaAnimating = false;
      if (showResult) {
        dom.statusReminder.hidden = false;
        dom.statusSpinner.classList.add('active');
        dom.resultStatus.style.display = 'none';
        lockCastControls();
        await delay(RESULT_REVEAL_DELAY);
        revealCompleteResultTabs();
      } else {
        renderErrorStatus({statusText, statusDetail});
        dom.btnJieGua.disabled = false;
      }
    })();
    return jieGuaFinishPromise;
  }

  const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

  function startDiviningBackground() {
    if (!dom.bgTemple || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    if (diviningBgFrame) cancelAnimationFrame(diviningBgFrame);
    diviningBgAngle = 0;
    diviningBgStartTime = performance.now();
    diviningBgLastTime = diviningBgStartTime;

    const spin = now => {
      const delta = now - diviningBgLastTime;
      diviningBgAngle = (diviningBgAngle + delta * DIVINING_BG_SPEED) % 360;
      dom.bgTemple.style.setProperty('--bg-rotation', `${diviningBgAngle}deg`);
      diviningBgLastTime = now;
      diviningBgFrame = requestAnimationFrame(spin);
    };

    diviningBgFrame = requestAnimationFrame(spin);
  }

  function settleDiviningBackground() {
    if (!dom.bgTemple) return Promise.resolve();
    if (diviningBgFrame) cancelAnimationFrame(diviningBgFrame);
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
      const settle = now => {
        const progress = Math.min(1, (now - startTime) / duration);
        const angle = startAngle + (targetAngle - startAngle) * progress;
        dom.bgTemple.style.setProperty('--bg-rotation', `${angle}deg`);
        if (progress < 1) {
          diviningBgFrame = requestAnimationFrame(settle);
        } else {
          diviningBgFrame = null;
          diviningBgAngle = 0;
          dom.bgTemple.style.removeProperty('--bg-rotation');
          resolve();
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

  function appendJieGuaStreamText(view, data) {
    const text = resultPayloadText(data);
    if (!text) return;
    if (view === 'yili') {
      yiLiStreamText += text;
      renderJieGuaStreamText(yiLiStreamText);
    } else {
      plainStreamText += text;
      renderJieGuaStreamText(plainStreamText);
    }
  }

  function renderJieGuaStreamText(text) {
    dom.resultPlaceholder.style.display = 'none';
    dom.resultContent.classList.add('is-streaming');
    dom.resultContent.textContent = text;
    dom.resultContent.style.display = 'block';
    requestAnimationFrame(syncRightColumnHeight);
  }

  function renderJieGuaResult(data) {
    dom.resultStatus.style.display = 'none';
    dom.resultContent.classList.remove('is-streaming');
    plainHtml = resultPayloadHtml(data);
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
    if (!castState.hexReady) return;
    beginJieGua();

    try {
      await runSSERequest('/api/jie-gua', apiBody(), handleJieGua);
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
      if (jieGuaFinishPromise) {
        await jieGuaFinishPromise;
        return;
      }
      await showJieGuaError(error);
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
      appendJieGuaStreamText('yili', data);
    } else if (event === 'result_chunk') {
      appendJieGuaStreamText('baihua', data);
    } else if (event === 'result') {
      renderJieGuaResult(data);
    } else if (event === 'yi_li') {
      yiLiHtml = resultPayloadHtml(data);
      updateResultTabs();
    }
  }

  function finishJieGuaWhenReady() {
    if (plainHtml) finishJieGua();
  }

  function resultPayloadHtml(data) {
    if (typeof data === 'string') return data;
    if (!data || typeof data !== 'object') return '';
    return data.html || data.content || data.result || data.text || '';
  }

  function resultPayloadText(data) {
    if (typeof data === 'string') return data;
    if (!data || typeof data !== 'object') return '';
    return data.text || data.content || '';
  }

  function resultHtmlForView(view) {
    if (view === 'guwen') return guwenHtml;
    if (view === 'baihua') return plainHtml;
    if (view === 'yili') return yiLiHtml;
    return '';
  }

  function updateResultTabs() {
    dom.resultViewButtons.forEach(btn => {
      const view = btn.dataset.resultView;
      const hasContent = Boolean(resultHtmlForView(view));
      btn.classList.toggle('active', view === activeResultView);
      btn.disabled = !hasContent;
    });
    updateSaveButton();
  }

  function canSaveResult() {
    return Boolean(castSnapshot && hexagramsHtml && plainHtml && yiLiHtml && guwenHtml);
  }

  function updateSaveButton() {
    if (!dom.btnSaveResult) return;
    dom.btnSaveResult.disabled = !canSaveResult();
  }

  function revealCompleteResultTabs() {
    updateResultTabs();
    if (!plainHtml) return;
    if (dom.resultTools.style.display === 'none' || !resultHtmlForView(activeResultView)) {
      selectResultView('baihua');
    } else {
      selectResultView(activeResultView);
    }
  }

  function selectResultView(view) {
    const html = resultHtmlForView(view);
    if (!html) {
      updateResultTabs();
      return;
    }
    activeResultView = view;
    updateResultTabs();
    dom.resultTools.style.display = 'flex';
    dom.resultPlaceholder.style.display = 'none';
    dom.resultContent.classList.remove('is-streaming');
    dom.resultContent.innerHTML = html;
    dom.resultContent.style.display = view === 'guwen' ? 'grid' : 'block';
    requestAnimationFrame(syncRightColumnHeight);
  }

  dom.resultViewButtons.forEach(btn => {
    btn.addEventListener('click', () => selectResultView(btn.dataset.resultView));
  });

  if (dom.btnSaveResult) {
    dom.btnSaveResult.addEventListener('click', saveCurrentResult);
  }

  function saveCurrentResult() {
    if (!canSaveResult()) return;
    const html = buildSavedResultHtml();
    const blob = new Blob([html], {type: 'text/html;charset=utf-8'});
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${safeFileName(castSnapshot.question)}.html`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function safeFileName(value) {
    const name = String(value || '').trim()
      .replace(/[\\/:*?"<>|\u0000-\u001f]+/g, '_')
      .replace(/\s+/g, ' ')
      .slice(0, 80)
      .trim();
    return name || '梅花易数';
  }

  function stripLeadingResultTitle(html, title) {
    const pattern = new RegExp(`^\\s*<h[1-3][^>]*>\\s*${escapeRegExp(title)}\\s*</h[1-3]>\\s*`, 'i');
    return String(html || '').replace(pattern, '');
  }

  function escapeRegExp(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  function buildSavedResultHtml() {
    const waiYingText = castSnapshot.waiYing || '无';
    const savedPlainHtml = stripLeadingResultTitle(plainHtml, '白话');
    const savedYiLiHtml = stripLeadingResultTitle(yiLiHtml, '易理');
    return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(castSnapshot.question)}</title>
  <style>
    :root {
      --bg: #f5f0e8;
      --card: rgba(255, 254, 249, 0.65);
      --border: #d4c8b0;
      --text: #3d3226;
      --text-soft: #5f5146;
      --text-dim: #8b7d6b;
      --accent: #8b2500;
      --tile-bg: #faf7f0;
      --shadow: 0 1px 8px rgba(0,0,0,0.05);
    }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: "PingFang SC", "Noto Serif SC", "Source Han Serif SC", "Hiragino Mincho Pro", "Songti SC", serif;
      background: radial-gradient(ellipse at 50% 30%, #faf6ec 0%, #efe8d6 60%, #e0d8c0 100%);
      color: var(--text-dim); min-height: 100vh; padding: 0.8rem; overflow-x: hidden;
    }
    .bg-temple { position: fixed; inset: 0; pointer-events: none; z-index: 0; font-variant-emoji: text; }
    .bg-temple .tai-ji {
      --s: 34vmin;
      position: absolute; top: 50%; left: 50%; translate: -50% -50%; rotate: 180deg;
      width: var(--s); height: var(--s); border-radius: 50%; opacity: 0.28;
      background: linear-gradient(to left, #f0e6d0 50%, #b8a080 50%);
    }
    .bg-temple .tai-ji::before {
      content: ''; position: absolute; width: 50%; height: 50%;
      top: 0; left: 25%; border-radius: 50%;
      background: radial-gradient(circle at 50% 50%, #f0e6d0 14%, #b8a080 15%);
    }
    .bg-temple .tai-ji::after {
      content: ''; position: absolute; width: 50%; height: 50%;
      bottom: 0; left: 25%; border-radius: 50%;
      background: radial-gradient(circle at 50% 50%, #b8a080 14%, #f0e6d0 15%);
    }
    .bg-temple .gua {
      position: absolute; font-size: 2.2rem; color: #8b7860; opacity: 0.35;
      transform: translate(-50%, -50%);
    }
    .gua-nw { top: 3%; left: 3%; }
    .gua-n { top: 3%; left: 50%; }
    .gua-ne { top: 3%; left: 97%; }
    .gua-w { top: 50%; left: 3%; }
    .gua-e { top: 50%; left: 97%; }
    .gua-sw { top: 97%; left: 3%; }
    .gua-s { top: 97%; left: 50%; }
    .gua-se { top: 97%; left: 97%; }
    .container { width: min(100%, 980px); margin: 0 auto; padding-bottom: 3rem; position: relative; z-index: 1; }
    .report-title { font-size: 1.6rem; font-weight: 700; letter-spacing: 0.1em; color: var(--accent); margin-bottom: 0.5rem; }
    .card { background: var(--card); border: 1px solid var(--border); border-radius: 8px; box-shadow: var(--shadow); }
    .card-padded { padding: 0.7rem; }
    .report-section { margin-top: 0.6rem; }
    .section-title { font-size: 1.02rem; font-weight: 700; margin-bottom: 0.32rem; color: var(--accent); }
    .meta-list { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 0.5rem; margin: 0; }
    .meta-list div { min-width: 0; }
    .meta-list dt { font-size: 0.9rem; font-weight: 600; color: var(--text-soft); }
    .meta-list dd { margin: 0.08rem 0 0; font-size: 0.95rem; color: var(--text-dim); word-break: break-word; }
    .hex-cols { display: flex; gap: 6px; flex-wrap: wrap; }
    .hex-col { flex: 1 1 75px; min-width: 75px; background: var(--tile-bg); border: 1px solid var(--border); border-radius: 7px; padding: 0.5rem 0.35rem; text-align: center; }
    .hex-col .gua-label { font-size: 0.8rem; color: #b0a090; margin-bottom: 0.3rem; padding-bottom: 0.3rem; border-bottom: 1px dotted var(--border); }
    .hex-col .gua-name { font-size: 0.7rem; color: var(--text-dim); margin-bottom: 0.25rem; }
    .hex-col .gua-pair { display: flex; flex-direction: column; }
    .hex-col .gua-pair span { font-size: 3.2rem; line-height: 1; }
    .result-content { font-size: 0.92rem; line-height: 1.68; word-break: break-word; color: var(--text-dim); }
    .result-content h1 { font-size: 1.12rem; }
    .result-content h2 { font-size: 1.02rem; }
    .result-content h3 { font-size: 0.96rem; }
    .result-content h1, .result-content h2, .result-content h3 { color: var(--accent); margin: 0.65rem 0 0.3rem; }
    .result-content p { margin: 0.32rem 0; }
    .result-content ul, .result-content ol { padding-left: 1.35rem; margin: 0.32rem 0; }
    .result-content li { margin: 0.16rem 0; }
    .result-content strong { color: var(--accent); }
    .result-content hr { border: none; border-top: 1px solid var(--border); margin: 0.65rem 0; }
    .result-content code { background: var(--tile-bg); padding: 0.1rem 0.3rem; border-radius: 3px; font-size: 0.86rem; }
    .gua-detail-cols { display: grid; grid-template-columns: repeat(auto-fit, minmax(8.8rem, 1fr)); gap: 6px; padding-bottom: 0.15rem; }
    .gua-detail-col { min-width: 0; background: rgba(255, 250, 242, 0.72); border: 1px solid var(--border); border-radius: 7px; padding: 0.5rem 0.45rem; text-align: left; }
    .gua-detail-head { display: flex; align-items: baseline; justify-content: center; gap: 0.35rem; padding-bottom: 0.35rem; margin-bottom: 0.4rem; border-bottom: 1px dotted var(--border); }
    .gua-detail-head strong { font-size: 0.82rem; color: var(--text-dim); font-weight: 700; }
    .gua-detail-title { margin: 0.45rem 0 0.18rem; font-size: 0.74rem; color: var(--accent); font-weight: 700; }
    .gua-detail-col p { margin: 0; font-size: 0.76rem; line-height: 1.55; color: var(--text-dim); }
    .yao-list { display: flex; flex-direction: column; gap: 0.24rem; }
    .yao-item { padding: 0.24rem 0.28rem; border-radius: 5px; border: 1px solid transparent; }
    .yao-item span { display: block; margin-bottom: 0.08rem; font-size: 0.72rem; color: #a08f7f; font-weight: 700; }
    .yao-item.dong-yao { background: rgba(200, 150, 12, 0.14); border-color: rgba(200, 150, 12, 0.42); }
    .yao-item.dong-yao span, .yao-item.dong-yao p { color: #8b5f00; font-weight: 700; }
    @media (max-width: 640px) {
      body { padding: 0.8rem; }
      .report-title { font-size: 1.35rem; }
      .meta-list { grid-template-columns: 1fr; }
      .hex-cols { gap: 3px; }
      .hex-col { min-width: 55px; padding: 0.3rem 0.2rem; }
      .hex-col .gua-pair span { font-size: 2.2rem; }
    }
  </style>
</head>
<body>
  <div class="bg-temple">
    <div class="tai-ji"></div>
    <span class="gua gua-n">☰︎</span>
    <span class="gua gua-nw">☱︎</span>
    <span class="gua gua-w">☲︎</span>
    <span class="gua gua-sw">☳︎</span>
    <span class="gua gua-s">☷︎</span>
    <span class="gua gua-se">☶︎</span>
    <span class="gua gua-e">☵︎</span>
    <span class="gua gua-ne">☴︎</span>
  </div>
  <main class="container">
    <h1 class="report-title">${escapeHtml(castSnapshot.question)}</h1>
    <section class="card card-padded report-section">
      <h2 class="section-title">起卦</h2>
      <dl class="meta-list">
        <div><dt>模式</dt><dd>${escapeHtml(castSnapshot.mode)}</dd></div>
        <div><dt>数字</dt><dd>${escapeHtml(castSnapshot.numbers.join(' '))}</dd></div>
        <div><dt>外应</dt><dd>${escapeHtml(waiYingText)}</dd></div>
      </dl>
    </section>
    <section class="card card-padded report-section">
      <h2 class="section-title">卦象</h2>
      <div class="hex-cols">${hexagramsHtml}</div>
    </section>
    <section class="card card-padded report-section">
      <h2 class="section-title">白话</h2>
      <div class="result-content">${savedPlainHtml}</div>
    </section>
    <section class="card card-padded report-section">
      <h2 class="section-title">易理</h2>
      <div class="result-content">${savedYiLiHtml}</div>
    </section>
    <section class="card card-padded report-section">
      <h2 class="section-title">古文</h2>
      <div class="result-content">${guwenHtml}</div>
    </section>
  </main>
</body>
</html>`;
  }

  // 卦象渲染适配
  function renderHexagrams(guas) {
    hexagramsHtml = hexagramRenderer.renderHexagrams(guas);
    dom.hexCols.innerHTML = hexagramsHtml;
    dom.hexCols.style.display = 'flex';
    updateSaveButton();
  }

  function renderGuwenDetail(guas) {
    guwenHtml = hexagramRenderer.renderGuwenDetail(guas);
    updateResultTabs();
  }
