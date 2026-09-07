interface DomElementInfo {
  cls?: string | string[];
  text?: string;
  attr?: Record<string, string | number | boolean | null>;
  title?: string;
  value?: string;
  type?: string;
  placeholder?: string;
  href?: string;
}

function applyInfo(el: HTMLElement, info?: DomElementInfo): void {
  if (!info) return;

  if (info.cls) {
    const classes = Array.isArray(info.cls) ? info.cls : info.cls.split(" ");
    for (const cls of classes) {
      if (cls.trim().length > 0) el.classList.add(cls.trim());
    }
  }
  if (info.text !== undefined) el.textContent = info.text;
  if (info.title !== undefined) el.setAttribute("title", info.title);
  if (info.type !== undefined) el.setAttribute("type", info.type);
  if (info.placeholder !== undefined) el.setAttribute("placeholder", info.placeholder);
  if (info.href !== undefined) el.setAttribute("href", info.href);
  if (info.value !== undefined) {
    (el as HTMLInputElement).value = info.value;
    el.setAttribute("value", info.value);
  }
  if (info.attr) {
    for (const [key, value] of Object.entries(info.attr)) {
      if (value === null) continue;
      el.setAttribute(key, `${value}`);
    }
  }
}

export function installObsidianDomHelpers(target: Window & typeof globalThis): void {
  const doc = target.document;

  const createEl = function (
    this: HTMLElement,
    tag: string,
    info?: DomElementInfo
  ): HTMLElement {
    const el = doc.createElement(tag);
    applyInfo(el, info);
    this.appendChild(el);
    return el;
  };

  const helpers: Record<string, unknown> = {
    createEl,
    createDiv(this: HTMLElement, info?: DomElementInfo): HTMLElement {
      return createEl.call(this, "div", info);
    },
    createSpan(this: HTMLElement, info?: DomElementInfo): HTMLElement {
      return createEl.call(this, "span", info);
    },
    empty(this: HTMLElement): void {
      while (this.firstChild) this.removeChild(this.firstChild);
    },
    appendText(this: HTMLElement, text: string): void {
      this.appendChild(doc.createTextNode(text));
    },
    setText(this: HTMLElement, text: string): void {
      this.textContent = text;
    },
    addClass(this: HTMLElement, ...classes: string[]): void {
      this.classList.add(...classes);
    },
    removeClass(this: HTMLElement, ...classes: string[]): void {
      this.classList.remove(...classes);
    },
    toggleClass(this: HTMLElement, classes: string | string[], value: boolean): void {
      const list = Array.isArray(classes) ? classes : [classes];
      for (const cls of list) this.classList.toggle(cls, value);
    },
    setCssStyles(this: HTMLElement, styles: Partial<CSSStyleDeclaration>): void {
      for (const [key, value] of Object.entries(styles)) {
        if (value !== undefined) {
          (this.style as unknown as Record<string, unknown>)[key] = value;
        }
      }
    },
    setCssProps(this: HTMLElement, props: Record<string, string>): void {
      for (const [key, value] of Object.entries(props)) {
        this.style.setProperty(key, value);
      }
    },
  };

  Object.assign(target.HTMLElement.prototype, helpers);
  Object.assign(target.DocumentFragment.prototype, {
    createEl,
    createDiv: helpers.createDiv,
    createSpan: helpers.createSpan,
    empty: helpers.empty,
  });

  (target as unknown as Record<string, unknown>).createEl = (tag: string, info?: DomElementInfo) => {
    const el = doc.createElement(tag);
    applyInfo(el, info);
    return el;
  };
  (target as unknown as Record<string, unknown>).createDiv = (info?: DomElementInfo) => {
    return (target as unknown as { createEl: (tag: string, info?: DomElementInfo) => HTMLElement }).createEl("div", info);
  };
  (target as unknown as Record<string, unknown>).createSpan = (info?: DomElementInfo) => {
    return (target as unknown as { createEl: (tag: string, info?: DomElementInfo) => HTMLElement }).createEl("span", info);
  };
}
