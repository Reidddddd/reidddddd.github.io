(function (global) {
  const DIVINING_BG_SPEED = 0.43;
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

  function randomInt1To49() {
    if (global.crypto && global.crypto.getRandomValues) {
      const values = new Uint32Array(1);
      const limit = Math.floor(0x100000000 / 49) * 49;
      do {
        global.crypto.getRandomValues(values);
      } while (values[0] >= limit);
      return (values[0] % 49) + 1;
    }
    return Math.floor(Math.random() * 49) + 1;
  }

  function randomFloat(min, max) {
    if (global.crypto && global.crypto.getRandomValues) {
      const values = new Uint32Array(1);
      global.crypto.getRandomValues(values);
      return min + (values[0] / 0xffffffff) * (max - min);
    }
    return min + Math.random() * (max - min);
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

  // 只持有计时器和动画状态；起卦结果仍由 CastStateMachine 管理。
  class CastAnimations {
    constructor({dom, isRandomMode}) {
      this.dom = dom;
      this.isRandomMode = isRandomMode;
      this.randomRollTimer = null;
      this.randomTiles = [];
      this.randomRollCancel = null;
      this.backgroundFrame = null;
      this.backgroundAngle = 0;
      this.backgroundLastTime = 0;
      this.backgroundSettleCancel = null;
    }

    // 天选数滚动
    renderRandomNumberGrid() {
      this.dom.randomNumberGrid.innerHTML = Array.from({length: 49}, (_, index) =>
        `<span class="random-number-tile" data-value="${index + 1}">${index + 1}</span>`
      ).join('');
      this.randomTiles = Array.from(this.dom.randomNumberGrid.querySelectorAll('.random-number-tile'));
    }

    clearRandomTileState() {
      this.randomTiles.forEach(tile => tile.classList.remove('is-lit', 'is-final'));
    }

    lightRandomTile(value, final = false) {
      this.randomTiles.forEach(tile => {
        const active = Number(tile.dataset.value) === value;
        tile.classList.toggle('is-lit', active && !final);
        tile.classList.toggle('is-final', active && final);
      });
    }

    startRandomRoll() {
      return new Promise(resolve => {
        if (!this.isRandomMode()) { resolve(null); return; }
        this.stopRandomRoll();
        this.dom.randomCastPanel.classList.add('is-rolling');
        this.clearRandomTileState();
        let step = 0;
        let currentValue = null;
        let settled = false;
        const totalSteps = Math.round(randomFloat(RANDOM_ROLL.minSteps, RANDOM_ROLL.maxSteps));
        // 重起时主动结束当前 Promise，避免随机数流程停在 await。
        const finish = value => {
          if (settled) return;
          settled = true;
          this.randomRollTimer = null;
          if (this.randomRollCancel === cancel) this.randomRollCancel = null;
          this.dom.randomCastPanel.classList.remove('is-rolling');
          resolve(value);
        };
        const cancel = () => finish(null);
        this.randomRollCancel = cancel;
        const rollTile = () => {
          if (settled) return;
          const value = randomInt1To49();
          currentValue = value;
          this.dom.randomNumber.textContent = value;
          this.lightRandomTile(value);
          step += 1;
          if (step < totalSteps) {
            const progress = step / (totalSteps - 1);
            const eased = progress * progress;
            const delay = RANDOM_ROLL.baseDelay +
              eased * RANDOM_ROLL.slowDelay +
              randomFloat(RANDOM_ROLL.jitterMin, RANDOM_ROLL.jitterMax);
            this.randomRollTimer = setTimeout(rollTile, Math.round(delay));
          } else {
            finish(currentValue);
          }
        };
        rollTile();
      });
    }

    stopRandomRoll() {
      if (this.randomRollTimer !== null) {
        clearTimeout(this.randomRollTimer);
        this.randomRollTimer = null;
      }
      if (this.randomRollCancel) this.randomRollCancel();
      if (this.dom.randomCastPanel) this.dom.randomCastPanel.classList.remove('is-rolling');
    }

    waitBetweenRandomNumbers(signal) {
      return waitFor(Math.round(randomFloat(RANDOM_ROLL.pauseMin, RANDOM_ROLL.pauseMax)), signal);
    }

    // 解卦背景旋转与收尾
    startDiviningBackground() {
      this.stopDiviningBackground();
      if (!this.dom.bgTemple || global.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
      this.backgroundAngle = 0;
      this.backgroundLastTime = performance.now();

      const spin = now => {
        if (this.backgroundFrame === null) return;
        const delta = now - this.backgroundLastTime;
        this.backgroundAngle = (this.backgroundAngle + delta * DIVINING_BG_SPEED) % 360;
        this.dom.bgTemple.style.setProperty('--bg-rotation', `${this.backgroundAngle}deg`);
        this.backgroundLastTime = now;
        this.backgroundFrame = requestAnimationFrame(spin);
      };

      this.backgroundFrame = requestAnimationFrame(spin);
    }

    stopDiviningBackground() {
      // 收尾动画可能正被 await；取消时必须同时让它的 Promise 结束。
      if (this.backgroundSettleCancel) {
        this.backgroundSettleCancel();
        return;
      }
      if (this.backgroundFrame !== null) cancelAnimationFrame(this.backgroundFrame);
      this.backgroundFrame = null;
      this.backgroundAngle = 0;
      if (this.dom.bgTemple) this.dom.bgTemple.style.removeProperty('--bg-rotation');
    }

    settleDiviningBackground() {
      if (!this.dom.bgTemple) return Promise.resolve();
      if (this.backgroundSettleCancel) this.backgroundSettleCancel();
      if (this.backgroundFrame !== null) cancelAnimationFrame(this.backgroundFrame);
      this.backgroundFrame = null;

      const startAngle = this.backgroundAngle;
      if (!startAngle) {
        this.dom.bgTemple.style.removeProperty('--bg-rotation');
        return Promise.resolve();
      }

      const remainingAngle = 360 - startAngle;
      const targetAngle = startAngle + remainingAngle;
      const startTime = performance.now();
      const duration = Math.max(240, remainingAngle / DIVINING_BG_SPEED);

      return new Promise(resolve => {
        const finish = () => {
          if (this.backgroundFrame !== null) cancelAnimationFrame(this.backgroundFrame);
          this.backgroundFrame = null;
          this.backgroundAngle = 0;
          this.dom.bgTemple.style.removeProperty('--bg-rotation');
          if (this.backgroundSettleCancel === finish) this.backgroundSettleCancel = null;
          resolve();
        };
        this.backgroundSettleCancel = finish;
        const settle = now => {
          if (this.backgroundSettleCancel !== finish) return;
          const progress = Math.min(1, (now - startTime) / duration);
          const angle = startAngle + (targetAngle - startAngle) * progress;
          this.dom.bgTemple.style.setProperty('--bg-rotation', `${angle}deg`);
          if (progress < 1) {
            this.backgroundFrame = requestAnimationFrame(settle);
          } else {
            finish();
          }
        };

        this.backgroundFrame = requestAnimationFrame(settle);
      });
    }
  }

  global.MYHS_CAST_ANIMATIONS = Object.freeze({CastAnimations, waitFor});
})(window);
