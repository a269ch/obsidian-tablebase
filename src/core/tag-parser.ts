import { TagColor, MultiSelectTag, TagFormat } from "../types";
import { parseLinkTokens } from "../utils/link-renderer";
import { resolveTagColor } from "./color-palette";

interface CellTagToken {
  name: string;
  source: string;
}

function parseWikiTagTokens(text: string): CellTagToken[] {
  return Array.from(
    text.matchAll(/\[\[([^\]|]+?)(?:\\?\|[^\]]+)?\]\]/g),
    ([source, target]) => ({ name: target.trim(), source })
  ).filter((tag) => tag.name);
}

export function parseCellTagTokens(cellContent: string): CellTagToken[] {
  const trimmed = cellContent.trim();
  if (!trimmed || trimmed === "-" || trimmed === "N/A" || trimmed === "null") return [];

  const wikiTags = parseWikiTagTokens(trimmed);
  if (wikiTags.length > 0) return wikiTags;

  if (/(?:^|\s)#[\p{L}\p{N}_-]/u.test(trimmed)) {
    return Array.from(trimmed.matchAll(/#([\p{L}\p{N}_-]+)/gu), ([source, name]) => ({
      name,
      source,
    }));
  }

  return trimmed.split(/[,;]/).flatMap((part) => {
    const name = part.trim();
    return name ? [{ name, source: name }] : [];
  });
}

export function parseCellTags(
  cellContent: string,
  customColors?: Record<string, TagColor>
): MultiSelectTag[] {
  if (!cellContent || typeof cellContent !== "string") {
    return [];
  }

  const seen = new Set<string>();
  const uniqueTags: MultiSelectTag[] = [];

  for (const { name: rawName } of parseCellTagTokens(cellContent)) {
    const lower = rawName.toLowerCase();
    if (!seen.has(lower)) {
      seen.add(lower);
      const color = resolveTagColor(rawName, customColors);
      uniqueTags.push({
        id: lower,
        name: rawName,
        color,
      });
    }
  }

  return uniqueTags;
}

export function formatTagsToCell(
  tags: (MultiSelectTag | string)[],
  format: TagFormat = "comma"
): string {
  if (!tags || tags.length === 0) {
    return "";
  }

  const names = tags
    .map((t) => (typeof t === "string" ? t.trim() : t.name.trim()))
    .filter((n) => n.length > 0);

  if (names.length === 0) {
    return "";
  }

  switch (format) {
    case "wikilink":
      return names.map((name) => `[[${name}]]`).join(", ");
    case "hashtag":
      return names
        .map((name) => `#${name.replace(/\s+/g, "_")}`)
        .join(" ");
    case "comma":
    default:
      return names.join(", ");
  }
}

const MAX_AUTO_TAG_LENGTH = 28;
const MAX_AUTO_TAG_WORDS = 3;
const HASHTAG_TOKEN_REGEX = /(?:^|\s)#(?=[\p{L}\p{N}_-]*\p{L})[\p{L}\p{N}_-]+/u;
const PROSE_PUNCTUATION_REGEX = /[.!?…:]|\s[—–-]\s/;
const CONJUNCTION_PREFIX_REGEX = /^(?:and|or|but|и|или|но|а)\s+/i;
const NUMERIC_THOUSANDS_REGEX = /^[+-]?\$?\d{1,3}(?:,\d{3})+(?:\.\d+)?%?$/;

function hasBalancedParens(text: string): boolean {
  let depth = 0;
  for (const ch of text) {
    if (ch === "(") depth++;
    else if (ch === ")") {
      depth--;
      if (depth < 0) return false;
    }
  }
  return depth === 0;
}

function isConciseTagPart(part: string): boolean {
  if (!part || part.length > MAX_AUTO_TAG_LENGTH) return false;
  if (part.split(/\s+/).length > MAX_AUTO_TAG_WORDS) return false;
  if (PROSE_PUNCTUATION_REGEX.test(part)) return false;
  if (CONJUNCTION_PREFIX_REGEX.test(part)) return false;
  if (!hasBalancedParens(part)) return false;
  return true;
}

function isLikelyMultiSelectCell(rawValue: string): boolean {
  const trimmed = rawValue.trim();
  if (!trimmed || trimmed === "-" || trimmed === "N/A" || trimmed === "null") {
    return false;
  }

  const tokens = parseLinkTokens(trimmed);
  const linkCount = tokens.filter(
    (token) => token.type === "internal" || token.type === "external"
  ).length;
  const plainText = tokens
    .filter((token) => token.type === "text")
    .map((token) => token.text)
    .join(" ")
    .trim();

  if (plainText && HASHTAG_TOKEN_REGEX.test(plainText)) {
    return true;
  }

  if (linkCount > 0) {
    return linkCount > 1 && parseWikiTagTokens(trimmed).length === linkCount;
  }
  if (!plainText || NUMERIC_THOUSANDS_REGEX.test(plainText)) {
    return false;
  }

  const parts = plainText
    .split(/[,;]/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
  if (parts.length < 2) {
    return false;
  }

  return parts.some((part) => /\p{L}/u.test(part)) && parts.every(isConciseTagPart);
}

export function looksLikeMultiSelect(
  values: string[],
  columnHeaderName?: string
): boolean {
  if (columnHeaderName) {
    const headerLower = columnHeaderName.toLowerCase();
    const commonNames = [
      "tag", "tags", "label", "labels", "category", "categories",
      "status", "topic", "topics"
    ];
    if (commonNames.some((name) => headerLower.includes(name))) {
      return true;
    }
  }

  let multiCount = 0;
  let totalNonEmpty = 0;

  for (const val of values) {
    if (!val || val.trim() === "") continue;
    totalNonEmpty++;
    if (isLikelyMultiSelectCell(val)) {
      multiCount++;
    }
  }

  return totalNonEmpty > 0 && multiCount / totalNonEmpty >= 0.3;
}
