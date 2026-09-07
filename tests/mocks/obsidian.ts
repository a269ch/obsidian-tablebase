export class TAbstractFile {
  path: string = "";
  name: string = "";
  parent: TFolder | null = null;
  vault: unknown = null;
}

export class TFile extends TAbstractFile {
  stat: { ctime: number; mtime: number; size: number } = { ctime: 0, mtime: 0, size: 0 };
  basename: string = "";
  extension: string = "";
}

export class TFolder extends TAbstractFile {
  children: TAbstractFile[] = [];
  isRoot(): boolean {
    return this.path === "" || this.path === "/";
  }
}

export class Notice {
  message: string;
  constructor(message: string) {
    this.message = message;
  }
  hide(): void {}
}

export class Component {
  load(): void {}
  onload(): void {}
  unload(): void {}
  onunload(): void {}
  addChild<T extends Component>(component: T): T {
    return component;
  }
  removeChild<T extends Component>(component: T): T {
    return component;
  }
  register(_cb: () => unknown): void {}
  registerEvent(_eventRef: unknown): void {}
  registerInterval(id: number): number {
    return id;
  }
}

export class MarkdownRenderChild extends Component {
  containerEl: HTMLElement;
  constructor(containerEl: HTMLElement) {
    super();
    this.containerEl = containerEl;
  }
}

export class Plugin extends Component {
  app: unknown;
  manifest: unknown;
  constructor(app?: unknown, manifest?: unknown) {
    super();
    this.app = app;
    this.manifest = manifest;
  }
  async loadData(): Promise<unknown> {
    return null;
  }
  async saveData(_data: unknown): Promise<void> {}
  addCommand(command: unknown): unknown {
    return command;
  }
  addSettingTab(_settingTab: unknown): void {}
  registerMarkdownPostProcessor(_postProcessor: unknown): void {}
  registerMarkdownCodeBlockProcessor(_language: string, _handler: unknown): void {}
}

export class PluginSettingTab {
  app: unknown;
  plugin: unknown;
  containerEl: HTMLElement = typeof document !== "undefined" ? document.createElement("div") : ({} as HTMLElement);
  constructor(app: unknown, plugin: unknown) {
    this.app = app;
    this.plugin = plugin;
  }
  display(): void {}
  hide(): void {}
  getSettingDefinitions(): unknown[] {
    return [];
  }
  getControlValue(_key: string): unknown {
    return undefined;
  }
  setControlValue(_key: string, _value: unknown): void {}
}

export class ButtonComponent {
  buttonEl: HTMLButtonElement;
  constructor(containerEl: HTMLElement) {
    this.buttonEl = typeof document !== "undefined" ? document.createElement("button") : ({} as HTMLButtonElement);
    containerEl?.appendChild?.(this.buttonEl);
  }
  setButtonText(text: string): this {
    if (this.buttonEl) this.buttonEl.textContent = text;
    return this;
  }
  setIcon(icon: string): this {
    if (this.buttonEl) this.buttonEl.setAttribute("data-icon", icon);
    return this;
  }
  setClass(cls: string): this {
    this.buttonEl?.classList.add(cls);
    return this;
  }
  setTooltip(tooltip: string): this {
    this.buttonEl?.setAttribute("title", tooltip);
    return this;
  }
  setCta(): this {
    this.buttonEl?.classList.add("mod-cta");
    return this;
  }
  setWarning(): this {
    this.buttonEl?.classList.add("mod-warning");
    return this;
  }
  setDestructive(): this {
    this.buttonEl?.classList.add("mod-warning", "mod-destructive");
    return this;
  }
  setDisabled(disabled: boolean): this {
    if (this.buttonEl) this.buttonEl.disabled = disabled;
    return this;
  }
  onClick(cb: (evt: MouseEvent) => unknown): this {
    this.buttonEl?.addEventListener("click", cb);
    return this;
  }
}

export class ToggleComponent {
  toggleEl: HTMLElement;
  private value = false;
  private changeCb?: (value: boolean) => unknown;
  constructor(containerEl: HTMLElement) {
    this.toggleEl = typeof document !== "undefined" ? document.createElement("div") : ({} as HTMLElement);
    this.toggleEl.className = "checkbox-container";
    containerEl?.appendChild?.(this.toggleEl);
    this.toggleEl.addEventListener("click", () => {
      this.setValue(!this.value);
      this.changeCb?.(this.value);
    });
  }
  setValue(value: boolean): this {
    this.value = value;
    if (this.value) {
      this.toggleEl?.classList.add("is-enabled");
    } else {
      this.toggleEl?.classList.remove("is-enabled");
    }
    return this;
  }
  getValue(): boolean {
    return this.value;
  }
  onChange(cb: (value: boolean) => unknown): this {
    this.changeCb = cb;
    return this;
  }
}

export class TextComponent {
  inputEl: HTMLInputElement;
  private changeCb?: (value: string) => unknown;
  constructor(containerEl: HTMLElement) {
    this.inputEl = typeof document !== "undefined" ? document.createElement("input") : ({} as HTMLInputElement);
    if (this.inputEl) {
      this.inputEl.type = "text";
    }
    containerEl?.appendChild?.(this.inputEl);
    this.inputEl.addEventListener("input", () => {
      this.changeCb?.(this.inputEl.value);
    });
  }
  setValue(value: string): this {
    if (this.inputEl) this.inputEl.value = value;
    return this;
  }
  getValue(): string {
    return this.inputEl?.value ?? "";
  }
  setPlaceholder(placeholder: string): this {
    this.inputEl?.setAttribute("placeholder", placeholder);
    return this;
  }
  onChange(cb: (value: string) => unknown): this {
    this.changeCb = cb;
    return this;
  }
}

export class TextAreaComponent {
  inputEl: HTMLTextAreaElement;
  private changeCb?: (value: string) => unknown;
  constructor(containerEl: HTMLElement) {
    this.inputEl = typeof document !== "undefined" ? document.createElement("textarea") : ({} as HTMLTextAreaElement);
    containerEl?.appendChild?.(this.inputEl);
    this.inputEl.addEventListener("input", () => {
      this.changeCb?.(this.inputEl.value);
    });
  }
  setValue(value: string): this {
    if (this.inputEl) this.inputEl.value = value;
    return this;
  }
  getValue(): string {
    return this.inputEl?.value ?? "";
  }
  setPlaceholder(placeholder: string): this {
    this.inputEl?.setAttribute("placeholder", placeholder);
    return this;
  }
  onChange(cb: (value: string) => unknown): this {
    this.changeCb = cb;
    return this;
  }
}

export class DropdownComponent {
  selectEl: HTMLSelectElement;
  private changeCb?: (value: string) => unknown;
  constructor(containerEl: HTMLElement) {
    this.selectEl = typeof document !== "undefined" ? document.createElement("select") : ({} as HTMLSelectElement);
    containerEl?.appendChild?.(this.selectEl);
    this.selectEl.addEventListener("change", () => {
      this.changeCb?.(this.selectEl.value);
    });
  }
  addOption(value: string, display: string): this {
    const opt = document.createElement("option");
    opt.value = value;
    opt.textContent = display;
    this.selectEl?.appendChild(opt);
    return this;
  }
  setValue(value: string): this {
    if (this.selectEl) this.selectEl.value = value;
    return this;
  }
  getValue(): string {
    return this.selectEl?.value ?? "";
  }
  onChange(cb: (value: string) => unknown): this {
    this.changeCb = cb;
    return this;
  }
}

export class ExtraButtonComponent {
  extraButtonEl: HTMLElement;
  constructor(containerEl: HTMLElement) {
    this.extraButtonEl = typeof document !== "undefined" ? document.createElement("div") : ({} as HTMLElement);
    containerEl?.appendChild?.(this.extraButtonEl);
  }
  setIcon(icon: string): this {
    this.extraButtonEl?.setAttribute("data-icon", icon);
    return this;
  }
  setTooltip(tooltip: string): this {
    this.extraButtonEl?.setAttribute("title", tooltip);
    return this;
  }
  setDisabled(disabled: boolean): this {
    if (disabled) {
      this.extraButtonEl?.classList.add("is-disabled");
    } else {
      this.extraButtonEl?.classList.remove("is-disabled");
    }
    return this;
  }
  onClick(cb: () => unknown): this {
    this.extraButtonEl?.addEventListener("click", cb);
    return this;
  }
}

export class Setting {
  settingEl: HTMLElement;
  infoEl: HTMLElement;
  nameEl: HTMLElement;
  descEl: HTMLElement;
  controlEl: HTMLElement;
  constructor(containerEl: HTMLElement) {
    this.settingEl = typeof document !== "undefined" ? document.createElement("div") : ({} as HTMLElement);
    this.settingEl.className = "setting-item";
    this.infoEl = typeof document !== "undefined" ? document.createElement("div") : ({} as HTMLElement);
    this.infoEl.className = "setting-item-info";
    this.nameEl = typeof document !== "undefined" ? document.createElement("div") : ({} as HTMLElement);
    this.nameEl.className = "setting-item-name";
    this.descEl = typeof document !== "undefined" ? document.createElement("div") : ({} as HTMLElement);
    this.descEl.className = "setting-item-description";
    this.infoEl.appendChild(this.nameEl);
    this.infoEl.appendChild(this.descEl);
    this.controlEl = typeof document !== "undefined" ? document.createElement("div") : ({} as HTMLElement);
    this.controlEl.className = "setting-item-control";
    this.settingEl.appendChild(this.infoEl);
    this.settingEl.appendChild(this.controlEl);
    containerEl?.appendChild?.(this.settingEl);
  }
  setName(name: string): this {
    this.nameEl.textContent = name;
    return this;
  }
  setDesc(desc: string): this {
    this.descEl.textContent = desc;
    return this;
  }
  setClass(cls: string): this {
    this.settingEl.classList.add(cls);
    return this;
  }
  setTooltip(tooltip: string): this {
    this.settingEl.setAttribute("title", tooltip);
    return this;
  }
  setHeading(): this {
    this.settingEl.classList.add("setting-item-heading");
    return this;
  }
  setDisabled(disabled: boolean): this {
    if (disabled) {
      this.settingEl.classList.add("is-disabled");
    } else {
      this.settingEl.classList.remove("is-disabled");
    }
    return this;
  }
  addText(cb: (text: TextComponent) => unknown): this {
    const comp = new TextComponent(this.controlEl);
    cb(comp);
    return this;
  }
  addTextArea(cb: (textArea: TextAreaComponent) => unknown): this {
    const comp = new TextAreaComponent(this.controlEl);
    cb(comp);
    return this;
  }
  addToggle(cb: (toggle: ToggleComponent) => unknown): this {
    const comp = new ToggleComponent(this.controlEl);
    cb(comp);
    return this;
  }
  addDropdown(cb: (dropdown: DropdownComponent) => unknown): this {
    const comp = new DropdownComponent(this.controlEl);
    cb(comp);
    return this;
  }
  addButton(cb: (button: ButtonComponent) => unknown): this {
    const comp = new ButtonComponent(this.controlEl);
    cb(comp);
    return this;
  }
  addExtraButton(cb: (extraButton: ExtraButtonComponent) => unknown): this {
    const comp = new ExtraButtonComponent(this.controlEl);
    cb(comp);
    return this;
  }
}

export class Modal {
  app: unknown;
  scope: unknown;
  containerEl: HTMLElement;
  modalEl: HTMLElement;
  titleEl: HTMLElement;
  contentEl: HTMLElement;
  constructor(app: unknown) {
    this.app = app;
    this.containerEl = typeof document !== "undefined" ? document.createElement("div") : ({} as HTMLElement);
    this.containerEl.className = "modal-container";
    this.modalEl = typeof document !== "undefined" ? document.createElement("div") : ({} as HTMLElement);
    this.modalEl.className = "modal";
    this.titleEl = typeof document !== "undefined" ? document.createElement("div") : ({} as HTMLElement);
    this.titleEl.className = "modal-title";
    this.contentEl = typeof document !== "undefined" ? document.createElement("div") : ({} as HTMLElement);
    this.contentEl.className = "modal-content";
    this.modalEl.appendChild(this.titleEl);
    this.modalEl.appendChild(this.contentEl);
    this.containerEl.appendChild(this.modalEl);
  }
  open(): void {
    if (typeof document !== "undefined") {
      document.body.appendChild(this.containerEl);
    }
    this.onOpen();
  }
  close(): void {
    this.onClose();
    this.containerEl.remove();
  }
  onOpen(): void {}
  onClose(): void {}
}
