import { appendIcon } from "../utils/dom";
import { Disposable, DisposableRegistry } from "../utils/lifecycle";
import { ICON_NARROW_MODE, ICON_WIDE_MODE } from "./icons";

const WIDE_MODE_PAGE_SELECTOR =
  ".callout-content, .markdown-embed-content, .markdown-preview-view, .cm-scroller, .view-content";
const WIDE_MODE_HOST_ANCESTOR_SELECTOR =
  ".el-table, .table-wrapper, .el-pre, .cm-embed-block, .cm-preview-code-block";
const WIDE_MODE_HOST_CLASS = "ms-wide-mode-host";
const WIDE_MODE_CLASS = "is-wide-mode";
const WIDE_MODE_AVAILABLE = "data-ms-wide-available";
const MIN_LEFT_GUTTER_PX = 28;
const MIN_RIGHT_GUTTER_PX = 20;
const MIN_WIDTH_GAIN_PX = 48;

function isResizeObserverCtor(value: unknown): value is typeof ResizeObserver {
  return typeof value === "function";
}

function getResizeObserver(win: Window | null): typeof ResizeObserver | null {
  if (win && "ResizeObserver" in win && isResizeObserverCtor(win.ResizeObserver)) {
    return win.ResizeObserver;
  }
  return typeof ResizeObserver !== "undefined" ? ResizeObserver : null;
}

export function createWideModeToggleButton(
  parent: HTMLElement,
  isWide: boolean,
  onToggle: () => void
): HTMLButtonElement {
  const title = isWide ? "Switch to narrow mode" : "Switch to wide mode";
  const button = parent.createEl("button", {
    cls: `ms-db-action-btn ms-wide-mode-btn ${isWide ? "is-active" : ""}`,
    title,
    attr: {
      type: "button",
      "aria-label": "Wide mode",
      "aria-pressed": isWide ? "true" : "false",
      "data-wide-mode": isWide ? "true" : "false",
    },
  });
  appendIcon(button, isWide ? ICON_NARROW_MODE : ICON_WIDE_MODE);
  button.addEventListener("click", (e) => {
    e.stopPropagation();
    onToggle();
  });
  return button;
}

/**
 * Expands only this table/board container across its enclosing note pane
 * without modifying Obsidian's global Readable Line Length setting or siblings.
 */
export class WideModeController implements Disposable {
  private readonly containerEl: HTMLElement;
  private readonly layoutRegistry = new DisposableRegistry();
  private hostEls: HTMLElement[] = [];
  private lastWidthProp = "";
  private lastOffsetProp = "";

  constructor(containerEl: HTMLElement) {
    this.containerEl = containerEl;
  }

  public sync(isWide: boolean): void {
    this.containerEl.classList.toggle(WIDE_MODE_CLASS, isWide);
    this.updateLayout();

    if (this.layoutRegistry.size > 0) return;

    // The first render can run before Obsidian inserts the table into the note.
    let cancelled = false;
    this.layoutRegistry.addFn(() => {
      cancelled = true;
    });

    if (typeof queueMicrotask === "function") {
      queueMicrotask(() => {
        if (cancelled) return;
        this.updateLayout();
      });
    }

    const win = this.getWindow();
    if (win) {
      this.layoutRegistry.listen(win, "resize", () => this.updateLayout());
      if (typeof win.requestAnimationFrame === "function") {
        const frame = win.requestAnimationFrame(() => this.attachObservers());
        this.layoutRegistry.addFn(() => win.cancelAnimationFrame(frame));
      }
    }
  }

  public dispose(): void {
    this.layoutRegistry.disposeAll();
    this.containerEl.classList.remove(WIDE_MODE_CLASS);
    this.containerEl.removeAttribute(WIDE_MODE_AVAILABLE);
    this.clearHostClass();
    this.clearCustomProperties();
  }

  private getWindow(): Window | null {
    return this.containerEl.ownerDocument?.defaultView ?? (typeof window !== "undefined" ? window : null);
  }

  private collectHostElements(): HTMLElement[] {
    const hosts: HTMLElement[] = [];
    const parentEl = this.containerEl.parentElement;
    if (!parentEl) return hosts;

    hosts.push(parentEl);
    let current = parentEl.parentElement;
    while (current && !current.matches(WIDE_MODE_PAGE_SELECTOR)) {
      if (current.matches(WIDE_MODE_HOST_ANCESTOR_SELECTOR)) {
        hosts.push(current);
      }
      current = current.parentElement;
    }
    return hosts;
  }

  private removeHostClassIfUnused(el: HTMLElement): void {
    if (!el.querySelector(`.${WIDE_MODE_CLASS}[${WIDE_MODE_AVAILABLE}]`)) {
      el.classList.remove(WIDE_MODE_HOST_CLASS);
    }
  }

  private syncHostClass(): void {
    const nextHosts = this.collectHostElements();
    for (const prevHost of this.hostEls) {
      if (!nextHosts.includes(prevHost)) {
        this.removeHostClassIfUnused(prevHost);
      }
    }
    for (const host of nextHosts) {
      host.classList.add(WIDE_MODE_HOST_CLASS);
    }
    this.hostEls = nextHosts;
  }

  private clearHostClass(): void {
    for (const host of this.hostEls) {
      this.removeHostClassIfUnused(host);
    }
    this.hostEls = [];
  }

  private clearCustomProperties(): void {
    if (this.lastWidthProp !== "") {
      this.containerEl.style.removeProperty("--ms-wide-width");
      this.lastWidthProp = "";
    }
    if (this.lastOffsetProp !== "") {
      this.containerEl.style.removeProperty("--ms-wide-offset-left");
      this.lastOffsetProp = "";
    }
  }

  private attachObservers(): void {
    this.updateLayout();

    const hostEl = this.containerEl.parentElement;
    const pageEl = this.containerEl.closest<HTMLElement>(WIDE_MODE_PAGE_SELECTOR);
    const ObserverCtor = getResizeObserver(this.getWindow());

    if (!ObserverCtor || !this.containerEl.isConnected || !hostEl || !pageEl) return;

    const observer = new ObserverCtor(() => {
      this.updateLayout();
    });
    observer.observe(pageEl);
    if (hostEl !== pageEl) observer.observe(hostEl);
    this.layoutRegistry.addFn(() => observer.disconnect());
  }

  private updateLayout(): void {
    const hostEl = this.containerEl.parentElement;
    const win = this.getWindow();
    if (!hostEl || !win || !this.containerEl.isConnected) {
      this.setAvailable(false);
      return;
    }

    const pageEl = this.containerEl.closest<HTMLElement>(WIDE_MODE_PAGE_SELECTOR);
    if (!pageEl || pageEl.clientWidth <= 0) {
      this.setAvailable(false);
      return;
    }

    const hostRect = hostEl.getBoundingClientRect();
    if (hostRect.width <= 0) {
      this.setAvailable(false);
      return;
    }

    const pageRect = pageEl.getBoundingClientRect();
    const pageStyle = win.getComputedStyle(pageEl);
    const hostStyle = win.getComputedStyle(hostEl);

    const paneBorderLeft = parseFloat(pageStyle.borderLeftWidth) || 0;
    const panePadLeft = parseFloat(pageStyle.paddingLeft) || 0;
    const panePadRight = parseFloat(pageStyle.paddingRight) || 0;

    const paneInnerLeft = pageRect.left + paneBorderLeft;
    const paneVisibleRight = paneInnerLeft + pageEl.clientWidth;

    // Reserve room on the left for the floating -24px row drag handle (and CM gutters if enabled).
    let minLeft = paneInnerLeft + Math.max(panePadLeft, MIN_LEFT_GUTTER_PX);
    if (pageEl.classList.contains("cm-scroller")) {
      const gutterEl = pageEl.querySelector<HTMLElement>(":scope > .cm-gutters");
      if (gutterEl) {
        const gutterRect = gutterEl.getBoundingClientRect();
        if (gutterRect.width > 0) {
          minLeft = Math.max(minLeft, gutterRect.right + MIN_LEFT_GUTTER_PX);
        }
      }
    }

    const maxRight = paneVisibleRight - Math.max(panePadRight, MIN_RIGHT_GUTTER_PX);
    const targetWidth = Math.floor(maxRight - minLeft);
    const hostLeftInset = (parseFloat(hostStyle.borderLeftWidth) || 0) + (parseFloat(hostStyle.paddingLeft) || 0);
    const hostRightInset = (parseFloat(hostStyle.borderRightWidth) || 0) + (parseFloat(hostStyle.paddingRight) || 0);
    const narrowInset = parseFloat(win.getComputedStyle(this.containerEl).getPropertyValue("--ms-narrow-inset")) || 0;
    const narrowWidth = hostRect.width - hostLeftInset - hostRightInset - narrowInset;
    const canExpand = narrowWidth > 0 && targetWidth - narrowWidth >= MIN_WIDTH_GAIN_PX;
    this.setAvailable(canExpand);
    if (!canExpand || !this.containerEl.classList.contains(WIDE_MODE_CLASS)) return;

    this.syncHostClass();
    const hostContentLeft = hostRect.left + hostLeftInset + pageEl.scrollLeft;
    const offsetLeft = Math.round(minLeft - hostContentLeft);

    const nextWidthProp = `${targetWidth}px`;
    const nextOffsetProp = `${offsetLeft}px`;

    if (this.lastWidthProp !== nextWidthProp) {
      this.containerEl.style.setProperty("--ms-wide-width", nextWidthProp);
      this.lastWidthProp = nextWidthProp;
    }
    if (this.lastOffsetProp !== nextOffsetProp) {
      this.containerEl.style.setProperty("--ms-wide-offset-left", nextOffsetProp);
      this.lastOffsetProp = nextOffsetProp;
    }
  }

  private setAvailable(available: boolean): void {
    const hideFocusedButton = !available && this.containerEl.hasAttribute(WIDE_MODE_AVAILABLE) &&
      this.containerEl.querySelector(".ms-wide-mode-btn") === this.containerEl.ownerDocument.activeElement;
    this.containerEl.toggleAttribute(WIDE_MODE_AVAILABLE, available);
    if (hideFocusedButton) {
      this.containerEl.focus({ preventScroll: true });
    }
    if (!available || !this.containerEl.classList.contains(WIDE_MODE_CLASS)) {
      this.clearHostClass();
      this.clearCustomProperties();
    }
  }
}
