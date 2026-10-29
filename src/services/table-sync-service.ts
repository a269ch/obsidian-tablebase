import { serializeMarkdownTable } from "../core/markdown-parser";
import { TABLE_CODE_BLOCK_LANGUAGES } from "../extensions/codeblock-processor";
import { MarkdownTableData } from "../types";
import { VaultService } from "./vault-service";

// Optional blockquote/callout markers and indentation, the fence, then the info string.
const FENCE_OPEN = /^((?:[ \t]*>)*[ \t]*)(`{3,}|~{3,})[ \t]*([^\s`]*)/;

interface FencedBlock {
  openLine: number;
  closeLine: number;
  prefix: string;
  language: string;
  body: string;
}

function stripPrefix(line: string, prefix: string): string | null {
  if (line.startsWith(prefix)) return line.slice(prefix.length);
  if (line.trimEnd() === prefix.trimEnd()) return "";
  return null;
}

function isClosingFence(line: string, prefix: string, fence: string): boolean {
  const rest = (stripPrefix(line, prefix) ?? line).trim();
  return rest.length >= fence.length && [...rest].every((char) => char === fence[0]);
}

// Lines are passed without "\r"; blocks inside other fenced blocks are skipped.
function findFencedBlocks(lines: string[]): FencedBlock[] {
  const blocks: FencedBlock[] = [];
  for (let i = 0; i < lines.length; i++) {
    const match = FENCE_OPEN.exec(lines[i]);
    if (!match) continue;
    const [, prefix, fence, language] = match;
    if (fence[0] === "`" && lines[i].slice(match[0].length).includes("`")) continue;

    const closeLine = lines.findIndex((line, j) => j > i && isClosingFence(line, prefix, fence));
    if (closeLine === -1) break;

    const bodyLines = lines.slice(i + 1, closeLine).map((line) => stripPrefix(line, prefix) ?? line);
    blocks.push({ openLine: i, closeLine, prefix, language: language.toLowerCase(), body: bodyLines.join("\n") });
    i = closeLine;
  }
  return blocks;
}

// A table block at the hinted line must match; otherwise the only match wins. Anything ambiguous returns undefined.
function pickBlock(
  blocks: FencedBlock[],
  initialSource?: string,
  lineHint?: number
): FencedBlock | undefined {
  const tableBlocks = blocks.filter((block) =>
    (TABLE_CODE_BLOCK_LANGUAGES as readonly string[]).includes(block.language)
  );
  const isMatch = (block: FencedBlock) =>
    initialSource === undefined || block.body.trim() === initialSource.replace(/\r/g, "").trim();

  const hinted = tableBlocks.find((block) => block.openLine === lineHint);
  if (hinted) return isMatch(hinted) ? hinted : undefined;

  const candidates = tableBlocks.filter(isMatch);
  return candidates.length === 1 ? candidates[0] : undefined;
}

export class TableSyncService {
  private vaultService: VaultService;

  constructor(vaultService: VaultService) {
    this.vaultService = vaultService;
  }

  /** Resolves true when the block was found and rewritten. */
  public async syncCodeBlock(
    sourcePath: string,
    tableData: MarkdownTableData,
    initialSource?: string,
    lineHint?: number
  ): Promise<boolean> {
    if (!sourcePath) return false;

    const newBody = serializeMarkdownTable(tableData).split("\n");
    let replaced = false;

    const transform = (content: string): string => {
      replaced = false;
      const lines = content.split("\n");
      const block = pickBlock(
        findFencedBlocks(lines.map((line) => line.replace(/\r$/, ""))),
        initialSource,
        lineHint
      );
      if (!block) return content;

      const defaultLineEnding = lines[block.openLine].endsWith("\r") ? "\r" : "";
      const originalBodyLineEndings = lines
        .slice(block.openLine + 1, block.closeLine)
        .map((line) => (line.endsWith("\r") ? "\r" : ""));
      const bodyLines = newBody.map((line, index) => {
        const lineEnding = originalBodyLineEndings[index] ?? defaultLineEnding;
        return `${block.prefix}${line}${lineEnding}`;
      });
      lines.splice(block.openLine + 1, block.closeLine - block.openLine - 1, ...bodyLines);
      replaced = true;
      return lines.join("\n");
    };

    const modified = await this.vaultService.modifyFile(sourcePath, transform);
    return modified && replaced;
  }

  public async syncInlineTable(
    sourcePath: string,
    transform: (content: string) => string
  ): Promise<void> {
    if (!sourcePath) return;
    await this.vaultService.modifyFile(sourcePath, transform);
  }
}
