// 配置与全局状态
const API_BASE = 'https://trimming-algebra-credible.ngrok-free.dev';
  const MAX = 3, MIN = 2;
  let selected = [];
  let castMode = 'numbers';
  let customCast = {shang: 1, xia: 1, dong: 1};
  let plainHtml = '';
  let yiLiHtml = '';
  let dryRunDetailHtml = '';
  let showingYiLi = false;

  // DOM 引用
  const $ = id => document.getElementById(id);
  const dom = {
    grid: $('numberGrid'),
    btnQiGua: $('btnQiGua'), btnJieGua: $('btnJieGua'), btnReset: $('btnReset'),
    selectedNums: $('selectedNums'),
    castSummaryLine1: $('castSummaryLine1'), castSummaryLine2: $('castSummaryLine2'),
    question: $('question'), waiying: $('waiying'),
    hexPlaceholder: $('hexPlaceholder'), hexCols: $('hexCols'),
    resultPlaceholder: $('resultPlaceholder'), resultContent: $('resultContent'),
    resultStatus: $('resultStatus'), resultTools: $('resultTools'), btnYiLi: $('btnYiLi'),
    statusText: $('statusText'), statusDetail: $('statusDetail'),
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
  };
  // 起卦状态
  let hexReady = false;
  let randomCasting = false;
  let randomPicked = [];
  let randomTimer = null;
  let randomTiles = [];
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
  fetch(`${API_BASE}/api/lunar-data`, {headers: {'ngrok-skip-browser-warning': '1'}})
    .then(r => r.json())
    .then(data => { renderLunarPanel(data); requestAnimationFrame(syncRightColumnHeight); })
    .catch(() => {});

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
      dom.castSummaryLine1.textContent = '自取上下卦，指定动爻';
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

  function setCastMode(mode) {
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

  function clearCastOutput() {
    hexReady = false;
    dom.hexCols.style.display = 'none'; dom.hexCols.innerHTML = '';
    dom.hexPlaceholder.style.display = '';
    dom.hexPlaceholder.textContent = `${castModeName()}后，卦象显示于此`;
    dom.resultContent.style.display = 'none'; dom.resultContent.textContent = '';
    dom.resultPlaceholder.style.display = '';
    dom.resultPlaceholder.textContent = `${castModeName()}后，解卦结果显示于此`;
    dom.resultStatus.style.display = 'none';
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
    dryRunDetailHtml = '';
    showingYiLi = false;
    dom.btnYiLi.textContent = '易理';
  }

  function castModeName() {
    if (castMode === 'lunar') return '农历时起卦';
    if (castMode === 'custom') return '自定义起卦';
    if (castMode === 'random') return '天选数起卦';
    return '自选数起卦';
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
  const GAN = ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬', '癸'];
  const BRANCHES = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'];
  const BRANCH_SHU = BRANCHES.reduce((acc, branch, index) => {
    acc[branch] = index + 1;
    return acc;
  }, {});
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

  function prepareLunarCastFromPicker() {
    const date = readSolarDateTime();
    if (!date) {
      showLunarError('请选择有效的公历日期和时刻。');
      return false;
    }
    const data = buildLunarData(date);
    if (!data) {
      showLunarError('当前浏览器暂不支持农历换算。');
      return false;
    }
    LUNAR_CAST = data.lunar_cast;
    lunarCastRevealed = true;
    lunarPickerFollowsNow = false;
    updateLunarCastPanel();
    refresh();
    requestAnimationFrame(syncRightColumnHeight);
    return true;
  }

  function buildLunarData(date) {
    let parts;
    try {
      parts = new Intl.DateTimeFormat('zh-CN-u-ca-chinese', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      }).formatToParts(date);
    } catch (_) {
      return null;
    }

    const relatedYear = Number(lunarPart(parts, 'relatedYear')) || date.getFullYear();
    const monthText = lunarPart(parts, 'month');
    const dayText = lunarPart(parts, 'day');
    const monthShu = parseLunarMonth(monthText);
    const dayShu = parseChineseNumber(dayText);
    const yearName = lunarPart(parts, 'yearName') || readLunarYearName(date) || sexagenaryYearName(relatedYear);
    const yearBranch = yearName.slice(-1);
    const yearShu = BRANCH_SHU[yearBranch];
    const hourBranch = hourBranchName(date.getHours());
    const hourShu = BRANCH_SHU[hourBranch];
    if (!monthShu || !dayShu || !yearShu || !hourShu) return null;

    const minuteShu = date.getMinutes();
    const monthLabel = monthText || `${monthShu}月`;
    const dayLabel = Number.isInteger(Number(dayText)) ? chineseDayName(dayShu) : dayText;
    const shangTotal = yearShu + monthShu + dayShu;
    const xiaTotal = shangTotal + hourShu;
    const dongTotal = xiaTotal + minuteShu;
    const numbers = [modShu(shangTotal, 8), modShu(xiaTotal, 8), modShu(dongTotal, 6)];
    const solarDisplay = `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日 ${pad2(date.getHours())}:${pad2(date.getMinutes())}`;

    return {
      lunar_cast: {
        display: `${yearName}年 ${monthLabel}${dayLabel} ${hourBranch}时`,
        solarDisplay,
        yearShu,
        monthShu,
        dayShu,
        hourShu,
        minuteShu,
        numbers,
      },
    };
  }

  function lunarPart(parts, type) {
    const part = parts.find(item => item.type === type);
    return part ? part.value : '';
  }

  function readLunarYearName(date) {
    try {
      const text = new Intl.DateTimeFormat('zh-CN-u-ca-chinese', {dateStyle: 'full'}).format(date);
      const match = text.match(/[甲乙丙丁戊己庚辛壬癸][子丑寅卯辰巳午未申酉戌亥]/);
      return match ? match[0] : '';
    } catch (_) {
      return '';
    }
  }

  function sexagenaryYearName(year) {
    const index = positiveMod(year - 1984, 60);
    return `${GAN[index % 10]}${BRANCHES[index % 12]}`;
  }

  function parseLunarMonth(value) {
    const clean = String(value || '').replace(/^闰/, '').replace('月', '').trim();
    const aliases = {正: 1, 冬: 11, 腊: 12};
    return aliases[clean] || parseChineseNumber(clean);
  }

  function parseChineseNumber(value) {
    const text = String(value || '').replace(/[日月]/g, '').trim();
    if (/^\d+$/.test(text)) return Number(text);
    const digits = {一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 零: 0};
    if (digits[text]) return digits[text];
    if (text.startsWith('初')) return digits[text.slice(1)] || 0;
    if (text === '廿') return 20;
    if (text.startsWith('廿')) return 20 + (digits[text.slice(1)] || 0);
    if (text === '卅') return 30;
    if (text.startsWith('卅')) return 30 + (digits[text.slice(1)] || 0);
    if (text.includes('十')) {
      const [left, right] = text.split('十');
      const tens = left ? digits[left] : 1;
      return (tens || 1) * 10 + (right ? (digits[right] || 0) : 0);
    }
    return 0;
  }

  function chineseDayName(day) {
    const names = ['', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十'];
    if (day <= 10) return `初${names[day]}`;
    if (day < 20) return `十${names[day - 10]}`;
    if (day === 20) return '二十';
    if (day < 30) return `廿${names[day - 20]}`;
    return day === 30 ? '三十' : String(day);
  }

  function hourBranchName(hour) {
    return BRANCHES[Math.floor(((hour + 1) % 24) / 2)];
  }

  function modShu(total, modulo) {
    const rest = total % modulo;
    return rest === 0 ? modulo : rest;
  }

  function positiveMod(value, modulo) {
    return ((value % modulo) + modulo) % modulo;
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

  dom.btnReset.addEventListener('click', () => {
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
    dom.calYearDrop.hidden = true;
    calendarMonth -= 1;
    if (calendarMonth < 0) { calendarMonth = 11; calendarYear -= 1; }
    renderCalendar();
  });
  dom.calNext.addEventListener('click', () => {
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
    const resp = await fetch(`${API_BASE}${path}`, {method: 'POST', headers: {'Content-Type': 'application/json', 'ngrok-skip-browser-warning': '1'}, body: apiBody()});
    for await (const sse_event of streamSSE(resp.body.getReader())) handler(sse_event.event, sse_event.data);
  }

  function resetQiGuaErrorState() {
    randomCasting = false;
    dom.btnQiGua.disabled = !canCast();
    dom.btnJieGua.style.display = 'none';
    dom.btnJieGua.disabled = true;
  }

  // 起卦流程
  dom.btnQiGua.addEventListener('click', async () => {
    if (!canCast()) return;
    if (castMode === 'lunar' && !prepareLunarCastFromPicker()) {
      refresh();
      return;
    }
    dom.hexPlaceholder.style.display = 'none';
    dom.resultContent.style.display = 'none'; dom.resultContent.textContent = '';
    dom.resultPlaceholder.style.display = '';
    dom.resultStatus.style.display = 'none';
    dom.resultTools.style.display = 'none';
    plainHtml = '';
    yiLiHtml = '';
    dryRunDetailHtml = '';
    showingYiLi = false;
    dom.btnYiLi.textContent = '易理';
    hexReady = false;

    if (castMode === 'random') {
      randomCasting = true;
      refresh();
      await pickRandomNumbers();
    }

    try {
      await runSSERequest('/api/qi-gua', handleQiGua);
    } catch (error) {
      dom.statusText.textContent = '连接出错'; dom.statusDetail.textContent = error.message;
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
    } else if (event === 'error') {
      dom.hexPlaceholder.style.display = ''; dom.hexPlaceholder.textContent = data;
      resetQiGuaErrorState();
    }
  }

  function beginJieGua() {
    if (castMode === 'random') stopRandomRoll();
    dom.resultPlaceholder.style.display = 'none';
    dom.resultStatus.style.display = 'flex';
    dom.statusText.textContent = '正在解卦，请稍候……';
    dom.statusDetail.textContent = '';
    dom.resultTools.style.display = 'none';
    plainHtml = '';
    yiLiHtml = '';
    dryRunDetailHtml = '';
    showingYiLi = false;
    dom.btnYiLi.textContent = '易理';
    dom.btnJieGua.disabled = true;
  }

  function finishJieGua() {
    dom.btnJieGua.disabled = false;
  }

  // 解卦流程
  dom.btnJieGua.addEventListener('click', async () => {
    if (!hexReady) return;
    beginJieGua();

    try {
      await runSSERequest('/api/jie-gua', handleJieGua);
    } catch (error) {
      dom.statusText.textContent = '连接出错'; dom.statusDetail.textContent = error.message;
    } finally {
      finishJieGua();
    }
  });

  // 解卦 SSE 事件
  function handleJieGua(event, raw) {
    let data; try { data = JSON.parse(raw); } catch (_) { data = raw; }
    if (event === 'hexagrams') {
      renderHexagrams(data.guas);
      renderDryRunDetail(data.guas);
    } else if (event === 'progress') {
      dom.statusDetail.textContent = dom.statusText.textContent;
      dom.statusText.textContent = data;
    } else if (event === 'result') {
      dom.resultStatus.style.display = 'none';
      if (!data && dryRunDetailHtml) {
        plainHtml = dryRunDetailHtml;
        data = dryRunDetailHtml;
      } else {
        plainHtml = data;
      }
      showingYiLi = false;
      dom.btnYiLi.textContent = '易理';
      dom.resultContent.innerHTML = data;
      dom.resultContent.style.display = 'block';
      requestAnimationFrame(syncRightColumnHeight);
    } else if (event === 'yi_li') {
      yiLiHtml = data;
      if (yiLiHtml) dom.resultTools.style.display = 'flex';
    } else if (event === 'error') {
      dom.statusText.textContent = '出错'; dom.statusDetail.textContent = data;
    } else if (event === 'done') {
      dom.resultStatus.style.display = 'none';
    }
  }

  dom.btnYiLi.addEventListener('click', () => {
    if (showingYiLi) {
      if (!plainHtml) return;
      dom.resultContent.innerHTML = plainHtml;
      showingYiLi = false;
      dom.btnYiLi.textContent = '易理';
    } else {
      if (!yiLiHtml) return;
      dom.resultContent.innerHTML = yiLiHtml;
      showingYiLi = true;
      dom.btnYiLi.textContent = '白话';
    }
    dom.resultContent.style.display = 'block';
    requestAnimationFrame(syncRightColumnHeight);
  });

  // SSE 解析
  async function* streamSSE(reader) {
    const decoder = new TextDecoder(); let buffer = '', event_name = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, {stream: true});
      const lines = buffer.split('\n'); buffer = lines.pop() || '';
      for (const line of lines) {
        if (line.startsWith('event: ')) event_name = line.slice(7).trim();
        else if (line.startsWith('data: ') && event_name) { yield {event: event_name, data: line.slice(6)}; event_name = ''; }
      }
    }
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
    dom.hexCols.innerHTML = guas.map(renderHex).join('');
    dom.hexCols.style.display = 'flex';
  }

  function renderDryRunDetail(guas) {
    const hasZhouYi = guas.some(gua => gua.zhou_yi);
    if (hasZhouYi) {
      dryRunDetailHtml = `<div class="gua-detail-cols">${guas.map(renderGuaDetail).join('')}</div>`;
      plainHtml = dryRunDetailHtml;
      showingYiLi = false;
      dom.resultPlaceholder.style.display = 'none';
      dom.resultContent.innerHTML = dryRunDetailHtml;
      dom.resultContent.style.display = 'block';
      dom.resultTools.style.display = 'none';
    } else {
      dryRunDetailHtml = '';
    }
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
