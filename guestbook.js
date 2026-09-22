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

  function createReplyElement(reply) {
    const item = document.createElement('div');
    item.className = 'reply-item';

    const nickname = document.createElement('strong');
    nickname.className = 'reply-nickname';
    nickname.textContent = reply.nickname || '佚名';

    const separator = document.createElement('span');
    separator.textContent = '：';

    const content = document.createElement('span');
    content.className = 'reply-content';
    content.textContent = reply.content || '';

    const time = document.createElement('time');
    time.className = 'reply-time';
    time.dateTime = String(reply.created_at || '');
    time.textContent = formatEntryTime(reply.created_at);

    item.append(nickname, separator, content, time);
    return item;
  }

  async function submitReply(event, entry, form, status) {
    event.preventDefault();
    const nickname = form.elements.nickname;
    const content = form.elements.content;
    const text = content.value.trim();
    if (!text) {
      setStatus(status, '请先书写回复。', 'error');
      content.focus();
      return;
    }

    const controls = form.querySelectorAll('input, textarea, button');
    controls.forEach(control => {
      control.disabled = true;
    });
    setStatus(status, '正在投笺……');

    try {
      await API_CLIENT.createGuestbookReply(entry.id, {
        nickname: nickname.value.trim() || '佚名',
        content: text,
      });
      form.reset();
      const refreshed = await loadEntries({reset: true});
      setStatus(
        dom.wallStatus,
        refreshed ? '回复已留。' : '回复已留，但笺集暂时未刷新。',
        refreshed ? 'success' : 'error',
      );
    } catch (error) {
      setStatus(
        status,
        error?.message || '回复暂时无法投递，请稍后再试。',
        'error',
      );
    } finally {
      controls.forEach(control => {
        control.disabled = false;
      });
    }
  }

  function createReplyThread(entry, replies) {
    const thread = document.createElement('div');
    thread.className = 'reply-thread';
    thread.id = `reply-thread-${entry.id}`;

    if (replies.length) {
      const replyList = document.createElement('div');
      replyList.className = 'reply-list';
      replies.forEach(reply => {
        replyList.appendChild(createReplyElement(reply));
      });
      thread.appendChild(replyList);
    }

    const form = document.createElement('form');
    form.className = 'reply-form';

    const nickname = document.createElement('input');
    nickname.name = 'nickname';
    nickname.type = 'text';
    nickname.maxLength = 20;
    nickname.autocomplete = 'nickname';
    nickname.placeholder = '别号（自拟）';
    nickname.setAttribute('aria-label', '回复别号');

    const content = document.createElement('textarea');
    content.name = 'content';
    content.rows = 2;
    content.maxLength = 500;
    content.required = true;
    content.placeholder = '回一笺……';
    content.setAttribute('aria-label', '回复内容');

    const submit = document.createElement('button');
    submit.type = 'submit';
    submit.className = 'reply-submit';
    submit.textContent = '投笺';

    const formFields = document.createElement('div');
    formFields.className = 'reply-form-fields';
    formFields.append(nickname, content);
    form.append(formFields, submit);

    const status = document.createElement('p');
    status.className = 'reply-status';
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');
    form.addEventListener('submit', event => {
      submitReply(event, entry, form, status);
    });
    thread.append(form, status);
    return thread;
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

    const replies = Array.isArray(entry.replies) ? entry.replies : [];
    const actions = document.createElement('div');
    actions.className = 'entry-actions';

    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'reply-toggle';
    toggle.setAttribute('aria-controls', `reply-thread-${entry.id}`);
    toggle.setAttribute('aria-expanded', 'false');
    toggle.textContent = replies.length
      ? `${replies.length} 条回复 · 展开`
      : '回复';

    const thread = createReplyThread(entry, replies);
    thread.hidden = true;
    toggle.addEventListener('click', () => {
      const isHidden = thread.hidden;
      thread.hidden = !isHidden;
      toggle.setAttribute('aria-expanded', String(isHidden));
      toggle.textContent = replies.length
        ? `${replies.length} 条回复 · ${isHidden ? '收起' : '展开'}`
        : isHidden ? '收起回复' : '回复';
    });
    actions.appendChild(toggle);

    line.append(nickname, separator, content, actions, time);
    article.append(line);
    article.append(thread);
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
