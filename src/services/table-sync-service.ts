import {
  FencedBlock,
  findFencedBlocks,
  serializeMarkdownTable,
  TABLE_CODE_BLOCK_LANGUAGES,
} from "../core/markdown-parser";
import { MarkdownTableData } from "../types";
import { VaultService } from "./vault-service";

export type CodeBlockRewrite = (previous: string, next: string, line: number) => void;

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
    lineHint?: number,
    onRewrite?: CodeBlockRewrite
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
      const next = lines.join("\n");
      onRewrite?.(content, next, block.openLine);
      return next;
    };

    const modified = await this.vaultService.modifyFile(sourcePath, transform);
    return modified && replaced;
  }

  public async syncInlineTable(
    sourcePath: string,
    transform: (content: string) => string
  ): Promise<boolean> {
    return Boolean(sourcePath) && this.vaultService.modifyFile(sourcePath, transform);
  }
}
