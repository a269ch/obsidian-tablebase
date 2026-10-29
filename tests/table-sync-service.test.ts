import { describe, it, expect, vi } from "vitest";
import { TableSyncService } from "../src/services/table-sync-service";
import { VaultService } from "../src/services/vault-service";
import { MarkdownTableData } from "../src/types";
import { serializeMarkdownTable } from "../src/core/markdown-parser";

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

  it("should sync a table too large to embed in a regular expression", async () => {
    const longCell = "x".repeat(400);
    const rows = Array.from({ length: 200 }, (_, i) => `| ${longCell} ${i} | Todo |`);
    const source = ["| Task | Status |", "| --- | --- |", ...rows].join("\n");
    const { vaultService, getContent } = createMockVaultService(`# Note\n\n\`\`\`table\n${source}\n\`\`\`\n`);
    const syncService = new TableSyncService(vaultService);

    await syncService.syncCodeBlock("test.md", sampleTableData, source);

    expect(getContent()).toMatch(/\|\s*Write docs\s*\|\s*Done\s*\|/);
    expect(getContent()).not.toContain(longCell);
  });

  const sync = async (doc: string, source?: string, lineHint?: number, data = sampleTableData) => {
    const { vaultService, getContent } = createMockVaultService(doc);
    const saved = await new TableSyncService(vaultService).syncCodeBlock("test.md", data, source, lineHint);
    return { saved, content: getContent() };
  };
  const oldSource = "| Task | Status |\n| --- | --- |\n| Old | Todo |";
  const newBody = serializeMarkdownTable(sampleTableData);

  it("should replace only the matching block and keep its fence", async () => {
    const first = "| A | B |\n| --- | --- |\n| 1 | 2 |";
    const doc = `\`\`\`table\n${first}\n\`\`\`\n\nMiddle text\n\n\`\`\`notion-table\n${oldSource}\n\`\`\`\n`;

    const { saved, content } = await sync(doc, oldSource);

    expect(saved).toBe(true);
    expect(content).toBe(`\`\`\`table\n${first}\n\`\`\`\n\nMiddle text\n\n\`\`\`notion-table\n${newBody}\n\`\`\`\n`);
  });

  it("should write cell text containing $ patterns literally", async () => {
    const data: MarkdownTableData = {
      ...sampleTableData,
      rows: [{ rowIndex: 0, rawLine: "", cells: ["Run `$` then $& and $'", "Done"] }],
    };

    const { content } = await sync(`# Head\n\n\`\`\`table\n${oldSource}\n\`\`\`\n`, oldSource, undefined, data);

    expect(content).toContain("Run `$` then $& and $'");
    expect(content.match(/# Head/g)).toHaveLength(1);
  });

  it("should not overwrite another block when the source matches none", async () => {
    const single = "```table\n| A |\n| --- |\n| 1 |\n```\n";
    const several = `${single}\n${single.replace(/A/g, "B")}`;

    for (const doc of [single, several]) {
      const { saved, content } = await sync(doc, "| C |\n| --- |\n| 3 |");
      expect(saved).toBe(false);
      expect(content).toBe(doc);
    }
  });

  it("should use the line hint to pick among identical tables", async () => {
    const block = `\`\`\`table\n${oldSource}\n\`\`\``;
    const doc = `${block}\n\n${block}\n`;

    const { saved, content } = await sync(doc, oldSource, 6);
    expect(saved).toBe(true);
    expect(content).toBe(`${block}\n\n\`\`\`table\n${newBody}\n\`\`\`\n`);

    const ambiguous = await sync(doc, oldSource);
    expect(ambiguous.saved).toBe(false);
    expect(ambiguous.content).toBe(doc);
  });

  it("should not redirect to another match when the hinted block has changed", async () => {
    const doc = `\`\`\`table\n${oldSource}\n\`\`\`\n\n\`\`\`table\n| Changed |\n| --- |\n\`\`\`\n`;

    const { saved, content } = await sync(doc, oldSource, 6);

    expect(saved).toBe(false);
    expect(content).toBe(doc);
  });

  it("should skip table fences inside other fenced blocks", async () => {
    const example = `\`\`\`\`markdown\n\`\`\`table\n${oldSource}\n\`\`\`\n\`\`\`\``;
    const live = `\`\`\`table\n${oldSource}\n\`\`\``;

    const { content } = await sync(`${example}\n\n${live}\n`, oldSource);

    expect(content).toBe(`${example}\n\n\`\`\`table\n${newBody}\n\`\`\`\n`);
  });

  it("should honor tilde fences and longer closing fences", async () => {
    const tilde = `~~~table\n${oldSource}\n~~~~\n`;
    expect((await sync(tilde, oldSource)).content).toBe(`~~~table\n${newBody}\n~~~~\n`);

    const longClose = `\`\`\`table\n${oldSource}\n\`\`\`\`\n\ntext\n\n\`\`\`table\n| X |\n| --- |\n\`\`\`\n`;
    const { content } = await sync(longClose, oldSource);
    expect(content).toBe(longClose.replace(oldSource, newBody));
  });

  it("should keep list indentation and callout markers", async () => {
    const indented = (prefix: string, body: string) =>
      [`${prefix}\`\`\`table`, ...body.split("\n").map((line) => prefix + line), `${prefix}\`\`\``].join("\n");

    for (const prefix of ["   ", "> "]) {
      const doc = `- item\n${indented(prefix, oldSource)}\nafter`;
      const { saved, content } = await sync(doc, oldSource);
      expect(saved).toBe(true);
      expect(content).toBe(`- item\n${indented(prefix, newBody)}\nafter`);
    }
  });

  it("should keep each line ending as it was", async () => {
    const crlf = (text: string) => text.replace(/\n/g, "\r\n");
    const doc = `# Note\n\n${crlf(`\`\`\`table\n${oldSource}\n\`\`\`\n`)}End`;

    const { content } = await sync(doc, oldSource);

    expect(content).toBe(`# Note\n\n${crlf(`\`\`\`table\n${newBody}\n\`\`\`\n`)}End`);
  });

  it("should preserve mixed line endings in the replaced table body", async () => {
    const doc = [
      "```table\r",
      "| Task | Status |\r",
      "| --- | --- |",
      "| Old | Todo |\r",
      "```",
      "",
    ].join("\n");

    const { content } = await sync(doc, oldSource);

    const newLines = newBody.split("\n");
    expect(content).toBe(
      [
        "```table\r",
        `${newLines[0]}\r`,
        newLines[1],
        `${newLines[2]}\r`,
        "```",
        "",
      ].join("\n")
    );
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
