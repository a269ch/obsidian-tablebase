const SVG_NAMESPACE = "http://www.w3.org/2000/svg";

const iconCache: Map<string, SVGElement> = new Map();

function createEmptyIcon(): SVGElement {
  const fallback = document.createElementNS(SVG_NAMESPACE, "svg");
  fallback.setAttribute("width", "0");
  fallback.setAttribute("height", "0");
  return fallback;
}

function parseIconMarkup(markup: string): SVGElement {
  const parser = new DOMParser();
  const doc = parser.parseFromString(markup.trim(), "text/html");
  const root = doc.body.firstElementChild;
  if (root instanceof SVGElement && root.namespaceURI === SVG_NAMESPACE) {
    return document.importNode(root, true);
  }

  return createEmptyIcon();
}

function createIcon(markup: string): SVGElement {
  let cached = iconCache.get(markup);
  if (!cached) {
    cached = parseIconMarkup(markup);
    iconCache.set(markup, cached);
  }
  return cached.cloneNode(true) as SVGElement;
}

export function appendIcon(parent: Element, markup: string, cls?: string): SVGElement {
  const icon = createIcon(markup);
  if (cls) {
    icon.classList.add(...cls.split(" ").filter((token) => token.length > 0));
  }
  parent.appendChild(icon);
  return icon;
}

function appendLabel(parent: Element, text: string, cls?: string): HTMLSpanElement {
  if ("createSpan" in parent && typeof (parent as HTMLElement).createSpan === "function") {
    return (parent as HTMLElement).createSpan({ cls, text });
  }
  const span = createSpan({ cls, text });
  parent.appendChild(span);
  return span;
}

export function appendIconLabel(
  parent: Element,
  markup: string,
  label: string,
  options: { iconClass?: string; labelClass?: string } = {}
): HTMLSpanElement {
  appendIcon(parent, markup, options.iconClass);
  return appendLabel(parent, label, options.labelClass);
}

export function setFixedWidth(target: HTMLElement, pixels: number): void {
  const value = `${pixels}px`;
  if (typeof target.setCssStyles === "function") {
    target.setCssStyles({
      width: value,
      minWidth: value,
      maxWidth: value,
    });
    return;
  }
  target.style.width = value;
  target.style.minWidth = value;
  target.style.maxWidth = value;
}
