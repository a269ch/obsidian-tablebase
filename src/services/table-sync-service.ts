import { serializeMarkdownTable } from "../core/markdown-parser";
import { MarkdownTableData } from "../types";
import { VaultService } from "./vault-service";

export class TableSyncService {
  private vaultService: VaultService;

  constructor(vaultService: VaultService) {
    this.vaultService = vaultService;
  }

  public async syncCodeBlock(
    sourcePath: string,
    tableData: MarkdownTableData,
    initialSource?: string
  ): Promise<void> {
    if (!sourcePath) return;

    const newMarkdown = serializeMarkdownTable(tableData);
    const replacement = `\`\`\`table\n${newMarkdown}\n\`\`\``;

    const transform = (content: string): string => {
      if (initialSource) {
        // Escape every RegExp metacharacter so the block body matches literally
        const escaped = initialSource.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        // Fenced block of a supported language that contains this exact source
        const exactBlockRegex = new RegExp(
          "```(?:table|notion-table|tablebase)[\\s\\S]*?" + escaped + "[\\s\\S]*?```"
        );
        if (exactBlockRegex.test(content)) {
          return content.replace(exactBlockRegex, replacement);
        }
      }

      // Matches the first code block fenced by table, notion-table, or tablebase
      const firstTableBlockRegex = /```(?:table|notion-table|tablebase)[\s\S]*?```/;
      return content.replace(firstTableBlockRegex, replacement);
    };

    await this.vaultService.modifyFile(sourcePath, transform);
  }

  public async syncInlineTable(
    sourcePath: string,
    transform: (content: string) => string
  ): Promise<void> {
    if (!sourcePath) return;
    await this.vaultService.modifyFile(sourcePath, transform);
  }
}
