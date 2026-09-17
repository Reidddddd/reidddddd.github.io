(function (global) {
  const MAX = 3;
  const MIN = 2;
  const MODE_NAMES = Object.freeze({
    numbers: '自选数起卦',
    random: '天选数起卦',
    lunar: '农历时起卦',
    custom: '自定义起卦',
  });

  // 起卦状态与转换
  class CastStateMachine {
    constructor() {
      this._mode = 'numbers';
      this._selected = [];
      this._customCast = {shang: 1, xia: 1, dong: 1};
      this._randomPicked = [];
      this._randomCasting = false;
      this._hexReady = false;
      this._resultsLocked = false;
      this._busy = false;
    }

    get mode() {
      return this._mode;
    }

    get selected() {
      return this._selected.slice();
    }

    get customCast() {
      return {...this._customCast};
    }

    get randomPicked() {
      return this._randomPicked.slice();
    }

    get randomCasting() {
      return this._randomCasting;
    }

    get hexReady() {
      return this._hexReady;
    }

    get resultsLocked() {
      return this._resultsLocked;
    }

    get isBusy() {
      return this._busy;
    }

    get inputLocked() {
      return this._busy || this._resultsLocked;
    }

    setMode(mode) {
      if (this.inputLocked || mode === this._mode) return false;
      this._mode = mode;
      return true;
    }

    addNumber(value) {
      if (this.inputLocked || this._selected.length >= MAX) return false;
      this._selected.push(value);
      return true;
    }

    clearSelected() {
      this._selected = [];
    }

    setCustomValue(role, value) {
      if (this.inputLocked) return false;
      this._customCast[role] = value;
      return true;
    }

    setRandomCasting(value) {
      this._randomCasting = value;
    }

    addRandomNumber(value) {
      this._randomPicked.push(value);
    }

    clearRandomNumbers() {
      this._randomPicked = [];
    }

    setHexReady(value) {
      this._hexReady = value;
    }

    lock() {
      this._resultsLocked = true;
    }

    unlock() {
      this._resultsLocked = false;
    }

    setBusy(value) {
      this._busy = Boolean(value);
    }

    modeName() {
      return MODE_NAMES[this._mode] || MODE_NAMES.numbers;
    }

    activeNumbers(lunarCast) {
      if (this._mode === 'lunar') return lunarCast ? lunarCast.numbers : [];
      if (this._mode === 'random') return this.randomPicked;
      if (this._mode === 'custom') {
        return [this._customCast.shang, this._customCast.xia, this._customCast.dong];
      }
      return this.selected;
    }

    canCast({hasLunarDate = false, question = ''} = {}) {
      if (this.inputLocked) return false;
      const hasQuestion = Boolean(question.trim());
      if (this._mode === 'lunar') return hasLunarDate && hasQuestion;
      if (this._mode === 'random') return hasQuestion;
      return this.activeNumbers().length >= MIN && hasQuestion;
    }

    makeSnapshot({lunarCast, question = '', waiYing = ''} = {}) {
      return {
        mode: this.modeName(),
        numbers: this.activeNumbers(lunarCast),
        question: question.trim(),
        waiYing: waiYing.trim(),
      };
    }

    resetQiGuaProgress() {
      this._hexReady = false;
      this._randomCasting = false;
    }
  }

  // 对外暴露
  global.MYHS_CAST_STATE = Object.freeze({
    CastStateMachine,
    MAX,
    MIN,
  });
})(window);
