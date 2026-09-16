// 配置与全局状态
const API_CONFIG                   = window.MYHS_API_CONFIG;
if (!API_CONFIG) throw new Error('缺少 API 配置');
const API_ENV                      = API_CONFIG.environment === 'auto'
  ? (['localhost', '127.0.0.1', '0.0.0.0', '::1'].includes(window.location.hostname) ? 'local' : 'production')
  : API_CONFIG.environment;
const API_ENV_CONFIG               = API_CONFIG.environments[API_ENV];
if (!API_ENV_CONFIG?.baseUrl) throw new Error(`缺少 ${API_ENV} API 配置`);
const API_BASE                     = API_ENV_CONFIG.baseUrl.replace(/\/+$/, '');
const API_REQUEST_HEADERS          = API_ENV_CONFIG.headers || {};
const API_CONTRACT_VERSION_HEADER  = 'X-API-Contract-Version';
const API_CONTRACT_VERSION         = '1';
const API_ERROR_KIND               = Object.freeze({
  HTTP: 'http',
  SSE: 'sse',
  RATE_LIMIT: 'rate_limit',
  NETWORK: 'network',
  DISCONNECT: 'disconnect',
  CONTRACT: 'contract',
});

class ApiRequestError extends Error {
  constructor(errorKind, message, status = null) {
    super(message);
    this.name = 'ApiRequestError';
    this.errorKind = errorKind;
    this.status = status;
  }
}

  const MAX = 3, MIN = 2;
  let selected = [];
  let castMode = 'numbers';
  let customCast = {shang: 1, xia: 1, dong: 1};
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
    hourScroll: $('hourScroll'), minuteScroll: $('minuteScroll'),
    calDays: $('calDays'), calMonthText: $('calMonthText'), calYearBtn: $('calYearBtn'), calYearDrop: $('calYearDrop'),
    calPrev: $('calPrev'), calNext: $('calNext'),
    lunarCastResult: $('lunarCastResult'),
    lunarShang: $('lunarShang'), lunarXia: $('lunarXia'), lunarDong: $('lunarDong'),
    lunarShangFormula: $('lunarShangFormula'), lunarXiaFormula: $('lunarXiaFormula'),
    lunarDongFormula: $('lunarDongFormula'),
    confirmModal: $('confirmModal'), confirmMessage: $('confirmMessage'), confirmOk: $('confirmOk'), confirmCancel: $('confirmCancel'),
  };
  // 起卦状态
  let hexReady = false;
  let randomCasting = false;
  let randomPicked = [];
  let randomTimer = null;
  let randomTiles = [];
  let diviningBgFrame = null;
  let diviningBgAngle = 0;
  let diviningBgLastTime = 0;
  let diviningBgStartTime = 0;
  let jieGuaAnimating = false;
  let resultsLocked = false;
  let jieGuaFinishPromise = null;
  const DIVINING_BG_SPEED = 0.43;
  const RESULT_REVEAL_DELAY = 1000;
  let LUNAR_CAST = null;
  let lunarCastRevealed = false;
  let lunarPickerFollowsNow = true;
  let lunarPickerDate = new Date();
  let lunarPickerHour = lunarPickerDate.getHours();
  let lunarPickerMinute = lunarPickerDate.getMinutes();
  let calendarYear = lunarPickerDate.getFullYear();
  let calendarMonth = lunarPickerDate.getMonth();
  let timeScrollBusy = false;
  const TIME_LOOP_CYCLES = 5;
  const TIME_LOOP_MID = Math.floor(TIME_LOOP_CYCLES / 2);
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

  // 页面初始数据
  function formatSolarDateTime(date) {
    const datePart = [
      String(date.getFullYear()).padStart(4, '0'),
      pad2(date.getMonth() + 1),
      pad2(date.getDate()),
    ].join('-');
    return `${datePart}T${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
  }

  function fetchLunarData(date) {
    const encodedSolarDateTime = encodeURIComponent(formatSolarDateTime(date));
    return fetchApiResponse(
      `${API_BASE}/api/lunar-data?solar_datetime=${encodedSolarDateTime}`,
      {
        headers: API_REQUEST_HEADERS,
      },
    );
  }

  function assertApiContract(response) {
    const version = response.headers.get(API_CONTRACT_VERSION_HEADER);
    if (version !== API_CONTRACT_VERSION) {
      throw new ApiRequestError(
        API_ERROR_KIND.CONTRACT,
        'API 契约版本不匹配，请刷新页面后重试。',
      );
    }
  }

  async function fetchApiResponse(url, options) {
    let response;
    try {
      response = await fetch(url, options);
    } catch (_) {
      // fetch 失败时没有可用的 HTTP 状态，统一归类为网络错误。
      throw new ApiRequestError(
        API_ERROR_KIND.NETWORK,
        '无法连接服务，请检查网络连接后重试。',
      );
    }
    assertApiContract(response);
    return response;
  }

  fetchLunarData(new Date())
    .then(async response => {
      if (!response.ok) throw await createHttpError(response);
      return response.json();
    })
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
      if (resultsLocked) return;
      if (selected.length < MAX) selected.push(i);
      syncNumberTileStates();
      if (hexReady) clearCastOutput();
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
    if (castMode === 'lunar') {
      const lunarCast = updateLunarCastPanel();
      dom.castSummaryLine1.textContent = '';
      dom.castSummaryLine2.textContent = lunarCast ? '农时既得，卦数从之' : '公历择时，卦起农定';
      dom.selectedNums.textContent = lunarCast ? lunarCast.numbers.join(' ') : '';
    } else if (castMode === 'random') {
      dom.castSummaryLine1.textContent = '天运自转，数由天定';
      dom.castSummaryLine2.textContent = '三数既得，象从此生';
      dom.selectedNums.textContent = randomPicked.join(' ');
    } else if (castMode === 'custom') {
      dom.castSummaryLine1.textContent = '上下卦由心，动爻随意定';
      dom.castSummaryLine2.textContent = '';
      dom.selectedNums.textContent = activeNumbers().join(' ');
    } else {
      dom.castSummaryLine1.textContent = '大衍之数五十，其用四十有九';
      dom.castSummaryLine2.textContent = '随心取数二三，以观其象所成';
      dom.selectedNums.textContent = selected.join(' ');
    }
  }

  function renderActionButtons() {
    if (hexReady) return;
    if (castMode === 'random' && randomCasting) {
      dom.btnQiGua.disabled = true;
      dom.btnJieGua.style.display = 'none';
      dom.btnJieGua.disabled = true;
      return;
    }
    dom.btnQiGua.disabled = !canCast();
    dom.btnJieGua.style.display = 'none';
  }

  async function setCastMode(mode) {
    if (resultsLocked) return;
    if (mode === castMode) return;
    castMode = mode;
    dom.modeButtons.forEach(btn => btn.classList.toggle('active', btn.dataset.castMode === mode));
    dom.numberCastPanel.hidden = mode !== 'numbers';
    dom.randomCastPanel.hidden = mode !== 'random';
    dom.lunarCastPanel.hidden = mode !== 'lunar';
    dom.customCastPanel.hidden = mode !== 'custom';
    if (mode === 'lunar') refreshLunarPickerNow();
    clearCastOutput();
    refresh();
  }

  function lockCastControls() {
    resultsLocked = true;
    dom.btnQiGua.disabled = true;
    dom.btnJieGua.disabled = true;
  }
  function unlockCastControls() {
    resultsLocked = false;
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
    hexReady = false;
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
    if (castMode === 'random') resetRandomCast();
    else {
      randomCasting = false;
      stopRandomRoll();
    }
    if (castMode === 'lunar') hideLunarCastResult();
    plainHtml = '';
    yiLiHtml = '';
    plainStreamText = '';
    yiLiStreamText = '';
    guwenHtml = '';
    activeResultView = 'guwen';
    updateResultTabs();
  }

  function castModeName() {
    if (castMode === 'lunar') return '农历时起卦';
    if (castMode === 'custom') return '自定义起卦';
    if (castMode === 'random') return '天选数起卦';
    return '自选数起卦';
  }

  function makeCastSnapshot() {
    return {
      mode: castModeName(),
      numbers: activeNumbers(),
      question: dom.question.value.trim(),
      waiYing: dom.waiying.value.trim(),
    };
  }

  function canCast() {
    if (castMode === 'lunar') return Boolean(readSolarDateTime()) && Boolean(dom.question.value.trim());
    if (castMode === 'random') return Boolean(dom.question.value.trim());
    return activeNumbers().length >= MIN && Boolean(dom.question.value.trim());
  }

  function activeNumbers() {
    if (castMode === 'lunar') {
      return LUNAR_CAST ? LUNAR_CAST.numbers : [];
    }
    if (castMode === 'random') return randomPicked.slice();
    if (castMode === 'custom') {
      return [customCast.shang, customCast.xia, customCast.dong];
    }
    return selected.slice();
  }

  function syncNumberTileStates() {
    document.querySelectorAll('.number-tile').forEach(tile => {
      const value = Number(tile.dataset.value);
      const count = selected.filter(n => n === value).length;
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
        if (resultsLocked) return;
        customCast[role] = Number(btn.dataset.value);
        if (hexReady) clearCastOutput();
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
        if (resultsLocked) return;
        customCast.dong = Number(btn.dataset.value);
        if (hexReady) clearCastOutput();
        refreshCustomCastOptions();
        refresh();
      });
    });
    refreshCustomCastOptions();
  }

  function refreshCustomCastOptions() {
    document.querySelectorAll('.custom-gua-btn').forEach(btn => {
      btn.classList.toggle('selected', customCast[btn.dataset.role] === Number(btn.dataset.value));
    });
    document.querySelectorAll('.custom-yao-btn').forEach(btn => {
      btn.classList.toggle('selected', customCast.dong === Number(btn.dataset.value));
    });
  }

  // 农历时：状态初始化
  function initLunarPicker() {
    setLunarPickerToNow();
    hideLunarCastResult();
    refresh();
  }

  function setLunarPickerToNow() {
    const now = new Date();
    lunarPickerDate = now;
    lunarPickerHour = now.getHours();
    lunarPickerMinute = now.getMinutes();
    calendarYear = now.getFullYear();
    calendarMonth = now.getMonth();
    lunarPickerFollowsNow = true;
    renderCalendar();
    setTimeScrollTo(lunarPickerHour, lunarPickerMinute);
  }

  function refreshLunarPickerNow() {
    if (lunarPickerFollowsNow && !lunarCastRevealed) setLunarPickerToNow();
  }

  function pad2(value) {
    return String(value).padStart(2, '0');
  }

  function readSolarDateTime() {
    const date = new Date(lunarPickerDate);
    date.setHours(lunarPickerHour, lunarPickerMinute, 0, 0);
    return date;
  }

  // 农历时：时间滚轮
  function buildTimeScrolls() {
    dom.hourScroll.innerHTML = buildTimeLoopItems(24, value => pad2(value));
    dom.minuteScroll.innerHTML = buildTimeLoopItems(60, value => pad2(value));

    dom.hourScroll.addEventListener('scroll', () => onTimeScroll('hour'), {passive: true});
    dom.minuteScroll.addEventListener('scroll', () => onTimeScroll('minute'), {passive: true});
  }

  function buildTimeLoopItems(count, labelFor) {
    let html = '';
    for (let cycle = 0; cycle < TIME_LOOP_CYCLES; cycle++) {
      for (let value = 0; value < count; value++) {
        html += `<div class="time-item" data-cycle="${cycle}" data-value="${value}">${labelFor(value)}</div>`;
      }
    }
    return html;
  }

  function getTimeItemHeight() {
    const item = dom.hourScroll.querySelector('.time-item');
    return item ? item.offsetHeight : 28.8;
  }

  function setTimeScrollTo(hour, minute) {
    timeScrollBusy = true;
    scrollTimeColumnTo(dom.hourScroll, hour);
    scrollTimeColumnTo(dom.minuteScroll, minute);
    updateTimeActiveItems();
    requestAnimationFrame(() => { timeScrollBusy = false; });
  }

  function scrollTimeColumnTo(scroll, value) {
    const item = scroll.querySelector(`[data-cycle="${TIME_LOOP_MID}"][data-value="${value}"]`);
    if (!item || !item.offsetHeight || !scroll.clientHeight) {
      scroll.scrollTop = value * getTimeItemHeight();
      return;
    }
    scroll.scrollTop = item.offsetTop - (scroll.clientHeight - item.offsetHeight) / 2;
  }

  function onTimeScroll(which) {
    if (timeScrollBusy) return;
    const scroll = which === 'hour' ? dom.hourScroll : dom.minuteScroll;
    const current = closestTimeItem(scroll);
    const idx = current.value;
    const maxVal = which === 'hour' ? 23 : 59;
    const val = Math.max(0, Math.min(maxVal, idx));
    if (which === 'hour') lunarPickerHour = val;
    else lunarPickerMinute = val;
    updateTimeActiveItems();
    updateLunarPickerDateFromScroll();
    normalizeTimeLoop(scroll, current);
  }

  function closestTimeItem(scroll) {
    const items = Array.from(scroll.querySelectorAll('.time-item'));
    const center = scroll.scrollTop + scroll.clientHeight / 2;
    let closest = {value: 0, cycle: TIME_LOOP_MID};
    let closestDistance = Infinity;
    items.forEach(item => {
      const itemCenter = item.offsetTop + item.offsetHeight / 2;
      const distance = Math.abs(itemCenter - center);
      if (distance < closestDistance) {
        closestDistance = distance;
        closest = {
          value: Number(item.dataset.value),
          cycle: Number(item.dataset.cycle),
        };
      }
    });
    return closest;
  }

  function normalizeTimeLoop(scroll, current) {
    if (current.cycle > 0 && current.cycle < TIME_LOOP_CYCLES - 1) return;
    timeScrollBusy = true;
    scrollTimeColumnTo(scroll, current.value);
    requestAnimationFrame(() => { timeScrollBusy = false; });
  }

  function updateTimeActiveItems() {
    dom.hourScroll.querySelectorAll('.time-item').forEach(item => {
      item.classList.toggle('is-active', Number(item.dataset.value) === lunarPickerHour);
    });
    dom.minuteScroll.querySelectorAll('.time-item').forEach(item => {
      item.classList.toggle('is-active', Number(item.dataset.value) === lunarPickerMinute);
    });
  }

  function updateLunarPickerDateFromScroll() {
    lunarPickerDate = new Date(calendarYear, calendarMonth,
      lunarPickerDate.getDate(), lunarPickerHour, lunarPickerMinute);
    if (!timeScrollBusy) lunarPickerFollowsNow = false;
  }

  // 农历时：日历选择
  function renderCalendar() {
    dom.calYearBtn.textContent = calendarYear;
    dom.calMonthText.textContent = calendarMonth + 1;
    const today = new Date();
    const todayY = today.getFullYear();
    const todayM = today.getMonth();
    const todayD = today.getDate();
    const selY = lunarPickerDate.getFullYear();
    const selM = lunarPickerDate.getMonth();
    const selD = lunarPickerDate.getDate();

    const firstDay = new Date(calendarYear, calendarMonth, 1).getDay();
    const daysInMonth = new Date(calendarYear, calendarMonth + 1, 0).getDate();
    const daysInPrevMonth = new Date(calendarYear, calendarMonth, 0).getDate();

    let html = '';
    // prev month fill
    for (let i = firstDay - 1; i >= 0; i--) {
      const d = daysInPrevMonth - i;
      html += `<button type="button" class="cal-day is-other-month" data-day="${d}" data-month="prev">${d}</button>`;
    }
    // current month
    for (let d = 1; d <= daysInMonth; d++) {
      let cls = 'cal-day';
      if (calendarYear === todayY && calendarMonth === todayM && d === todayD) cls += ' is-today';
      if (calendarYear === selY && calendarMonth === selM && d === selD) cls += ' is-selected';
      html += `<button type="button" class="${cls}" data-day="${d}" data-month="curr">${d}</button>`;
    }
    // next month fill
    const totalCells = firstDay + daysInMonth;
    const remain = totalCells % 7 === 0 ? 0 : 7 - (totalCells % 7);
    for (let d = 1; d <= remain; d++) {
      html += `<button type="button" class="cal-day is-other-month" data-day="${d}" data-month="next">${d}</button>`;
    }

    dom.calDays.innerHTML = html;
    dom.calDays.querySelectorAll('.cal-day').forEach(btn => {
      btn.addEventListener('click', () => handleDayClick(btn));
    });
  }

  function handleDayClick(btn) {
    if (resultsLocked) return;
    const day = Number(btn.dataset.day);
    const monthType = btn.dataset.month;
    if (monthType === 'prev') {
      calendarMonth -= 1;
      if (calendarMonth < 0) { calendarMonth = 11; calendarYear -= 1; }
    } else if (monthType === 'next') {
      calendarMonth += 1;
      if (calendarMonth > 11) { calendarMonth = 0; calendarYear += 1; }
    }
    lunarPickerDate = new Date(calendarYear, calendarMonth, day,
      lunarPickerHour, lunarPickerMinute);
    lunarPickerFollowsNow = false;
    renderCalendar();
    if (castMode !== 'lunar') return;
    if (hexReady) clearCastOutput();
    else hideLunarCastResult();
    refresh();
    requestAnimationFrame(syncRightColumnHeight);
  }

  function handleLunarPickerChange() {
    lunarPickerFollowsNow = false;
    if (castMode !== 'lunar') return;
    if (hexReady) clearCastOutput();
    else hideLunarCastResult();
    refresh();
    requestAnimationFrame(syncRightColumnHeight);
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
      if (!response.ok) throw await createHttpError(response);
      const data = await response.json();
      const lunarCast = data.lunar_cast;
      const lunarNumbers = lunarCast?.numbers;
      const minuteShu = lunarCast?.minuteShu;
      const currentDateTime = formatSolarDateTime(readSolarDateTime());
      if (castMode !== 'lunar' || currentDateTime !== requestedDateTime) return false;
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
    lunarPickerFollowsNow = false;
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
      if (castMode !== 'random') { resolve(null); return; }
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
    if (resetCasting) randomCasting = false;
    randomPicked = [];
    dom.randomNumber.textContent = '';
    clearRandomTileState();
  }

  async function pickRandomNumbers() {
    resetRandomCast(false);
    for (let i = 0; i < MAX; i++) {
      const n = await startRandomRoll();
      if (n === null) break;
      lightRandomTile(n, true);
      randomPicked.push(n);
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

    refreshLunarPickerNow();
    requestAnimationFrame(syncRightColumnHeight);
  });
  window.addEventListener('focus', () => {
    refreshLunarPickerNow();
    refresh();
  });

  dom.btnReset.addEventListener('click', async () => {
    if (jieGuaAnimating || dom.resultContent.style.display !== 'none') {
      if (!(await showConfirm('卦解存乎，重起即散。'))) return;
    }
    unlockCastControls();
    dom.question.value = '';
    dom.waiying.value = '';
    selected = [];
    syncNumberTileStates();
    if (castMode === 'lunar') setLunarPickerToNow();
    clearCastOutput();
    refresh();
    requestAnimationFrame(syncRightColumnHeight);
  });
  dom.question.addEventListener('input', refresh);
  dom.modeButtons.forEach(btn => btn.addEventListener('click', () => setCastMode(btn.dataset.castMode)));
  dom.calPrev.addEventListener('click', () => {
    if (resultsLocked) return;
    dom.calYearDrop.hidden = true;
    calendarMonth -= 1;
    if (calendarMonth < 0) { calendarMonth = 11; calendarYear -= 1; }
    renderCalendar();
  });
  dom.calNext.addEventListener('click', () => {
    if (resultsLocked) return;
    dom.calYearDrop.hidden = true;
    calendarMonth += 1;
    if (calendarMonth > 11) { calendarMonth = 0; calendarYear += 1; }
    renderCalendar();
  });
  dom.calYearBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (dom.calYearDrop.hidden) {
      openYearDrop();
    } else {
      dom.calYearDrop.hidden = true;
    }
  });
  document.addEventListener('click', (e) => {
    if (!dom.calYearDrop.hidden && !dom.calYearBtn.contains(e.target) && !dom.calYearDrop.contains(e.target)) {
      dom.calYearDrop.hidden = true;
    }
  });

  // 农历时：年份下拉
  let yearDropBase = calendarYear - 4;

  function openYearDrop() {
    yearDropBase = calendarYear - 4;
    renderYearDrop();
  }

  function renderYearDrop() {
    let html = `<div class="cal-year-nav-row"><button type="button" class="cal-year-nav" data-dir="up">‹</button><button type="button" class="cal-year-nav" data-dir="down">›</button></div>`;
    for (let y = yearDropBase; y < yearDropBase + 9; y++) {
      const cls = y === calendarYear ? 'cal-year-opt is-picked' : 'cal-year-opt';
      html += `<button type="button" class="${cls}" data-year="${y}">${y}</button>`;
    }
    dom.calYearDrop.innerHTML = html;
    dom.calYearDrop.hidden = false;
    dom.calYearDrop.querySelectorAll('.cal-year-opt').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        calendarYear = Number(btn.dataset.year);
        renderCalendar();
        dom.calYearDrop.hidden = true;
      });
    });
    dom.calYearDrop.querySelectorAll('.cal-year-nav').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        yearDropBase += btn.dataset.dir === 'up' ? -9 : 9;
        renderYearDrop();
      });
    });
  }
  // 初始化农历时控件
  buildTimeScrolls();
  initLunarPicker();

  // API 请求
  const apiBody = () => JSON.stringify({
    cast_mode: castMode,
    numbers: activeNumbers(),
    question: dom.question.value.trim(),
    wai_ying: dom.waiying.value.trim(),
  });

  async function runSSERequest(path, handler) {
    const response = await fetchApiResponse(`${API_BASE}${path}`, {
      method: 'POST',
      headers: {...API_REQUEST_HEADERS, 'Content-Type': 'application/json'},
      body: apiBody(),
    });
    if (!response.ok) throw await createHttpError(response);
    if (!response.body) {
      throw new ApiRequestError(
        API_ERROR_KIND.DISCONNECT,
        '连接中断，结果未完整返回。',
      );
    }

    // SSE 只有收到 done 才算完整；连接提前结束时提示用户重试。
    let receivedDone = false;
    const reader = response.body.getReader();
    try {
      for await (const sseEvent of streamSSE(reader)) {
        if (sseEvent.event === 'error') {
          throw new ApiRequestError(
            API_ERROR_KIND.SSE,
            parseErrorPayload(sseEvent.data) || '服务处理失败，请稍后重试。',
          );
        }
        if (sseEvent.event === 'done') receivedDone = true;
        handler(sseEvent.event, sseEvent.data);
      }
    } catch (error) {
      // 提前结束时取消读取，避免错误连接继续占用浏览器资源。
      await reader.cancel().catch(() => {});
      if (error instanceof ApiRequestError) throw error;
      throw new ApiRequestError(
        API_ERROR_KIND.DISCONNECT,
        '连接中断，结果未完整返回。',
      );
    } finally {
      reader.releaseLock();
    }

    if (!receivedDone) {
      throw new ApiRequestError(
        API_ERROR_KIND.DISCONNECT,
        '连接中断，结果未完整返回。',
      );
    }
  }

  async function createHttpError(response) {
    const errorKind = response.status === 429
      ? API_ERROR_KIND.RATE_LIMIT
      : API_ERROR_KIND.HTTP;
    const message = await readHttpErrorMessage(response);
    return new ApiRequestError(
      errorKind,
      message || httpErrorFallback(response.status),
      response.status,
    );
  }

  async function readHttpErrorMessage(response) {
    const contentType = (response.headers.get('content-type') || '').toLowerCase();
    if (contentType.includes('text/event-stream') && response.body) {
      const reader = response.body.getReader();
      try {
        for await (const sseEvent of streamSSE(reader)) {
          if (sseEvent.event === 'error') return parseErrorPayload(sseEvent.data);
        }
      } catch (_) {
        // 错误响应读取失败时回退到 HTTP 状态码。
      } finally {
        try {
          await reader.cancel();
        } catch (_) {
          // 错误响应已进入失败流程，读取器清理失败不覆盖原始错误。
        }
        reader.releaseLock();
      }
      return '';
    }

    if (!contentType.includes('json')) return '';
    try {
      return errorPayloadMessage(await response.json());
    } catch (_) {
      // 代理返回的错误页可能不是 JSON，使用 HTTP 状态码兜底。
      return '';
    }
  }

  function parseErrorPayload(rawData) {
    try {
      return errorPayloadMessage(JSON.parse(rawData));
    } catch (_) {
      return errorPayloadMessage(rawData);
    }
  }

  function errorPayloadMessage(data) {
    if (typeof data === 'string') return data.trim();
    if (!data || typeof data !== 'object') return '';
    if (typeof data.error === 'string') return data.error.trim();
    if (data.error && typeof data.error === 'object') {
      return String(data.error.message || '').trim();
    }
    return String(data.message || data.detail || '').trim();
  }

  function httpErrorFallback(status) {
    if (status === 429) return '今天已达次数上限，二十四小时后再来';
    if (status === 408 || status === 504) return '服务响应超时，请稍后重试。';
    if (status >= 500) return '服务暂时不可用，请稍后重试。';
    if (status >= 400) return '请求参数有误，请检查后重试。';
    return `HTTP ${status}`;
  }

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
    hexReady = false;
    randomCasting = false;
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
    hexReady = false;
  }

  // 起卦流程
  dom.btnQiGua.addEventListener('click', async () => {
    if (resultsLocked) return;
    if (!canCast()) return;
    if (castMode === 'lunar') {
      const lunarReady = await prepareLunarCastFromPicker();
      if (!lunarReady) {
        renderActionButtons();
        requestAnimationFrame(syncRightColumnHeight);
        return;
      }
    }
    beginQiGua();

    if (castMode === 'random') {
      randomCasting = true;
      refresh();
      await pickRandomNumbers();
    }

    castSnapshot = makeCastSnapshot();

    try {
      await runSSERequest('/api/qi-gua', handleQiGua);
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
      randomCasting = false;
      dom.btnQiGua.disabled = true;
      dom.btnJieGua.style.display = ''; dom.btnJieGua.disabled = false;
      hexReady = true;
      requestAnimationFrame(syncRightColumnHeight);
    }
  }

  function beginJieGua() {
    jieGuaAnimating = true;
    startDiviningBackground();
    if (castMode === 'random') stopRandomRoll();
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
    if (!hexReady) return;
    beginJieGua();

    try {
      await runSSERequest('/api/jie-gua', handleJieGua);
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

  // SSE 解析
  async function* streamSSE(reader) {
    const decoder = new TextDecoder(); let buffer = '', eventName = 'message', dataLines = [];
    const flush = function* () {
      if (!dataLines.length) return;
      yield {event: eventName, data: dataLines.join('\n')};
      eventName = 'message';
      dataLines = [];
    };
    const readLine = function* (rawLine) {
      const line = rawLine.replace(/\r$/, '');
      if (!line) {
        yield* flush();
        return;
      }
      if (line.startsWith(':')) return;

      const colon = line.indexOf(':');
      const field = colon === -1 ? line : line.slice(0, colon);
      let value = colon === -1 ? '' : line.slice(colon + 1);
      if (value.startsWith(' ')) value = value.slice(1);

      if (field === 'event') {
        yield* flush();
        eventName = value.trim();
      } else if (field === 'data') {
        dataLines.push(value);
      }
    };

    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        buffer += decoder.decode();
        break;
      }
      buffer += decoder.decode(value, {stream: true});
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (const line of lines) {
        yield* readLine(line);
      }
    }
    if (buffer) {
      yield* readLine(buffer);
    }
    yield* flush();
  }

  // 卦象与解卦渲染
  function renderHex(gua) {
    return `<div class="hex-col">
      <div class="gua-label">${escapeHtml(gua.label)}</div>
      <div class="gua-name">${escapeHtml(gua.name)}</div>
      <div class="gua-pair">
        <span style="color:${gua.color_shang}">${escapeHtml(gua.sym_shang)}</span>
        <span style="color:${gua.color_xia}">${escapeHtml(gua.sym_xia)}</span>
      </div>
    </div>`;
  }

  function renderHexagrams(guas) {
    hexagramsHtml = guas.map(renderHex).join('');
    dom.hexCols.innerHTML = hexagramsHtml;
    dom.hexCols.style.display = 'flex';
    updateSaveButton();
  }

  function renderGuwenDetail(guas) {
    const hasZhouYi = guas.some(gua => gua.zhou_yi);
    if (hasZhouYi) {
      guwenHtml = `<div class="gua-detail-cols">${guas.map(renderGuaDetail).join('')}</div>`;
    } else {
      guwenHtml = '';
    }
    updateResultTabs();
  }

  function renderGuaDetail(gua) {
    if (!gua.zhou_yi) return '<div class="gua-detail-col"></div>';
    const detail = gua.zhou_yi;
    return `<div class="gua-detail-col">
      <div class="gua-detail-head">
        <strong>${escapeHtml(gua.name)}</strong>
      </div>
      ${renderDetailSection('卦辞', detail.gua_ci)}
      ${renderDetailSection('彖传', detail.tuan_zhuan)}
      ${renderDetailSection('象传', detail.xiang_zhuan)}
      <div class="gua-detail-title">爻辞</div>
      <div class="yao-list">
        ${detail.yao_ci.map(renderYaoCi).join('')}
      </div>
    </div>`;
  }

  function renderDetailSection(title, text) {
    return `<div class="gua-detail-title">${escapeHtml(title)}</div>
      <p>${escapeHtml(text)}</p>`;
  }

  function renderYaoCi(yao) {
    const cls = yao.is_dong ? 'yao-item dong-yao' : 'yao-item';
    return `<div class="${cls}">
      <span>${escapeHtml(yao.yao_ming)}</span>
      <p>${escapeHtml(yao.yao_ci)}</p>
    </div>`;
  }

  function escapeHtml(value) {
    return String(value)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');
  }
