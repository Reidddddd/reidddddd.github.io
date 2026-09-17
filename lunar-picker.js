(function (global) {
  const TIME_LOOP_CYCLES = 5;
  const TIME_LOOP_MID = Math.floor(TIME_LOOP_CYCLES / 2);

  // 农历日历与时间选择
  class LunarPicker {
    constructor({
      document,
      dom,
      isLocked,
      isLunarMode,
      isLunarCastRevealed,
      hasHexReady,
      onClearCastOutput,
      onHideLunarCastResult,
      onRefresh,
      onSyncLayout,
    }) {
      this.document = document;
      this.dom = dom;
      this.isLocked = isLocked;
      this.isLunarMode = isLunarMode;
      this.isLunarCastRevealed = isLunarCastRevealed;
      this.hasHexReady = hasHexReady;
      this.onClearCastOutput = onClearCastOutput;
      this.onHideLunarCastResult = onHideLunarCastResult;
      this.onRefresh = onRefresh;
      this.onSyncLayout = onSyncLayout;

      const now = new Date();
      this.lunarPickerFollowsNow = true;
      this.lunarPickerDate = now;
      this.lunarPickerHour = now.getHours();
      this.lunarPickerMinute = now.getMinutes();
      this.calendarYear = now.getFullYear();
      this.calendarMonth = now.getMonth();
      this.timeScrollBusy = false;
      this.yearDropBase = this.calendarYear - 4;
    }

    initialize() {
      this.buildTimeScrolls();
      this.bindCalendarEvents();
      this.setToNow();
      this.onHideLunarCastResult();
      this.onRefresh();
    }

    formatSolarDateTime(date) {
      const datePart = [
        String(date.getFullYear()).padStart(4, '0'),
        this.pad2(date.getMonth() + 1),
        this.pad2(date.getDate()),
      ].join('-');
      return `${datePart}T${this.pad2(date.getHours())}:${this.pad2(date.getMinutes())}`;
    }

    setToNow() {
      const now = new Date();
      this.lunarPickerDate = now;
      this.lunarPickerHour = now.getHours();
      this.lunarPickerMinute = now.getMinutes();
      this.calendarYear = now.getFullYear();
      this.calendarMonth = now.getMonth();
      this.lunarPickerFollowsNow = true;
      this.renderCalendar();
      this.setTimeScrollTo(this.lunarPickerHour, this.lunarPickerMinute);
    }

    refreshNow() {
      if (this.isLocked()) return;
      if (this.lunarPickerFollowsNow && !this.isLunarCastRevealed()) this.setToNow();
    }

    stopFollowingNow() {
      this.lunarPickerFollowsNow = false;
    }

    readSolarDateTime() {
      const date = new Date(this.lunarPickerDate);
      date.setHours(this.lunarPickerHour, this.lunarPickerMinute, 0, 0);
      return date;
    }

    pad2(value) {
      return String(value).padStart(2, '0');
    }

    // 时间滚轮
    buildTimeScrolls() {
      this.dom.hourScroll.innerHTML = this.buildTimeLoopItems(24, value => this.pad2(value));
      this.dom.minuteScroll.innerHTML = this.buildTimeLoopItems(60, value => this.pad2(value));

      this.dom.hourScroll.addEventListener('scroll', () => this.onTimeScroll('hour'), {passive: true});
      this.dom.minuteScroll.addEventListener('scroll', () => this.onTimeScroll('minute'), {passive: true});
    }

    buildTimeLoopItems(count, labelFor) {
      let html = '';
      for (let cycle = 0; cycle < TIME_LOOP_CYCLES; cycle++) {
        for (let value = 0; value < count; value++) {
          html += `<div class="time-item" data-cycle="${cycle}" data-value="${value}">${labelFor(value)}</div>`;
        }
      }
      return html;
    }

    getTimeItemHeight() {
      const item = this.dom.hourScroll.querySelector('.time-item');
      return item ? item.offsetHeight : 28.8;
    }

    setTimeScrollTo(hour, minute) {
      this.timeScrollBusy = true;
      this.scrollTimeColumnTo(this.dom.hourScroll, hour);
      this.scrollTimeColumnTo(this.dom.minuteScroll, minute);
      this.updateTimeActiveItems();
      requestAnimationFrame(() => { this.timeScrollBusy = false; });
    }

    scrollTimeColumnTo(scroll, value) {
      const item = scroll.querySelector(`[data-cycle="${TIME_LOOP_MID}"][data-value="${value}"]`);
      if (!item || !item.offsetHeight || !scroll.clientHeight) {
        scroll.scrollTop = value * this.getTimeItemHeight();
        return;
      }
      scroll.scrollTop = item.offsetTop - (scroll.clientHeight - item.offsetHeight) / 2;
    }

    onTimeScroll(which) {
      if (this.timeScrollBusy) return;
      if (this.isLocked()) {
        this.setTimeScrollTo(this.lunarPickerHour, this.lunarPickerMinute);
        return;
      }
      const scroll = which === 'hour' ? this.dom.hourScroll : this.dom.minuteScroll;
      const current = this.closestTimeItem(scroll);
      const idx = current.value;
      const maxVal = which === 'hour' ? 23 : 59;
      const val = Math.max(0, Math.min(maxVal, idx));
      if (which === 'hour') this.lunarPickerHour = val;
      else this.lunarPickerMinute = val;
      this.updateTimeActiveItems();
      this.updateLunarPickerDateFromScroll();
      this.normalizeTimeLoop(scroll, current);
    }

    closestTimeItem(scroll) {
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

    normalizeTimeLoop(scroll, current) {
      if (current.cycle > 0 && current.cycle < TIME_LOOP_CYCLES - 1) return;
      this.timeScrollBusy = true;
      this.scrollTimeColumnTo(scroll, current.value);
      requestAnimationFrame(() => { this.timeScrollBusy = false; });
    }

    updateTimeActiveItems() {
      this.dom.hourScroll.querySelectorAll('.time-item').forEach(item => {
        item.classList.toggle('is-active', Number(item.dataset.value) === this.lunarPickerHour);
      });
      this.dom.minuteScroll.querySelectorAll('.time-item').forEach(item => {
        item.classList.toggle('is-active', Number(item.dataset.value) === this.lunarPickerMinute);
      });
    }

    updateLunarPickerDateFromScroll() {
      this.lunarPickerDate = new Date(
        this.calendarYear,
        this.calendarMonth,
        this.lunarPickerDate.getDate(),
        this.lunarPickerHour,
        this.lunarPickerMinute,
      );
      if (!this.timeScrollBusy) this.lunarPickerFollowsNow = false;
    }

    // 日历与年份下拉
    bindCalendarEvents() {
      this.dom.calPrev.addEventListener('click', () => {
        if (this.isLocked()) return;
        this.dom.calYearDrop.hidden = true;
        this.calendarMonth -= 1;
        if (this.calendarMonth < 0) { this.calendarMonth = 11; this.calendarYear -= 1; }
        this.renderCalendar();
      });
      this.dom.calNext.addEventListener('click', () => {
        if (this.isLocked()) return;
        this.dom.calYearDrop.hidden = true;
        this.calendarMonth += 1;
        if (this.calendarMonth > 11) { this.calendarMonth = 0; this.calendarYear += 1; }
        this.renderCalendar();
      });
      this.dom.calYearBtn.addEventListener('click', event => {
        event.stopPropagation();
        if (this.isLocked()) return;
        if (this.dom.calYearDrop.hidden) {
          this.openYearDrop();
        } else {
          this.dom.calYearDrop.hidden = true;
        }
      });
      this.document.addEventListener('click', event => {
        if (
          !this.dom.calYearDrop.hidden &&
          !this.dom.calYearBtn.contains(event.target) &&
          !this.dom.calYearDrop.contains(event.target)
        ) {
          this.dom.calYearDrop.hidden = true;
        }
      });
    }

    renderCalendar() {
      this.dom.calYearBtn.textContent = this.calendarYear;
      this.dom.calMonthText.textContent = this.calendarMonth + 1;
      const today = new Date();
      const todayY = today.getFullYear();
      const todayM = today.getMonth();
      const todayD = today.getDate();
      const selY = this.lunarPickerDate.getFullYear();
      const selM = this.lunarPickerDate.getMonth();
      const selD = this.lunarPickerDate.getDate();

      const firstDay = new Date(this.calendarYear, this.calendarMonth, 1).getDay();
      const daysInMonth = new Date(this.calendarYear, this.calendarMonth + 1, 0).getDate();
      const daysInPrevMonth = new Date(this.calendarYear, this.calendarMonth, 0).getDate();

      let html = '';
      // 上月补位
      for (let i = firstDay - 1; i >= 0; i--) {
        const d = daysInPrevMonth - i;
        html += `<button type="button" class="cal-day is-other-month" data-day="${d}" data-month="prev">${d}</button>`;
      }
      // 当月日期
      for (let d = 1; d <= daysInMonth; d++) {
        let cls = 'cal-day';
        if (this.calendarYear === todayY && this.calendarMonth === todayM && d === todayD) cls += ' is-today';
        if (this.calendarYear === selY && this.calendarMonth === selM && d === selD) cls += ' is-selected';
        html += `<button type="button" class="${cls}" data-day="${d}" data-month="curr">${d}</button>`;
      }
      // 下月补位
      const totalCells = firstDay + daysInMonth;
      const remain = totalCells % 7 === 0 ? 0 : 7 - (totalCells % 7);
      for (let d = 1; d <= remain; d++) {
        html += `<button type="button" class="cal-day is-other-month" data-day="${d}" data-month="next">${d}</button>`;
      }

      this.dom.calDays.innerHTML = html;
      this.dom.calDays.querySelectorAll('.cal-day').forEach(btn => {
        btn.addEventListener('click', () => this.handleDayClick(btn));
      });
    }

    handleDayClick(btn) {
      if (this.isLocked()) return;
      const day = Number(btn.dataset.day);
      const monthType = btn.dataset.month;
      if (monthType === 'prev') {
        this.calendarMonth -= 1;
        if (this.calendarMonth < 0) { this.calendarMonth = 11; this.calendarYear -= 1; }
      } else if (monthType === 'next') {
        this.calendarMonth += 1;
        if (this.calendarMonth > 11) { this.calendarMonth = 0; this.calendarYear += 1; }
      }
      this.lunarPickerDate = new Date(
        this.calendarYear,
        this.calendarMonth,
        day,
        this.lunarPickerHour,
        this.lunarPickerMinute,
      );
      this.lunarPickerFollowsNow = false;
      this.renderCalendar();
      if (!this.isLunarMode()) return;
      if (this.hasHexReady()) this.onClearCastOutput();
      else this.onHideLunarCastResult();
      this.onRefresh();
      this.onSyncLayout();
    }

    openYearDrop() {
      this.yearDropBase = this.calendarYear - 4;
      this.renderYearDrop();
    }

    renderYearDrop() {
      let html = '<div class="cal-year-nav-row"><button type="button" class="cal-year-nav" data-dir="up">‹</button><button type="button" class="cal-year-nav" data-dir="down">›</button></div>';
      for (let year = this.yearDropBase; year < this.yearDropBase + 9; year++) {
        const cls = year === this.calendarYear ? 'cal-year-opt is-picked' : 'cal-year-opt';
        html += `<button type="button" class="${cls}" data-year="${year}">${year}</button>`;
      }
      this.dom.calYearDrop.innerHTML = html;
      this.dom.calYearDrop.hidden = false;
      this.dom.calYearDrop.querySelectorAll('.cal-year-opt').forEach(btn => {
        btn.addEventListener('click', event => {
          event.stopPropagation();
          if (this.isLocked()) return;
          this.calendarYear = Number(btn.dataset.year);
          this.renderCalendar();
          this.dom.calYearDrop.hidden = true;
        });
      });
      this.dom.calYearDrop.querySelectorAll('.cal-year-nav').forEach(btn => {
        btn.addEventListener('click', event => {
          event.stopPropagation();
          if (this.isLocked()) return;
          this.yearDropBase += btn.dataset.dir === 'up' ? -9 : 9;
          this.renderYearDrop();
        });
      });
    }
  }

  global.MYHS_LUNAR_PICKER = Object.freeze({
    LunarPicker,
  });
})(window);
