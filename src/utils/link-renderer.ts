export interface LinkToken {
  type: "text" | "external" | "internal";
  text: string;
  href?: string;
}

export interface LinkRenderCallbacks {
  onExternalClick?: (url: string, e: MouseEvent) => void;
  onInternalClick?: (path: string, e: MouseEvent) => void;
}

function trimTrailingUrlPunctuation(url: string): { url: string; trailing: string } {
  let cleanUrl = url;
  let trailing = "";
  let openCount = (url.match(/\(/g) || []).length;
  let closeCount = (url.match(/\)/g) || []).length;

  while (cleanUrl.length > 0 && /[.,;:!?)]$/.test(cleanUrl)) {
    if (cleanUrl.endsWith(")")) {
      if (closeCount <= openCount) {
        break;
      }
      closeCount -= 1;
    }
    trailing = cleanUrl.slice(-1) + trailing;
    cleanUrl = cleanUrl.slice(0, -1);
  }

  return { url: cleanUrl, trailing };
}

function appendTextToken(tokens: LinkToken[], text: string): void {
  if (!text) return;
  const lastToken = tokens[tokens.length - 1];
  if (lastToken && lastToken.type === "text") {
    lastToken.text += text;
  } else {
    tokens.push({ type: "text", text });
  }
}

export function parseLinkTokens(input: string): LinkToken[] {
  if (!input) return [];

  const combinedRegex =
    /(\[(?<mdLabel>[^\]\r\n]+)\]\((?<mdUrl>https?:\/\/(?:[^\s()\r\n]|\([^\s()\r\n]*\))+)\))|(\[\[(?<wikiTarget>[^\]|\r\n]+)(?:\|(?<wikiAlias>[^\]\r\n]+))?\]\])|(?<rawUrl>https?:\/\/(?:[^\s<>[\]()"']|\([^\s<>[\]()"']*\))+)/g;

  const tokens: LinkToken[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = combinedRegex.exec(input)) !== null) {
    const matchIndex = match.index;
    if (matchIndex > lastIndex) {
      appendTextToken(tokens, input.slice(lastIndex, matchIndex));
    }

    const groups = match.groups;
    if (groups?.mdUrl) {
      tokens.push({
        type: "external",
        text: groups.mdLabel || groups.mdUrl,
        href: groups.mdUrl,
      });
    } else if (groups?.wikiTarget) {
      tokens.push({
        type: "internal",
        text: groups.wikiAlias || groups.wikiTarget,
        href: groups.wikiTarget.trim(),
      });
    } else if (groups?.rawUrl) {
      const { url, trailing } = trimTrailingUrlPunctuation(groups.rawUrl);
      if (url.length > 0) {
        tokens.push({
          type: "external",
          text: url,
          href: url,
        });
      }
      if (trailing.length > 0) {
        appendTextToken(tokens, trailing);
      }
    }

    lastIndex = combinedRegex.lastIndex;
  }

  if (lastIndex < input.length) {
    appendTextToken(tokens, input.slice(lastIndex));
  }

  return tokens;
}

export function renderTextWithLinks(
  container: HTMLElement,
  text: string,
  callbacks?: LinkRenderCallbacks
): void {
  const tokens = parseLinkTokens(text);

  for (const token of tokens) {
    if (token.type === "text") {
      if ("appendText" in container && typeof container.appendText === "function") {
        container.appendText(token.text);
      } else {
        container.appendChild(container.ownerDocument.createTextNode(token.text));
      }
    } else if (token.type === "external") {
      const linkEl = container.createEl("a", {
        cls: "ms-cell-link external-link",
        text: token.text,
        href: token.href,
      });
      linkEl.setAttribute("target", "_blank");
      linkEl.setAttribute("rel", "noopener noreferrer");

      if (callbacks?.onExternalClick) {
        linkEl.addEventListener("click", (e) => {
          e.preventDefault();
          callbacks.onExternalClick?.(token.href ?? "", e);
        });
        linkEl.addEventListener("dblclick", (e) => {
          e.preventDefault();
          e.stopPropagation();
        });
      }
    } else if (token.type === "internal") {
      const linkEl = container.createEl("a", {
        cls: "ms-cell-link internal-link",
        text: token.text,
      });
      if (token.href) {
        linkEl.dataset.href = token.href;
      }

      if (callbacks?.onInternalClick) {
        linkEl.addEventListener("click", (e) => {
          e.preventDefault();
          callbacks.onInternalClick?.(token.href ?? "", e);
        });
        linkEl.addEventListener("dblclick", (e) => {
          e.preventDefault();
          e.stopPropagation();
        });
      }
    }
  }
}
