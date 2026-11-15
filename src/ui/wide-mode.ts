import { appendIcon } from "../utils/dom";
import { Disposable, DisposableRegistry } from "../utils/lifecycle";
import { ICON_NARROW_MODE, ICON_WIDE_MODE } from "./icons";

const WIDE_MODE_PAGE_SELECTOR =
  ".callout-content, .markdown-embed-content, .markdown-preview-view, .cm-scroller, .view-content";
const WIDE_MODE_HOST_CLASS = "ms-wide-mode-host";
const WIDE_MODE_CLASS = "is-wide-mode";
const MIN_LEFT_GUTTER_PX = 28;
const MIN_RIGHT_GUTTER_PX = 20;

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
      "aria-label": title,
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
  private lastHostEl: HTMLElement | null = null;
  private lastWidthProp = "";
  private lastOffsetProp = "";

  constructor(containerEl: HTMLElement) {
    this.containerEl = containerEl;
  }

  public sync(isWide: boolean): void {
    this.layoutRegistry.disposeAll();
    this.containerEl.classList.toggle(WIDE_MODE_CLASS, isWide);

    if (!isWide) {
      this.clearHostClass();
      this.clearCustomProperties();
      return;
    }

    this.syncHostClass();
    this.updateLayout();

    let cancelled = false;
    this.layoutRegistry.addFn(() => {
      cancelled = true;
    });

    if (typeof queueMicrotask === "function") {
      queueMicrotask(() => {
        if (cancelled) return;
        this.syncHostClass();
        this.updateLayout();
      });
    }

    const win = this.getWindow();
    if (win) {
      this.layoutRegistry.listen(win, "resize", () => this.updateLayout());
      if (typeof win.requestAnimationFrame === "function") {
        this.layoutRegistry.animationFrame(() => this.attachObservers());
      }
    }
  }

  public dispose(): void {
    this.layoutRegistry.disposeAll();
    this.clearHostClass();
    this.clearCustomProperties();
  }

  private getWindow(): Window | null {
    return this.containerEl.ownerDocument?.defaultView ?? (typeof window !== "undefined" ? window : null);
  }

  private syncHostClass(): void {
    const hostEl = this.containerEl.parentElement;
    if (this.lastHostEl && this.lastHostEl !== hostEl) {
      this.lastHostEl.classList.remove(WIDE_MODE_HOST_CLASS);
    }
    if (hostEl) {
      hostEl.classList.add(WIDE_MODE_HOST_CLASS);
      this.lastHostEl = hostEl;
    } else {
      this.lastHostEl = null;
    }
  }

  private clearHostClass(): void {
    this.containerEl.parentElement?.classList.remove(WIDE_MODE_HOST_CLASS);
    this.lastHostEl?.classList.remove(WIDE_MODE_HOST_CLASS);
    this.lastHostEl = null;
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
    this.syncHostClass();
    this.updateLayout();

    const hostEl = this.containerEl.parentElement;
    const pageEl = this.containerEl.closest<HTMLElement>(WIDE_MODE_PAGE_SELECTOR);
    const win = this.getWindow() as (Window & { ResizeObserver?: typeof ResizeObserver }) | null;
    const ObserverCtor =
      win?.ResizeObserver ??
      (typeof ResizeObserver !== "undefined" ? ResizeObserver : null);

    if (!ObserverCtor || (!hostEl && !pageEl)) return;

    const observer = new ObserverCtor(() => {
      this.updateLayout();
    });
    if (pageEl) observer.observe(pageEl);
    if (hostEl) observer.observe(hostEl);
    this.layoutRegistry.addFn(() => observer.disconnect());
  }

  private updateLayout(): void {
    this.syncHostClass();

    const hostEl = this.containerEl.parentElement;
    const win = this.getWindow();
    if (!hostEl || !win || !this.containerEl.isConnected) {
      this.clearCustomProperties();
      return;
    }

    const pageEl = this.containerEl.closest<HTMLElement>(WIDE_MODE_PAGE_SELECTOR);
    if (!pageEl || pageEl.clientWidth <= 0) {
      this.clearCustomProperties();
      return;
    }

    const hostRect = hostEl.getBoundingClientRect();
    if (hostRect.width <= 0) {
      this.clearCustomProperties();
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
    if (targetWidth <= 0) {
      this.clearCustomProperties();
      return;
    }

    const hostContentLeft =
      hostRect.left +
      (parseFloat(hostStyle.borderLeftWidth) || 0) +
      (parseFloat(hostStyle.paddingLeft) || 0) +
      pageEl.scrollLeft;
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
}
