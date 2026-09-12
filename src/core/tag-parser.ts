import { TagColor, MultiSelectTag, TagFormat } from "../types";
import { resolveTagColor } from "./color-palette";

export function parseCellTags(
  cellContent: string,
  customColors?: Record<string, TagColor>
): MultiSelectTag[] {
  if (!cellContent || typeof cellContent !== "string") {
    return [];
  }

  const trimmed = cellContent.trim();
  if (trimmed === "" || trimmed === "-" || trimmed === "N/A" || trimmed === "null") {
    return [];
  }

  const rawTags: string[] = [];

  if (trimmed.includes("[[") && trimmed.includes("]]")) {
    const wikilinkRegex = /\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g;
    let match: RegExpExecArray | null;
    while ((match = wikilinkRegex.exec(trimmed)) !== null) {
      if (match[1] && match[1].trim()) {
        rawTags.push(match[1].trim());
      }
    }
  }

  if (rawTags.length === 0 && (trimmed.startsWith("#") || /\s#[a-zA-Z0-9_\-\u0400-\u04FF]/.test(trimmed))) {
    const hashtagRegex = /#([\p{L}\p{N}_-]+)/gu;
    let match: RegExpExecArray | null;
    while ((match = hashtagRegex.exec(trimmed)) !== null) {
      if (match[1] && match[1].trim()) {
        rawTags.push(match[1].trim());
      }
    }
  }

  if (rawTags.length === 0) {
    const parts = trimmed.split(/[,;]/);
    for (const part of parts) {
      const clean = part.trim();
      if (clean) {
        rawTags.push(clean);
      }
    }
  }

  const seen = new Set<string>();
  const uniqueTags: MultiSelectTag[] = [];

  for (const rawName of rawTags) {
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
    const tags = parseCellTags(val);
    // A lone "[[Page]]" is a link to one note, not a list of tags; cells that
    // really hold several of them are caught by the tag count above.
    if (tags.length > 1 || val.includes(",") || val.startsWith("#")) {
      multiCount++;
    }
  }

  return totalNonEmpty > 0 && multiCount / totalNonEmpty >= 0.3;
}
