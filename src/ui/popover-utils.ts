/**
 * Shared utility for mounting floating dropdowns, context menus, and popovers
 * with viewport boundary clamping and automatic click-outside, scroll, and Escape dismissal.
 */

export interface MountPopoverOptions {
  anchorEl: HTMLElement;
  popoverEl: HTMLElement;
  className?: string;
  offsetTop?: number;
  offsetLeft?: number;
  closeOnEscape?: boolean;
  closeOnScroll?: boolean;
  onClose?: () => void;
}

export function mountFloatingPopover(options: MountPopoverOptions): () => void {
  const {
    anchorEl,
    popoverEl,
    className = "ms-col-header-menu",
    offsetTop = 2,
    offsetLeft = 0,
    closeOnEscape = true,
    closeOnScroll = true,
    onClose,
  } = options;

  // Clean up any existing popover of the same category
  const existing = document.querySelector(`.${className}`);
  if (existing && existing !== popoverEl) {
    existing.remove();
  }

  // Calculate position with viewport boundary clamping
  const rect = anchorEl.getBoundingClientRect();
  popoverEl.style.position = "absolute";

  const top = rect.bottom + window.scrollY + offsetTop;
  let left = rect.left + window.scrollX + offsetLeft;

  // Keep within viewport horizontally
  const estimatedWidth = 240;
  if (left + estimatedWidth > window.innerWidth) {
    left = Math.max(10, window.innerWidth - estimatedWidth - 16 + window.scrollX);
  }

  popoverEl.style.top = `${top}px`;
  popoverEl.style.left = `${Math.max(10, left)}px`;
  popoverEl.style.zIndex = "1000";

  document.body.appendChild(popoverEl);

  let isClosed = false;

  const close = () => {
    if (isClosed) return;
    isClosed = true;
    popoverEl.remove();
    document.removeEventListener("click", onClickOutside);
    if (closeOnEscape) {
      document.removeEventListener("keydown", onKeyDown);
    }
    if (closeOnScroll) {
      window.removeEventListener("scroll", onScroll, true);
    }
    if (onClose) {
      onClose();
    }
  };

  const onClickOutside = (e: MouseEvent) => {
    const target = e.target as Node;
    if (!popoverEl.contains(target) && !anchorEl.contains(target)) {
      close();
    }
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      close();
    }
  };

  const onScroll = (e: Event) => {
    const target = e.target as Node;
    if (target && popoverEl.contains(target)) {
      return;
    }
    close();
  };

  setTimeout(() => {
    document.addEventListener("click", onClickOutside);
    if (closeOnEscape) {
      document.addEventListener("keydown", onKeyDown);
    }
    if (closeOnScroll) {
      window.addEventListener("scroll", onScroll, { capture: true, passive: true });
    }
  }, 0);

  return close;
}
