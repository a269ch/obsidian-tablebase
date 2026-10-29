export interface LinkToken {
  type: "text" | "code" | "external" | "internal";
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

/** Whether the character at `index` follows an odd run of backslashes. */
function isEscaped(input: string, index: number): boolean {
  let count = 0;
  for (let i = index - 1; i >= 0 && input[i] === "\\"; i--) count++;
  return count % 2 === 1;
}

/** The end of the backtick run starting at `index`. */
function backtickRunEnd(input: string, index: number): number {
  let end = index;
  while (input[end] === "`") end++;
  return end;
}

interface CodeSpan {
  start: number;
  end: number;
  text: string;
}

/** A code span's content: line endings become spaces, one space is stripped from each side. */
function codeContent(raw: string): string {
  const content = raw.replace(/\r\n|\r|\n/g, " ");
  if (content.length > 1 && content.startsWith(" ") && content.endsWith(" ") && /[^ ]/.test(content)) {
    return content.slice(1, -1);
  }
  return content;
}

/**
 * The first CommonMark code span at or after `from`: a backtick run opens a
 * span that the next run of the same length closes. An unmatched run, or a
 * backtick after a backslash, stays text.
 */
function findCodeSpan(input: string, from: number): CodeSpan | null {
  let i = from;
  while (i < input.length) {
    if (input[i] !== "`" || isEscaped(input, i)) {
      i++;
      continue;
    }
    const openEnd = backtickRunEnd(input, i);
    const length = openEnd - i;
    for (let j = openEnd; j < input.length; ) {
      if (input[j] !== "`") {
        j++;
        continue;
      }
      const runEnd = backtickRunEnd(input, j);
      if (runEnd - j === length) {
        return { start: i, end: runEnd, text: codeContent(input.slice(openEnd, j)) };
      }
      j = runEnd;
    }
    i = openEnd;
  }
  return null;
}

/** The value with each code span replaced by its content: "`Done`" becomes "Done". */
export function stripCodeSpans(input: string): string {
  let out = "";
  let pos = 0;
  for (let span = findCodeSpan(input, 0); span; span = findCodeSpan(input, pos)) {
    out += input.slice(pos, span.start) + span.text;
    pos = span.end;
  }
  return out + input.slice(pos);
}

const LINK_PATTERN =
  /(\[(?<mdLabel>[^\]\r\n]+)\]\((?<mdUrl>https?:\/\/(?:[^\s()\r\n]|\([^\s()\r\n]*\))+)\))|(\[\[(?<wikiTarget>[^\]|\r\n]+)(?:\|(?<wikiAlias>[^\]\r\n]+))?\]\])|(?<rawUrl>https?:\/\/(?:[^\s<>[\]()"']|\([^\s<>[\]()"']*\))+)/g;

export function parseLinkTokens(input: string): LinkToken[] {
  if (!input) return [];

  const linkRegex = new RegExp(LINK_PATTERN);
  const tokens: LinkToken[] = [];
  let pos = 0;

  while (pos < input.length) {
    linkRegex.lastIndex = pos;
    const link = linkRegex.exec(input);
    const code = findCodeSpan(input, pos);
    // A link that starts first keeps any code span inside it; otherwise code binds first.
    if (code && (!link || code.start < link.index)) {
      appendTextToken(tokens, input.slice(pos, code.start));
      tokens.push({ type: "code", text: code.text });
      pos = code.end;
    } else if (link) {
      appendTextToken(tokens, input.slice(pos, link.index));
      appendLinkToken(tokens, link);
      pos = link.index + link[0].length;
    } else {
      appendTextToken(tokens, input.slice(pos));
      break;
    }
  }

  return tokens;
}

function appendLinkToken(tokens: LinkToken[], match: RegExpExecArray): void {
  const groups = match.groups;
  if (groups?.mdUrl) {
    tokens.push({
      type: "external",
      text: groups.mdLabel ? stripCodeSpans(groups.mdLabel) : groups.mdUrl,
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
}

/**
 * The text a renderer would leave behind for this value: "[[Page|Alias]]"
 * becomes "Alias", "`code`" becomes "code". Lets callers tell a flattened
 * link or code span from plain text.
 */
export function toPlainText(input: string): string {
  return parseLinkTokens(input)
    .map((token) => token.text)
    .join("");
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
    } else if (token.type === "code") {
      // A span, not `code`: plugins that act on inline code (queries, inputs)
      // must not run on cell text.
      container.createEl("span", { cls: "ms-cell-code", text: token.text });
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
