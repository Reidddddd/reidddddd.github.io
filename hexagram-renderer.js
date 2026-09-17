(function (global) {
  // HTML 转义
  function escapeHtml(value) {
    return String(value)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');
  }

  // 卦象与古文渲染
  class HexagramRenderer {
    renderHex(gua) {
      return `<div class="hex-col">
      <div class="gua-label">${escapeHtml(gua.label)}</div>
      <div class="gua-name">${escapeHtml(gua.name)}</div>
      <div class="gua-pair">
        <span style="color:${gua.color_shang}">${escapeHtml(gua.sym_shang)}</span>
        <span style="color:${gua.color_xia}">${escapeHtml(gua.sym_xia)}</span>
      </div>
    </div>`;
    }

    renderHexagrams(guas) {
      return guas.map(gua => this.renderHex(gua)).join('');
    }

    renderGuwenDetail(guas) {
      const hasZhouYi = guas.some(gua => gua.zhou_yi);
      if (!hasZhouYi) return '';
      return `<div class="gua-detail-cols">${guas.map(gua => this.renderGuaDetail(gua)).join('')}</div>`;
    }

    renderGuaDetail(gua) {
      if (!gua.zhou_yi) return '<div class="gua-detail-col"></div>';
      const detail = gua.zhou_yi;
      return `<div class="gua-detail-col">
      <div class="gua-detail-head">
        <strong>${escapeHtml(gua.name)}</strong>
      </div>
      ${this.renderDetailSection('卦辞', detail.gua_ci)}
      ${this.renderDetailSection('彖传', detail.tuan_zhuan)}
      ${this.renderDetailSection('象传', detail.xiang_zhuan)}
      <div class="gua-detail-title">爻辞</div>
      <div class="yao-list">
        ${detail.yao_ci.map(yao => this.renderYaoCi(yao)).join('')}
      </div>
    </div>`;
    }

    renderDetailSection(title, text) {
      return `<div class="gua-detail-title">${escapeHtml(title)}</div>
      <p>${escapeHtml(text)}</p>`;
    }

    renderYaoCi(yao) {
      const cls = yao.is_dong ? 'yao-item dong-yao' : 'yao-item';
      return `<div class="${cls}">
      <span>${escapeHtml(yao.yao_ming)}</span>
      <p>${escapeHtml(yao.yao_ci)}</p>
    </div>`;
    }
  }

  // 对外暴露
  global.MYHS_HEXAGRAM_RENDERER = Object.freeze({
    HexagramRenderer,
    escapeHtml,
  });
})(window);
