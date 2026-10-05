(function (global) {
  // 解卦结果状态与渲染
  class JieGuaResult {
    constructor({document, dom, escapeHtml, onSyncLayout}) {
      this.document = document;
      this.dom = dom;
      this.escapeHtml = escapeHtml;
      this.onSyncLayout = onSyncLayout;
      this.initializeState();
      this.bindEvents();
    }

    initializeState() {
      this._castSnapshot = null;
      this._hexagramsHtml = '';
      this.resetInterpretationState();
    }

    resetForCast() {
      this.initializeState();
      this.updateResultTabs();
    }

    // 重新解卦时保留当前卦象，供最终保存报告使用。
    resetForInterpretation() {
      this.resetInterpretationState();
      this.updateResultTabs();
    }

    resetInterpretationState() {
      this._plainHtml = '';
      this._yiLiHtml = '';
      this._plainStreamText = '';
      this._yiLiStreamText = '';
      this._guwenHtml = '';
      this._activeResultView = 'guwen';
    }

    setCastSnapshot(castSnapshot) {
      this._castSnapshot = castSnapshot;
      this.updateSaveButton();
    }

    setHexagramsHtml(hexagramsHtml) {
      this._hexagramsHtml = hexagramsHtml;
      this.updateSaveButton();
    }

    setGuwenHtml(guwenHtml) {
      this._guwenHtml = guwenHtml;
      this.updateResultTabs();
    }

    // 流式结果
    appendStreamText(view, data) {
      const text = this.resultPayloadText(data);
      if (!text) return;
      if (view === 'yili') {
        this._yiLiStreamText += text;
        this.renderStreamText(this._yiLiStreamText);
      } else {
        this._plainStreamText += text;
        this.renderStreamText(this._plainStreamText);
      }
    }

    renderStreamText(text) {
      this.dom.resultPlaceholder.style.display = 'none';
      this.dom.resultContent.classList.add('is-streaming');
      this.dom.resultContent.textContent = text;
      this.dom.resultContent.style.display = 'block';
      this.onSyncLayout();
    }

    renderResult(data) {
      this.dom.resultStatus.style.display = 'none';
      this.dom.resultContent.classList.remove('is-streaming');
      this._plainHtml = this.resultPayloadHtml(data);
    }

    setYiLi(data) {
      this._yiLiHtml = this.resultPayloadHtml(data);
      this.updateResultTabs();
    }

    hasPlainResult() {
      return Boolean(this._plainHtml);
    }

    // 结果标签
    resultPayloadHtml(data) {
      if (typeof data === 'string') return data;
      if (!data || typeof data !== 'object') return '';
      return data.html || data.content || data.result || data.text || '';
    }

    resultPayloadText(data) {
      if (typeof data === 'string') return data;
      if (!data || typeof data !== 'object') return '';
      return data.text || data.content || '';
    }

    resultHtmlForView(view) {
      if (view === 'guwen') return this._guwenHtml;
      if (view === 'baihua') return this._plainHtml;
      if (view === 'yili') return this._yiLiHtml;
      return '';
    }

    updateResultTabs() {
      this.dom.resultViewButtons.forEach(btn => {
        const view = btn.dataset.resultView;
        const hasContent = Boolean(this.resultHtmlForView(view));
        btn.classList.toggle('active', view === this._activeResultView);
        btn.disabled = !hasContent;
      });
      this.updateSaveButton();
    }

    canSaveResult() {
      return Boolean(
        this._castSnapshot
        && this._hexagramsHtml
        && this._plainHtml
        && this._yiLiHtml
        && this._guwenHtml,
      );
    }

    updateSaveButton() {
      if (!this.dom.btnSaveResult) return;
      this.dom.btnSaveResult.disabled = !this.canSaveResult();
    }

    revealCompleteResultTabs() {
      this.updateResultTabs();
      if (!this._plainHtml) return;
      if (this.dom.resultTools.style.display === 'none' || !this.resultHtmlForView(this._activeResultView)) {
        this.selectResultView('baihua');
      } else {
        this.selectResultView(this._activeResultView);
      }
    }

    selectResultView(view) {
      const html = this.resultHtmlForView(view);
      if (!html) {
        this.updateResultTabs();
        return;
      }
      this._activeResultView = view;
      this.updateResultTabs();
      this.dom.resultTools.style.display = 'flex';
      this.dom.resultPlaceholder.style.display = 'none';
      this.dom.resultContent.classList.remove('is-streaming');
      this.dom.resultContent.innerHTML = html;
      this.dom.resultContent.style.display = view === 'guwen' ? 'grid' : 'block';
      this.onSyncLayout();
    }

    // 保存结果
    bindEvents() {
      this.dom.resultViewButtons.forEach(btn => {
        btn.addEventListener('click', () => this.selectResultView(btn.dataset.resultView));
      });

      if (this.dom.btnSaveResult) {
        this.dom.btnSaveResult.addEventListener('click', () => this.saveCurrentResult());
      }
    }

    saveCurrentResult() {
      if (!this.canSaveResult()) return;
      const html = this.buildSavedResultHtml();
      const blob = new global.Blob([html], {type: 'text/html;charset=utf-8'});
      const url = global.URL.createObjectURL(blob);
      const link = this.document.createElement('a');
      link.href = url;
      link.download = this.safeFileName(this._castSnapshot.question) + '.html';
      this.document.body.appendChild(link);
      link.click();
      link.remove();
      global.setTimeout(() => global.URL.revokeObjectURL(url), 1000);
    }

    safeFileName(value) {
      const name = String(value || '').trim()
        .replace(/[\\/:*?"<>|\u0000-\u001f]+/g, '_')
        .replace(/\s+/g, ' ')
        .slice(0, 80)
        .trim();
      return name || '梅花易数';
    }

    buildSavedResultHtml() {
      return global.MYHS_SAVED_REPORT.buildSavedResultHtml({
        castSnapshot: this._castSnapshot,
        hexagramsHtml: this._hexagramsHtml,
        plainHtml: this._plainHtml,
        yiLiHtml: this._yiLiHtml,
        guwenHtml: this._guwenHtml,
        escapeHtml: this.escapeHtml,
      });
    }
  }

  // 对外暴露
  global.MYHS_JIE_GUA_RESULT = Object.freeze({
    JieGuaResult,
  });
})(window);
