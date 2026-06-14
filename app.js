const API_BASE = 'https://trimming-algebra-credible.ngrok-free.dev';
  const MAX = 3, MIN = 2;
  let selected = [];
  let castMode = 'numbers';
  let customCast = {shang: 1, xia: 1, dong: 1};
  let plainHtml = '';
  let yiLiHtml = '';
  let dryRunDetailHtml = '';
  let showingYiLi = false;

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
    rightCol: document.querySelector('.right-col'), lunarPanel: $('lunarPanel'),
    modeButtons: Array.from(document.querySelectorAll('[data-cast-mode]')),
    numberCastPanel: $('numberCastPanel'), lunarCastPanel: $('lunarCastPanel'),
    customCastPanel: $('customCastPanel'),
    customShangOptions: $('customShangOptions'), customXiaOptions: $('customXiaOptions'),
    customDongOptions: $('customDongOptions'),
    lunarCastSource: $('lunarCastSource'), lunarCastError: $('lunarCastError'),
    lunarShang: $('lunarShang'), lunarXia: $('lunarXia'), lunarDong: $('lunarDong'),
    lunarShangFormula: $('lunarShangFormula'), lunarXiaFormula: $('lunarXiaFormula'),
    lunarDongFormula: $('lunarDongFormula'),
  };
  let hexReady = false;
  let LUNAR_CAST = null;

  fetch(`${API_BASE}/api/lunar-data`)
    .then(r => r.json())
    .then(data => { LUNAR_CAST = data.lunar_cast; renderLunarPanel(data); refresh(); })
    .catch(() => { LUNAR_CAST = null; refresh(); });
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
  // 生成 1–49 格子
  for (let i = 1; i <= 49; i++) {
    const tile = Object.assign(document.createElement('div'), {className: 'number-tile', textContent: i});
    tile.addEventListener('click', () => {
      const idx = selected.indexOf(i);
      if (idx >= 0) { selected.splice(idx, 1); tile.classList.remove('selected'); }
      else if (selected.length < MAX) { selected.push(i); tile.classList.add('selected'); }
      if (hexReady) clearCastOutput();
      refresh();
    });
    dom.grid.appendChild(tile);
  }
  renderCustomCastOptions();

  function refresh() {
    const lunarCast = updateLunarCastPanel();
    if (castMode === 'lunar') {
      dom.castSummaryLine1.textContent = '年月日时，合数成卦';
      dom.castSummaryLine2.textContent = '';
      dom.selectedNums.textContent = lunarCast ? lunarCast.numbers.join(' ') : '';
    } else if (castMode === 'custom') {
      dom.castSummaryLine1.textContent = '自取上下卦，指定动爻';
      dom.castSummaryLine2.textContent = '';
      dom.selectedNums.textContent = activeNumbers().join(' ');
    } else {
      dom.castSummaryLine1.textContent = '大衍之数五十，其用四十有九';
      dom.castSummaryLine2.textContent = '随心取数二三，以观其象所成';
      dom.selectedNums.textContent = selected.join(' ');
    }
    const valid = canCast();
    if (!hexReady) {
      dom.btnQiGua.disabled = !valid;
      dom.btnJieGua.style.display = 'none';
    }
    requestAnimationFrame(syncRightColumnHeight);
  }

  function setCastMode(mode) {
    if (mode === castMode) return;
    castMode = mode;
    dom.modeButtons.forEach(btn => btn.classList.toggle('active', btn.dataset.castMode === mode));
    dom.numberCastPanel.hidden = mode !== 'numbers';
    dom.lunarCastPanel.hidden = mode !== 'lunar';
    dom.customCastPanel.hidden = mode !== 'custom';
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
    dom.btnQiGua.style.display = ''; dom.btnQiGua.disabled = !canCast();
    dom.btnJieGua.style.display = 'none'; dom.btnJieGua.disabled = true;
    plainHtml = '';
    yiLiHtml = '';
    dryRunDetailHtml = '';
    showingYiLi = false;
    dom.btnYiLi.textContent = '易理';
  }

  function castModeName() {
    if (castMode === 'lunar') return '农历时起卦';
    if (castMode === 'custom') return '自定义起卦';
    return '随机数起卦';
  }

  function canCast() {
    return activeNumbers().length >= MIN && Boolean(dom.question.value.trim());
  }

  function activeNumbers() {
    if (castMode === 'lunar') {
      return LUNAR_CAST ? LUNAR_CAST.numbers : [];
    }
    if (castMode === 'custom') {
      return [customCast.shang, customCast.xia, customCast.dong];
    }
    return selected.slice();
  }

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
    if (!LUNAR_CAST) {
      dom.lunarCastPanel.classList.add('is-error');
      dom.lunarCastError.textContent = '当前农历信息不足，暂时不能折算。';
      return null;
    }
    dom.lunarCastPanel.classList.remove('is-error');
    const c = LUNAR_CAST;
    dom.lunarCastSource.textContent = c.display;
    dom.lunarShang.textContent = c.numbers[0];
    dom.lunarXia.textContent = c.numbers[1];
    dom.lunarDong.textContent = c.numbers[2];
    dom.lunarShangFormula.textContent = `${c.yearShu}+${c.monthShu}+${c.dayShu}`;
    dom.lunarXiaFormula.textContent = `${c.yearShu}+${c.monthShu}+${c.dayShu}+${c.hourShu}`;
    dom.lunarDongFormula.textContent = `${c.yearShu}+${c.monthShu}+${c.dayShu}+${c.hourShu}`;
    return c;
  }

  function syncRightColumnHeight() {
    if (window.matchMedia('(max-width: 860px)').matches) {
      dom.rightCol.style.height = '';
      return;
    }
    const rightTop = dom.rightCol.getBoundingClientRect().top;
    const lunarBottom = dom.lunarPanel.getBoundingClientRect().bottom;
    const height = Math.max(0, Math.round(lunarBottom - rightTop));
    dom.rightCol.style.height = height ? `${height}px` : '';
  }

  window.addEventListener('resize', () => requestAnimationFrame(syncRightColumnHeight));
  window.addEventListener('load', () => requestAnimationFrame(syncRightColumnHeight));

  dom.btnReset.addEventListener('click', () => {
    selected = [];
    document.querySelectorAll('.number-tile.selected').forEach(tile => tile.classList.remove('selected'));
    clearCastOutput();
    refresh();
    requestAnimationFrame(syncRightColumnHeight);
  });
  dom.question.addEventListener('input', refresh);
  dom.modeButtons.forEach(btn => btn.addEventListener('click', () => setCastMode(btn.dataset.castMode)));

  const apiBody = () => JSON.stringify({
    cast_mode: castMode,
    numbers: activeNumbers(),
    question: dom.question.value.trim(),
    wai_ying: dom.waiying.value.trim(),
  });

  dom.btnQiGua.addEventListener('click', async () => {
    if (!canCast()) return;
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
    dom.btnQiGua.disabled = true;
    hexReady = false;

    try {
      const resp = await fetch(`${API_BASE}/api/qi-gua`, {method: 'POST', headers: {'Content-Type': 'application/json'}, body: apiBody()});
      for await (const sse_event of streamSSE(resp.body.getReader())) handleQiGua(sse_event.event, sse_event.data);
    } catch (error) {
      dom.statusText.textContent = '连接出错'; dom.statusDetail.textContent = error.message;
    }
  });

  function handleQiGua(event, raw) {
    let data; try { data = JSON.parse(raw); } catch (_) { data = raw; }
    if (event === 'hexagrams') {
      renderHexagrams(data.guas);
      requestAnimationFrame(syncRightColumnHeight);
    } else if (event === 'done') {
      dom.btnQiGua.disabled = true;
      dom.btnJieGua.style.display = ''; dom.btnJieGua.disabled = false;
      hexReady = true;
      requestAnimationFrame(syncRightColumnHeight);
    } else if (event === 'error') {
      dom.hexPlaceholder.style.display = ''; dom.hexPlaceholder.textContent = data;
      dom.btnQiGua.disabled = !canCast();
    }
  }

  dom.btnJieGua.addEventListener('click', async () => {
    if (!hexReady) return;
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

    try {
      const resp = await fetch(`${API_BASE}/api/jie-gua`, {method: 'POST', headers: {'Content-Type': 'application/json'}, body: apiBody()});
      for await (const sse_event of streamSSE(resp.body.getReader())) handleJieGua(sse_event.event, sse_event.data);
    } catch (error) {
      dom.statusText.textContent = '连接出错'; dom.statusDetail.textContent = error.message;
    } finally {
      dom.btnJieGua.disabled = false;
    }
  });

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
