(function (global) {
  const {waitFor} = global.MYHS_CAST_ANIMATIONS;
  const RESULT_REVEAL_DELAY = 1000;

  // 协调请求、取消和结果展示，复用页面传入的唯一业务状态。
  class CastRequestController {
    constructor({
      dom, castState, jieGuaResult, hexagramRenderer, apiClient, animations,
      canCast, makeCastSnapshot, prepareLunarCast, pickRandomNumbers,
      onRefresh, onSyncInputLock, onSyncLayout,
    }) {
      this.dom = dom;
      this.castState = castState;
      this.jieGuaResult = jieGuaResult;
      this.hexagramRenderer = hexagramRenderer;
      this.apiClient = apiClient;
      this.animations = animations;
      this.canCast = canCast;
      this.makeCastSnapshot = makeCastSnapshot;
      this.prepareLunarCast = prepareLunarCast;
      this.pickRandomNumbers = pickRandomNumbers;
      this.onRefresh = onRefresh;
      this.onSyncInputLock = onSyncInputLock;
      this.onSyncLayout = onSyncLayout;
      this.activeOperation = null;
      this.jieGuaAnimating = false;
      this.jieGuaFinishPromise = null;
    }

    // 操作身份、输入锁定与取消
    lockCastControls() {
      this.castState.lock();
      this.onSyncInputLock();
    }

    unlockCastControls() {
      this.castState.unlock();
      this.onSyncInputLock();
    }

    beginOperation() {
      this.cancelActiveOperation();
      const operation = {controller: new AbortController()};
      this.activeOperation = operation;
      this.castState.setBusy(true);
      this.onSyncInputLock();
      return operation;
    }

    isActiveOperation(operation) {
      return this.activeOperation === operation;
    }

    finishOperation(operation) {
      if (!this.isActiveOperation(operation)) return;
      this.activeOperation = null;
      this.castState.setBusy(false);
      this.onSyncInputLock();
    }

    cancelActiveOperation() {
      const operation = this.activeOperation;
      // 先使操作失效，再中止请求，避免迟到事件或旧 finally 改写新状态。
      this.activeOperation = null;
      if (operation) operation.controller.abort();
      this.animations.stopRandomRoll();
      this.animations.stopDiviningBackground();
      this.jieGuaAnimating = false;
      this.castState.setBusy(false);
      this.onSyncInputLock();
    }

    // 请求体与错误提示
    apiBody(castSnapshot) {
      return JSON.stringify({
        cast_mode: this.castState.mode,
        numbers: castSnapshot.numbers,
        question: castSnapshot.question,
        wai_ying: castSnapshot.waiYing,
      });
    }

    requestErrorStatus(error) {
      if (error.errorKind === this.apiClient.API_ERROR_KIND.RATE_LIMIT || error.status === 429) {
        return {
          statusText: error.message || '今天已达次数上限，二十四小时后再来',
          statusDetail: '',
        };
      }
      if (error.errorKind === this.apiClient.API_ERROR_KIND.HTTP) {
        return {
          statusText: this.httpErrorStatusText(error.status),
          statusDetail: error.message,
        };
      }
      if (error.errorKind === this.apiClient.API_ERROR_KIND.SSE) {
        return {
          statusText: '服务处理失败',
          statusDetail: error.message || '服务暂时不可用，请稍后重试。',
        };
      }
      if (error.errorKind === this.apiClient.API_ERROR_KIND.NETWORK) {
        return {
          statusText: '连接失败',
          statusDetail: error.message,
        };
      }
      if (error.errorKind === this.apiClient.API_ERROR_KIND.DISCONNECT) {
        return {
          statusText: '连接中断',
          statusDetail: '本次结果未完整返回，请保持本页面打开并保持网络连接后重试。',
        };
      }
      if (error.errorKind === this.apiClient.API_ERROR_KIND.CONTRACT) {
        return {
          statusText: '接口版本不匹配',
          statusDetail: '请刷新页面后重试。',
        };
      }
      if (error.errorKind === this.apiClient.API_ERROR_KIND.CANCELLED) {
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

    httpErrorStatusText(status) {
      if (status === 400) return '请求参数有误';
      if (status === 401 || status === 403) return '请求未获允许';
      if (status === 404) return '服务接口不存在';
      if (status === 408 || status === 504) return '服务响应超时';
      if (status >= 500) return '服务暂时不可用';
      return `请求失败（HTTP ${status}）`;
    }

    showRequestErrorStatus(error) {
      this.renderErrorStatus(this.requestErrorStatus(error));
    }

    renderErrorStatus(errorStatus) {
      this.dom.statusNotice.hidden = false;
      this.dom.statusReminder.hidden = true;
      this.dom.statusSpinner.classList.remove('active');
      this.dom.resultStatus.style.display = '';
      this.dom.resultContent.classList.remove('is-streaming');
      this.dom.resultContent.style.display = 'none';
      this.dom.statusText.textContent = errorStatus.statusText;
      this.dom.statusDetail.textContent = errorStatus.statusDetail;
    }

    // 起卦与返回事件
    resetQiGuaErrorState() {
      this.castState.resetQiGuaProgress();
      this.jieGuaResult.resetForCast();
      this.dom.hexCols.style.display = 'none';
      this.dom.hexCols.innerHTML = '';
      this.dom.hexPlaceholder.style.display = '';
      this.dom.hexPlaceholder.textContent = `${this.castState.modeName()}后，卦象显示于此`;
    }

    beginQiGua() {
      this.dom.hexPlaceholder.style.display = 'none';
      this.jieGuaResult.resetForCast();
      this.dom.resultContent.style.display = 'none';
      this.dom.resultContent.textContent = '';
      this.dom.resultPlaceholder.style.display = '';
      this.dom.resultStatus.style.display = 'none';
      this.dom.statusNotice.hidden = true;
      this.dom.statusReminder.hidden = false;
      this.dom.statusSpinner.classList.add('active');
      this.dom.resultTools.style.display = 'none';
      this.castState.setHexReady(false);
    }

    async cast() {
      if (this.castState.inputLocked) return;
      if (!this.canCast()) return;
      const operation = this.beginOperation();

      try {
        if (this.castState.mode === 'lunar') {
          const lunarReady = await this.prepareLunarCast(operation);
          if (!lunarReady || !this.isActiveOperation(operation)) {
            this.onSyncLayout();
            return;
          }
        }
        this.beginQiGua();

        if (this.castState.mode === 'random') {
          this.castState.setRandomCasting(true);
          this.onRefresh();
          const randomReady = await this.pickRandomNumbers(operation);
          if (!randomReady || !this.isActiveOperation(operation)) return;
        }

        const castSnapshot = this.makeCastSnapshot();
        this.jieGuaResult.setCastSnapshot(castSnapshot);

        await this.apiClient.runSSERequest(
          '/api/qi-gua',
          this.apiBody(castSnapshot),
          (event, raw) => {
            if (this.isActiveOperation(operation)) this.handleQiGua(event, raw);
          },
          {signal: operation.controller.signal},
        );
      } catch (error) {
        if (!this.isActiveOperation(operation)) return;
        this.showRequestErrorStatus(error);
        this.resetQiGuaErrorState();
        this.onRefresh();
      } finally {
        this.finishOperation(operation);
      }
    }

    handleQiGua(event, raw) {
      let data; try { data = JSON.parse(raw); } catch (_) { data = raw; }
      if (event === 'hexagrams') {
        this.renderHexagrams(data.guas);
        this.onSyncLayout();
      } else if (event === 'done') {
        this.castState.setRandomCasting(false);
        this.castState.setHexReady(true);
        this.onSyncLayout();
      }
    }

    // 解卦与动画收尾
    beginJieGua() {
      this.jieGuaAnimating = true;
      this.animations.startDiviningBackground();
      if (this.castState.mode === 'random') this.animations.stopRandomRoll();
      this.dom.resultPlaceholder.style.display = 'none';
      this.dom.statusNotice.hidden = false;
      this.dom.statusReminder.hidden = false;
      this.dom.resultStatus.style.display = '';
      this.dom.statusSpinner.classList.add('active');
      this.dom.statusText.textContent = '正在解卦，请稍候……';
      this.dom.statusDetail.textContent = '';
      this.dom.resultTools.style.display = 'none';
      this.jieGuaResult.resetForInterpretation();
      this.jieGuaFinishPromise = null;
    }

    finishJieGua({showResult = true, statusText = '', statusDetail = ''} = {}) {
      const operation = this.activeOperation;
      if (!operation) return Promise.resolve();
      if (this.jieGuaFinishPromise) return this.jieGuaFinishPromise;
      if (showResult) this.dom.statusNotice.hidden = true;
      this.jieGuaFinishPromise = (async () => {
        await this.animations.settleDiviningBackground();
        if (!this.isActiveOperation(operation)) return;
        this.jieGuaAnimating = false;
        if (showResult) {
          this.dom.statusReminder.hidden = false;
          this.dom.statusSpinner.classList.add('active');
          this.dom.resultStatus.style.display = 'none';
          this.lockCastControls();
          const ready = await waitFor(RESULT_REVEAL_DELAY, operation.controller.signal);
          if (!ready || !this.isActiveOperation(operation)) return;
          this.jieGuaResult.revealCompleteResultTabs();
        } else {
          this.renderErrorStatus({statusText, statusDetail});
        }
      })().catch(error => {
        if (!this.isActiveOperation(operation)) return;
        console.error('解读结果展示失败', error);
        this.animations.stopDiviningBackground();
        this.jieGuaAnimating = false;
        this.unlockCastControls();
        this.renderErrorStatus({
          statusText: '解读暂时不可用',
          statusDetail: '解读结果展示失败，请稍后重试。',
        });
      });
      return this.jieGuaFinishPromise;
    }

    renderJieGuaProgress(data) {
      this.dom.statusNotice.hidden = false;
      this.dom.statusReminder.hidden = false;
      this.dom.resultStatus.style.display = '';
      this.dom.statusSpinner.classList.add('active');
      this.dom.statusText.textContent = data;
      this.dom.statusDetail.textContent = '';
    }

    showJieGuaError(error) {
      const errorStatus = this.requestErrorStatus(error);
      return this.finishJieGua({
        showResult: false,
        statusText: errorStatus.statusText,
        statusDetail: errorStatus.statusDetail,
      });
    }

    async interpret() {
      if (this.castState.inputLocked || !this.castState.hexReady) return;
      const operation = this.beginOperation();

      try {
        this.beginJieGua();
        // 请求与保存报告共用当次输入，避免保留起卦时的旧问题和外应。
        const castSnapshot = this.makeCastSnapshot();
        this.jieGuaResult.setCastSnapshot(castSnapshot);
        await this.apiClient.runSSERequest(
          '/api/jie-gua',
          this.apiBody(castSnapshot),
          (event, raw) => {
            if (this.isActiveOperation(operation)) this.handleJieGua(event, raw);
          },
          {signal: operation.controller.signal},
        );
        if (!this.isActiveOperation(operation)) return;
        this.finishJieGuaWhenReady();
        if (this.jieGuaFinishPromise) {
          await this.jieGuaFinishPromise;
        } else {
          await this.finishJieGua({
            showResult: false,
            statusText: '返回不完整',
            statusDetail: '解卦结果缺少白话或易理内容',
          });
        }
      } catch (error) {
        if (!this.isActiveOperation(operation)) return;
        if (this.jieGuaFinishPromise) {
          await this.jieGuaFinishPromise;
        } else {
          await this.showJieGuaError(error);
        }
      } finally {
        this.finishOperation(operation);
      }
    }

    handleJieGua(event, raw) {
      let data; try { data = JSON.parse(raw); } catch (_) { data = raw; }
      if (event === 'hexagrams') {
        this.renderHexagrams(data.guas);
        this.renderGuwenDetail(data.guas);
      } else if (event === 'progress') {
        this.renderJieGuaProgress(data);
      } else if (event === 'thinking') {
        this.renderJieGuaProgress(data);
      } else if (event === 'yi_li_chunk') {
        this.jieGuaResult.appendStreamText('yili', data);
      } else if (event === 'result_chunk') {
        this.jieGuaResult.appendStreamText('baihua', data);
      } else if (event === 'result') {
        this.jieGuaResult.renderResult(data);
      } else if (event === 'yi_li') {
        this.jieGuaResult.setYiLi(data);
      }
    }

    finishJieGuaWhenReady() {
      if (this.jieGuaResult.hasPlainResult()) this.finishJieGua();
    }

    renderHexagrams(guas) {
      const html = this.hexagramRenderer.renderHexagrams(guas);
      this.jieGuaResult.setHexagramsHtml(html);
      this.dom.hexCols.innerHTML = html;
      this.dom.hexCols.style.display = 'flex';
    }

    renderGuwenDetail(guas) {
      const html = this.hexagramRenderer.renderGuwenDetail(guas);
      this.jieGuaResult.setGuwenHtml(html);
    }
  }

  global.MYHS_CAST_REQUEST_CONTROLLER = Object.freeze({CastRequestController});
})(window);
