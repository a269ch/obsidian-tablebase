import { DisposableRegistry } from "../utils/lifecycle";

export interface MountPopoverOptions {
  anchorEl: HTMLElement;
  popoverEl: HTMLElement;
  className?: string;
  offsetTop?: number;
  offsetLeft?: number;
  closeOnEscape?: boolean;
  closeOnScroll?: boolean;
  alwaysBelow?: boolean;
  positionToSide?: boolean;
  onClose?: () => void;
}

const FLOATING_POPOVER_SELECTOR =
  ".ms-col-header-menu, .ms-select-popover, .ms-date-picker-popover";

const VIEWPORT_MARGIN = 8;
const MIN_POPOVER_HEIGHT = 120;

const activePopoverClosers = new Set<() => void>();

export function closeAllFloatingPopovers(): void {
  for (const closer of Array.from(activePopoverClosers)) {
    try {
      closer();
    } catch {
      continue;
    }
  }
  activePopoverClosers.clear();
  document.querySelectorAll(FLOATING_POPOVER_SELECTOR).forEach((el) => el.remove());
}

export function mountFloatingPopover(options: MountPopoverOptions): () => void {
  const {
    anchorEl,
    popoverEl,
    offsetTop = 4,
    offsetLeft = 0,
    closeOnEscape = true,
    closeOnScroll = false,
    alwaysBelow = true,
    positionToSide = false,
    onClose,
  } = options;

  closeAllFloatingPopovers();

  popoverEl.addClass("ms-floating-popover");

  document.body.appendChild(popoverEl);

  const registry = new DisposableRegistry();
  let isClosed = false;
  let pendingFrame: number | null = null;

  const close = (): void => {
    if (isClosed) return;
    isClosed = true;
    activePopoverClosers.delete(close);

    if (pendingFrame !== null) {
      window.cancelAnimationFrame(pendingFrame);
      pendingFrame = null;
    }
    registry.dispose();
    popoverEl.remove();
    onClose?.();
  };

  activePopoverClosers.add(close);

  const updatePosition = (): void => {
    if (isClosed) return;

    if (!anchorEl.isConnected) {
      close();
      return;
    }

    const anchorRect = anchorEl.getBoundingClientRect();
    const columnEl = anchorEl.closest("th, td") || anchorEl;
    const columnRect = columnEl.getBoundingClientRect();

    const viewportHeight = window.innerHeight;
    const viewportWidth = window.innerWidth;

    const isOffscreen =
      anchorRect.bottom <= 0 ||
      anchorRect.top >= viewportHeight ||
      anchorRect.right <= 0 ||
      anchorRect.left >= viewportWidth;
    if (isOffscreen) {
      close();
      return;
    }

    popoverEl.setCssStyles({ maxHeight: "" });
    const naturalHeight = popoverEl.offsetHeight || 200;
    const naturalWidth = popoverEl.offsetWidth || 220;

    let top: number;
    if (alwaysBelow) {
      top = anchorRect.bottom + offsetTop;
      const spaceBelow = Math.max(MIN_POPOVER_HEIGHT, viewportHeight - top - VIEWPORT_MARGIN);
      popoverEl.setCssStyles({ maxHeight: `${spaceBelow}px`, overflowY: "auto" });

      if (top + 100 > viewportHeight - VIEWPORT_MARGIN && anchorRect.top > MIN_POPOVER_HEIGHT) {
        top = Math.max(
          VIEWPORT_MARGIN,
          viewportHeight - VIEWPORT_MARGIN - Math.min(naturalHeight, 280)
        );
        popoverEl.setCssStyles({
          maxHeight: `${Math.max(
            MIN_POPOVER_HEIGHT,
            viewportHeight - top - VIEWPORT_MARGIN
          )}px`,
        });
      }
    } else {
      const spaceBelow = Math.max(0, viewportHeight - anchorRect.bottom - offsetTop - VIEWPORT_MARGIN);
      const spaceAbove = Math.max(0, anchorRect.top - offsetTop - VIEWPORT_MARGIN);
      const fitsBelow = spaceBelow >= naturalHeight;
      const fitsAbove = spaceAbove >= naturalHeight;
      const placeAbove = !fitsBelow && (fitsAbove || spaceAbove > spaceBelow);

      if (placeAbove) {
        const maxHeight = Math.max(MIN_POPOVER_HEIGHT, Math.min(naturalHeight, spaceAbove));
        popoverEl.setCssStyles({ maxHeight: `${maxHeight}px`, overflowY: "auto" });
        top = anchorRect.top - (popoverEl.offsetHeight || maxHeight) - offsetTop;
      } else {
        const maxHeight = Math.max(MIN_POPOVER_HEIGHT, Math.min(naturalHeight, spaceBelow));
        popoverEl.setCssStyles({ maxHeight: `${maxHeight}px`, overflowY: "auto" });
        top = anchorRect.bottom + offsetTop;
      }
    }

    const renderedHeight = popoverEl.offsetHeight || 0;
    top = Math.max(
      VIEWPORT_MARGIN,
      Math.min(top, viewportHeight - VIEWPORT_MARGIN - renderedHeight)
    );

    let left: number;
    if (positionToSide) {
      const sideGap = offsetLeft !== 0 ? offsetLeft : 4;
      const tryRight = columnRect.right + sideGap;
      const tryLeft = columnRect.left - naturalWidth - sideGap;

      if (tryRight + naturalWidth <= viewportWidth - VIEWPORT_MARGIN) {
        left = tryRight;
      } else if (tryLeft >= VIEWPORT_MARGIN) {
        left = tryLeft;
      } else {
        const spaceRight = viewportWidth - VIEWPORT_MARGIN - columnRect.right;
        const spaceLeft = columnRect.left - VIEWPORT_MARGIN;
        left =
          spaceRight >= spaceLeft
            ? Math.max(
                VIEWPORT_MARGIN,
                Math.min(tryRight, viewportWidth - naturalWidth - VIEWPORT_MARGIN)
              )
            : Math.max(VIEWPORT_MARGIN, tryLeft);
      }
    } else {
      left = anchorRect.left + offsetLeft;
      if (left + naturalWidth > viewportWidth - VIEWPORT_MARGIN) {
        left = Math.max(VIEWPORT_MARGIN, viewportWidth - naturalWidth - VIEWPORT_MARGIN);
      }
      left = Math.max(VIEWPORT_MARGIN, left);
    }

    popoverEl.setCssStyles({
      top: `${Math.round(top)}px`,
      left: `${Math.round(left)}px`,
    });
  };

  const schedulePositionUpdate = (): void => {
    if (pendingFrame !== null) return;
    pendingFrame = window.requestAnimationFrame(() => {
      pendingFrame = null;
      updatePosition();
    });
  };

  updatePosition();
  schedulePositionUpdate();

  registry.timeout(() => {
    if (isClosed) return;

    registry.listen(document, "click", (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (!popoverEl.contains(target) && !anchorEl.contains(target)) {
        close();
      }
    });

    if (closeOnEscape) {
      registry.listen(document, "keydown", (event: KeyboardEvent) => {
        if (event.key === "Escape") {
          close();
        }
      });
    }

    registry.listen(
      window,
      "scroll",
      (event: Event) => {
        const target = event.target as Node | null;
        if (target && popoverEl.contains(target)) return;
        if (closeOnScroll) {
          close();
          return;
        }
        schedulePositionUpdate();
      },
      { capture: true, passive: true }
    );

    registry.listen(window, "resize", schedulePositionUpdate, { passive: true });
  }, 0);

  return close;
}
