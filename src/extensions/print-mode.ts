export function isPrintMode(el: HTMLElement): boolean {
  if (el.closest(".print, .is-print, .pdf-export")) return true;
  if (el.ownerDocument?.body?.classList.contains("print")) return true;
  if (typeof window !== "undefined" && typeof window.matchMedia === "function") {
    try {
      if (window.matchMedia("print").matches) return true;
    } catch {
      // ignore media query evaluation errors
    }
  }
  return false;
}
