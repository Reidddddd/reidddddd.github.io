// 控制流程测试用的最小 DOM，支持表单、节点替换和事件，不模拟布局。
class Element {
  constructor(tag = 'div') {
    this.tagName = tag.toUpperCase();
    this.children = [];
    this.parentNode = null;
    this.dataset = {};
    this.events = new Map();
    this.className = '';
    this.textContent = '';
    this.value = '';
    this.disabled = false;
    this.style = {setProperty() {}, removeProperty() {}};
    this.classList = {
      contains: name => this.className.split(' ').includes(name),
      toggle: (name, enabled) => {
        const classes = new Set(this.className.split(' ').filter(Boolean));
        const shouldEnable = enabled ?? !classes.has(name);
        if (shouldEnable) classes.add(name);
        else classes.delete(name);
        this.className = [...classes].join(' ');
        return shouldEnable;
      },
      add: (...names) => names.forEach(name => this.classList.toggle(name, true)),
      remove: (...names) => names.forEach(name => this.classList.toggle(name, false)),
    };
  }

  addEventListener(type, callback) {
    this.events.set(type, callback);
  }

  append(...children) {
    for (const child of children) {
      if (child.tagName === '#DOCUMENT-FRAGMENT') {
        this.append(...child.children);
        continue;
      }
      child.remove();
      child.parentNode = this;
      this.children.push(child);
    }
  }

  appendChild(child) {
    this.append(child);
    return child;
  }

  replaceChildren(...children) {
    this.children.forEach(child => { child.parentNode = null; });
    this.children = [];
    this.append(...children);
  }

  remove() {
    if (!this.parentNode) return;
    const siblings = this.parentNode.children;
    siblings.splice(siblings.indexOf(this), 1);
    this.parentNode = null;
  }

  setAttribute(name, value) {
    this[name] = value;
  }

  querySelectorAll(selector) {
    const descendants = this.children.flatMap(child => [child, ...child.querySelectorAll('*')]);
    return descendants.filter(child => selector.split(',').some(part => {
      const value = part.trim();
      if (value === '*') return true;
      if (value.startsWith('.')) return child.classList.contains(value.slice(1));
      return child.tagName.toLowerCase() === value;
    }));
  }

  querySelector(selector) {
    return this.querySelectorAll(selector)[0] || null;
  }

  get elements() {
    return Object.fromEntries(this.querySelectorAll('input, textarea')
      .map(child => [child.name, child]));
  }

  get isConnected() {
    return this.tagName === 'BODY' || Boolean(this.parentNode?.isConnected);
  }

  reset() {
    this.querySelectorAll('input, textarea').forEach(child => { child.value = ''; });
  }

  focus() {}
}

function createDocument() {
  const elements = new Map();
  const body = new Element('body');
  return {
    body,
    createElement: tag => new Element(tag),
    createDocumentFragment: () => new Element('#document-fragment'),
    getElementById(id) {
      if (!elements.has(id)) {
        const element = new Element();
        elements.set(id, element);
        body.appendChild(element);
      }
      return elements.get(id);
    },
    querySelectorAll: selector => body.querySelectorAll(selector),
    querySelector: selector => body.querySelector(selector),
  };
}

module.exports = {createDocument};
