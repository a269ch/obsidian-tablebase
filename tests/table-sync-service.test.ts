import { describe, it, expect, vi } from "vitest";
import { TableSyncService } from "../src/services/table-sync-service";
import { VaultService } from "../src/services/vault-service";
import { MarkdownTableData } from "../src/types";

describe("TableSyncService", () => {
  const createMockVaultService = (initialContent: string) => {
    let content = initialContent;
    const modifyFile = vi.fn(async (_path: string, transform: (c: string) => string) => {
      content = transform(content);
      return true;
    });

    const vaultService = {
      modifyFile,
    } as unknown as VaultService;

    return {
      vaultService,
      getContent: () => content,
    };
  };

  const sampleTableData: MarkdownTableData = {
    id: "tbl_1",
    headers: ["Task", "Status"],
    alignments: ["---", "---"],
    rows: [
      { rowIndex: 0, rawLine: "", cells: ["Write docs", "Done"] },
    ],
    startLine: 0,
    endLine: 2,
    rawMarkdown: "",
  };

  it("should sync code block table replacing the exact block", async () => {
    const originalDoc = `# My Note\n\n\`\`\`table\n| Task | Status |\n| --- | --- |\n| Old | Todo |\n\`\`\`\n\nFooter text`;
    const { vaultService, getContent } = createMockVaultService(originalDoc);
    const syncService = new TableSyncService(vaultService);

    await syncService.syncCodeBlock(
      "test.md",
      sampleTableData,
      "| Task | Status |\n| --- | --- |\n| Old | Todo |"
    );

    const updated = getContent();
    expect(updated).toContain("```table");
    expect(updated).toMatch(/\|\s*Task\s*\|\s*Status\s*\|/);
    expect(updated).toMatch(/\|\s*Write docs\s*\|\s*Done\s*\|/);
    expect(updated).toContain("Footer text");
  });

  it("should sync inline table by executing document mutation transform", async () => {
    const originalDoc = `# My Note\n\n| Col1 | Col2 |\n| --- | --- |\n| A | B |\n`;
    const { vaultService, getContent } = createMockVaultService(originalDoc);
    const syncService = new TableSyncService(vaultService);

    await syncService.syncInlineTable("test.md", (c) => c.replace("| A | B |", "| A2 | B2 |"));

    expect(getContent()).toContain("| A2 | B2 |");
  });

  it("should do nothing when sourcePath is empty", async () => {
    const { vaultService } = createMockVaultService("text");
    const syncService = new TableSyncService(vaultService);

    await syncService.syncCodeBlock("", sampleTableData);
    expect(vaultService.modifyFile).not.toHaveBeenCalled();

    await syncService.syncInlineTable("", (c) => c);
    expect(vaultService.modifyFile).not.toHaveBeenCalled();
  });
});
