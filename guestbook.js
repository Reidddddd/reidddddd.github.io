(function (global) {
  const API_CLIENT = global.MYHS_API_CLIENT;
  if (!API_CLIENT) throw new Error('缺少 API 客户端');

  const PAGE_SIZE = 20;
  const dom = {
    form: document.getElementById('guestbookForm'),
    nickname: document.getElementById('guestbookNickname'),
    content: document.getElementById('guestbookContent'),
    charCount: document.getElementById('guestbookCharCount'),
    submit: document.getElementById('guestbookSubmit'),
    formStatus: document.getElementById('guestbookFormStatus'),
    wallStatus: document.getElementById('guestbookWallStatus'),
    entries: document.getElementById('guestbookEntries'),
    loadMore: document.getElementById('guestbookLoadMore'),
  };

  let offset = 0;
  let hasMore = true;
  let isLoading = false;

  function setStatus(element, message, type = '') {
    element.textContent = message;
    element.classList.toggle('is-success', type === 'success');
    element.classList.toggle('is-error', type === 'error');
  }

  function updateCharacterCount() {
    setStatus(dom.charCount, `${dom.content.value.length} / 500`);
  }

  function formatEntryTime(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value || '');
    return date.toLocaleString('zh-CN', {
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  function createEntryElement(entry) {
    const article = document.createElement('article');
    article.className = 'guestbook-entry';

    const line = document.createElement('div');
    line.className = 'entry-line';

    const nickname = document.createElement('strong');
    nickname.className = 'entry-nickname';
    nickname.textContent = entry.nickname || '佚名';

    const separator = document.createElement('span');
    separator.className = 'entry-separator';
    separator.textContent = '：';

    const content = document.createElement('span');
    content.className = 'entry-content';
    content.textContent = entry.content || '';

    const time = document.createElement('time');
    time.className = 'entry-time';
    time.dateTime = String(entry.created_at || '');
    time.textContent = formatEntryTime(entry.created_at);

    line.append(nickname, separator, content);
    line.append(time);
    article.append(line);
    return article;
  }

  function showEmptyState() {
    const empty = document.createElement('p');
    empty.className = 'empty-state';
    empty.textContent = '尚无笺文，静候首笺。';
    dom.entries.replaceChildren(empty);
  }

  async function loadEntries({reset = false} = {}) {
    if (isLoading || (!reset && !hasMore)) return false;

    isLoading = true;
    dom.loadMore.disabled = true;
    if (reset) {
      offset = 0;
      hasMore = true;
      dom.entries.replaceChildren();
      setStatus(dom.wallStatus, '正在载入笺文……');
    } else {
      setStatus(dom.wallStatus, '正在载入后续笺文……');
    }

    try {
      const payload = await API_CLIENT.fetchGuestbook({
        limit: PAGE_SIZE,
        offset,
      });
      const entries = Array.isArray(payload?.entries) ? payload.entries : [];

      if (reset && entries.length === 0) {
        showEmptyState();
      } else {
        const fragment = document.createDocumentFragment();
        entries.forEach(entry => {
          fragment.appendChild(createEntryElement(entry));
        });
        dom.entries.appendChild(fragment);
      }

      offset += entries.length;
      hasMore = entries.length === PAGE_SIZE;
      dom.loadMore.hidden = !hasMore;
      setStatus(dom.wallStatus, '');
      return true;
    } catch (error) {
      setStatus(
        dom.wallStatus,
        error?.message || '笺文暂时无法载入，请稍后再试。',
        'error',
      );
      return false;
    } finally {
      isLoading = false;
      dom.loadMore.disabled = false;
    }
  }

  async function submitEntry(event) {
    event.preventDefault();
    const content = dom.content.value.trim();
    if (!content) {
      setStatus(dom.formStatus, '请先书写笺文。', 'error');
      dom.content.focus();
      return;
    }

    dom.submit.disabled = true;
    dom.nickname.disabled = true;
    dom.content.disabled = true;
    setStatus(dom.formStatus, '正在投笺……');

    try {
      try {
        await API_CLIENT.createGuestbookEntry({
          nickname: dom.nickname.value.trim() || '佚名',
          content,
        });
      } catch (error) {
        setStatus(
          dom.formStatus,
          error?.message || '笺文暂时无法投递，请稍后再试。',
          'error',
        );
        return;
      }

      dom.form.reset();
      updateCharacterCount();
      const refreshed = await loadEntries({reset: true});
      setStatus(
        dom.formStatus,
        refreshed ? '笺文已留。' : '笺文已留，但笺集暂时未刷新。',
        refreshed ? 'success' : 'error',
      );
    } finally {
      dom.submit.disabled = false;
      dom.nickname.disabled = false;
      dom.content.disabled = false;
    }
  }

  dom.content.addEventListener('input', updateCharacterCount);
  dom.form.addEventListener('submit', submitEntry);
  dom.loadMore.addEventListener('click', () => loadEntries());
  updateCharacterCount();
  loadEntries({reset: true});

  global.MYHS_GUESTBOOK = Object.freeze({loadEntries});
})(window);
