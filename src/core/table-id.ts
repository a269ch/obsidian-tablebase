import {
  findFencedBlocks,
  parseMarkdownTables,
  TABLE_CODE_BLOCK_LANGUAGES,
} from "./markdown-parser";
import { stripTypeAnnotation } from "./table-mutator";

export const STABLE_TABLE_ID_PREFIX = "tbl:";

export function isStableTableId(id: string | undefined): boolean {
  return typeof id === "string" && id.startsWith(STABLE_TABLE_ID_PREFIX);
}

export function normalizeTableHeaderSignature(headers: string[]): string {
  return headers
    .map((header) => stripTypeAnnotation(header.trim()).trim().toLowerCase())
    .join("\x1f");
}

function hashHeaderSignature(signature: string): string {
  // FNV-1a 32-bit hash keeps keys short and free of delimiter characters.
  let hash = 0x811c9dc5;
  for (let i = 0; i < signature.length; i++) {
    hash ^= signature.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export function buildStableTableId(params: {
  sourcePath?: string;
  headers: string[];
  occurrence?: number;
}): string {
  const path = params.sourcePath || "doc";
  const sig = normalizeTableHeaderSignature(params.headers);
  const occurrence =
    typeof params.occurrence === "number" && params.occurrence >= 0 ? params.occurrence : 0;
  return `${STABLE_TABLE_ID_PREFIX}${path}:${hashHeaderSignature(sig)}:${occurrence}`;
}

export function parseOccurrenceFromTableId(tableId: string): number {
  if (!isStableTableId(tableId)) return 0;
  const lastColon = tableId.lastIndexOf(":");
  if (lastColon === -1) return 0;
  const parsed = Number.parseInt(tableId.slice(lastColon + 1), 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

interface DocumentTableEntry {
  sortLine: number;
  headerSig: string;
  isCodeBlock: boolean;
}

/**
 * Computes the zero-based occurrence index of a table among all tables in the
 * document sharing the same normalized header signature. Keeping the count by
 * header signature rather than raw line numbers ensures adding rows or editing
 * surrounding text never invalidates a table's identity.
 */
export function findTableOccurrenceInDocument(
  docContent: string,
  options: { startLine: number; isCodeBlock: boolean }
): number {
  if (!docContent || options.startLine < 0) return 0;

  const lines = docContent.split(/\r?\n/);
  const fencedBlocks = findFencedBlocks(lines);
  const entries: DocumentTableEntry[] = [];

  const isInsideFence = (line: number): boolean =>
    fencedBlocks.some((block) => line >= block.openLine && line <= block.closeLine);

  for (const table of parseMarkdownTables(docContent)) {
    if (!isInsideFence(table.startLine)) {
      entries.push({
        sortLine: table.startLine,
        headerSig: normalizeTableHeaderSignature(table.headers),
        isCodeBlock: false,
      });
    }
  }

  for (const block of fencedBlocks) {
    if (!(TABLE_CODE_BLOCK_LANGUAGES as readonly string[]).includes(block.language)) {
      continue;
    }
    const blockTables = parseMarkdownTables(block.body);
    if (blockTables.length > 0) {
      entries.push({
        sortLine: block.openLine,
        headerSig: normalizeTableHeaderSignature(blockTables[0].headers),
        isCodeBlock: true,
      });
    }
  }

  entries.sort((a, b) => a.sortLine - b.sortLine);

  const targetIndex = entries.findIndex(
    (entry) => entry.isCodeBlock === options.isCodeBlock && entry.sortLine === options.startLine
  );
  if (targetIndex === -1) return 0;

  const targetSig = entries[targetIndex].headerSig;
  let occurrence = 0;
  for (let i = 0; i < targetIndex; i++) {
    if (entries[i].headerSig === targetSig) {
      occurrence++;
    }
  }
  return occurrence;
}
