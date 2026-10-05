(function (global) {
  // 离线报告自带样式，不依赖网站资源或结果页状态。
  function stripLeadingResultTitle(html, title) {
    const pattern = new RegExp(
      '^\\s*<h[1-3][^>]*>\\s*' + escapeRegExp(title) + '\\s*</h[1-3]>\\s*',
      'i',
    );
    return String(html || '').replace(pattern, '');
  }

  function escapeRegExp(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  function buildSavedResultHtml({castSnapshot, hexagramsHtml, plainHtml, yiLiHtml, guwenHtml, escapeHtml}) {
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

  global.MYHS_SAVED_REPORT = Object.freeze({buildSavedResultHtml});
})(window);
