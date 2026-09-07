import { describe, it, expect } from "vitest";
import {
  addColumnToDocument,
  addRowToDocument,
  changeColumnAlignmentInDocument,
  deleteColumnFromDocument,
  deleteRowFromDocument,
  exportTableToCSV,
  formatColumnAlignmentToken,
  isDelimiterRow,
  mutateTableInDocument,
  parseColumnAlignment,
  parseMarkdownTables,
  renameColumnInDocument,
  reorderColumnInDocument,
  reorderRowInDocument,
  serializeMarkdownTable,
  splitTableRow,
  updateCellInDocument,
} from "../src/core/markdown-parser";

describe("Markdown Table Parser & Serializer", () => {
  describe("splitTableRow", () => {
    it("should correctly split table row by pipes", () => {
      const line = "| Task | Status | Tags |";
      expect(splitTableRow(line)).toEqual(["Task", "Status", "Tags"]);
    });

    it("should handle rows without leading and trailing pipes", () => {
      const line = "Task | Status | Tags";
      expect(splitTableRow(line)).toEqual(["Task", "Status", "Tags"]);
    });

    it("should handle escaped pipes (\\|) inside cell text", () => {
      const line = "| Formula | Result \\| Status | Notes |";
      const cells = splitTableRow(line);
      expect(cells).toEqual(["Formula", "Result \\| Status", "Notes"]);
    });

    it("should preserve pipes inside Obsidian wikilinks [[Page|Alias]]", () => {
      const line = "| [[Projects/2026|My Project]] | Done | High |";
      const cells = splitTableRow(line);
      expect(cells).toEqual(["[[Projects/2026|My Project]]", "Done", "High"]);
    });

    it("should preserve pipes inside inline code spans `a | b`", () => {
      const line = "| `const x = a | b;` | Code | Low |";
      const cells = splitTableRow(line);
      expect(cells).toEqual(["`const x = a | b;`", "Code", "Low"]);
    });
  });

  describe("isDelimiterRow", () => {
    it("should identify valid delimiter rows with alignments", () => {
      expect(isDelimiterRow("| --- | :---: | ---: |")).toBe(true);
      expect(isDelimiterRow("|:---|:---:|---:|")).toBe(true);
      expect(isDelimiterRow("--- | --- | ---")).toBe(true);
    });

    it("should reject non-delimiter rows", () => {
      expect(isDelimiterRow("| Task | Status | Tags |")).toBe(false);
      expect(isDelimiterRow("| Item 1 | In Progress | Urgent |")).toBe(false);
      expect(isDelimiterRow("")).toBe(false);
    });
  });

  describe("parseMarkdownTables & serializeMarkdownTable", () => {
    const mdSample = `# Project Tasks

Some paragraph here.

| Task | Status | Tags | Priority |
| :--- | :---: | ---: | --- |
| Implement Auth | Done | Backend, Security | High |
| Redesign Header | In Progress | Frontend, UI | Medium |
| Write Unit Tests | Backlog | Testing, QA | Low |

Another paragraph below table.`;

    it("should parse table structure correctly", () => {
      const tables = parseMarkdownTables(mdSample);
      expect(tables.length).toBe(1);

      const table = tables[0];
      expect(table.headers).toEqual(["Task", "Status", "Tags", "Priority"]);
      expect(table.alignments).toEqual([":---", ":---:", "---:", "---"]);
      expect(table.rows.length).toBe(3);
      expect(table.rows[0].cells).toEqual(["Implement Auth", "Done", "Backend, Security", "High"]);
      expect(table.rows[1].cells).toEqual(["Redesign Header", "In Progress", "Frontend, UI", "Medium"]);
      expect(table.rows[2].cells).toEqual(["Write Unit Tests", "Backlog", "Testing, QA", "Low"]);
    });

    it("should serialize table back to aligned markdown table", () => {
      const tables = parseMarkdownTables(mdSample);
      const serialized = serializeMarkdownTable(tables[0]);

      expect(serialized).toContain("| Task");
      expect(serialized).toContain("| Implement Auth");
      expect(serialized).toContain("| Redesign Header");
      expect(serialized).toContain("| Write Unit Tests");

      const reparsed = parseMarkdownTables(serialized);
      expect(reparsed.length).toBe(1);
      expect(reparsed[0].headers).toEqual(tables[0].headers);
      expect(reparsed[0].rows[0].cells).toEqual(tables[0].rows[0].cells);
    });
  });

  describe("Document Table Mutations", () => {
    const originalDoc = `# Header

| Task | Tags |
| --- | --- |
| Task 1 | Bug, UI |
| Task 2 | Docs |

End of doc.`;

    it("should update specific cell", () => {
      const tables = parseMarkdownTables(originalDoc);
      const startLine = tables[0].startLine;

      const updatedDoc = updateCellInDocument(
        originalDoc,
        startLine,
        0,
        1,
        "Bug, UI, Critical"
      );

      expect(updatedDoc).toContain("Bug, UI, Critical");
      expect(updatedDoc).toContain("# Header");
    });

    it("should add a new row to document", () => {
      const tables = parseMarkdownTables(originalDoc);
      const startLine = tables[0].startLine;

      const updatedDoc = addRowToDocument(originalDoc, startLine, ["Task 3", "Feature"]);
      expect(updatedDoc).toContain("Task 3");
      expect(updatedDoc).toContain("Feature");

      const newTables = parseMarkdownTables(updatedDoc);
      expect(newTables[0].rows.length).toBe(3);
    });

    it("should insert a row at an explicit index instead of appending", () => {
      const tables = parseMarkdownTables(originalDoc);
      const startLine = tables[0].startLine;

      const updatedDoc = addRowToDocument(
        originalDoc,
        startLine,
        ["Inserted", "New"],
        undefined,
        undefined,
        0
      );

      const newTables = parseMarkdownTables(updatedDoc);
      expect(newTables[0].rows.length).toBe(3);
      expect(newTables[0].rows[0].cells[0]).toBe("Inserted");
      expect(newTables[0].rows.map((r) => r.rowIndex)).toEqual([0, 1, 2]);
    });

    it("should append when the requested insert index is out of range", () => {
      const tables = parseMarkdownTables(originalDoc);
      const startLine = tables[0].startLine;

      const updatedDoc = addRowToDocument(
        originalDoc,
        startLine,
        ["Appended", "Tag"],
        undefined,
        undefined,
        99
      );

      const newTables = parseMarkdownTables(updatedDoc);
      const rows = newTables[0].rows;
      expect(rows[rows.length - 1].cells[0]).toBe("Appended");
    });

    it("should delete a row from document", () => {
      const tables = parseMarkdownTables(originalDoc);
      const startLine = tables[0].startLine;

      const updatedDoc = deleteRowFromDocument(originalDoc, startLine, 0);
      expect(updatedDoc).not.toContain("Task 1");
      expect(updatedDoc).toContain("Task 2");

      const newTables = parseMarkdownTables(updatedDoc);
      expect(newTables[0].rows.length).toBe(1);
    });

    it("should add a new column to document", () => {
      const tables = parseMarkdownTables(originalDoc);
      const startLine = tables[0].startLine;

      const updatedDoc = addColumnToDocument(originalDoc, startLine, "Priority");
      expect(updatedDoc).toContain("Priority");

      const newTables = parseMarkdownTables(updatedDoc);
      expect(newTables[0].headers).toEqual(["Task", "Tags", "Priority"]);
    });

    it("should rename a column in document", () => {
      const tables = parseMarkdownTables(originalDoc);
      const startLine = tables[0].startLine;

      const updatedDoc = renameColumnInDocument(originalDoc, startLine, 0, "Title");
      const newTables = parseMarkdownTables(updatedDoc);
      expect(newTables[0].headers[0]).toBe("Title");
    });

    it("should delete a column from document", () => {
      const tables = parseMarkdownTables(originalDoc);
      const startLine = tables[0].startLine;

      const updatedDoc = deleteColumnFromDocument(originalDoc, startLine, 1);
      const newTables = parseMarkdownTables(updatedDoc);
      expect(newTables[0].headers).toEqual(["Task"]);
      expect(newTables[0].rows[0].cells.length).toBe(1);
    });

    it("should reorder rows in document", () => {
      const tables = parseMarkdownTables(originalDoc);
      const startLine = tables[0].startLine;

      const updatedDoc = reorderRowInDocument(originalDoc, startLine, 0, 1);
      const newTables = parseMarkdownTables(updatedDoc);
      expect(newTables[0].rows[0].cells[0]).toBe("Task 2");
      expect(newTables[0].rows[1].cells[0]).toBe("Task 1");
    });

    it("should reorder columns in document", () => {
      const tables = parseMarkdownTables(originalDoc);
      const startLine = tables[0].startLine;

      const updatedDoc = reorderColumnInDocument(originalDoc, startLine, 0, 1);
      const newTables = parseMarkdownTables(updatedDoc);
      expect(newTables[0].headers).toEqual(["Tags", "Task"]);
      expect(newTables[0].rows[0].cells).toEqual(["Bug, UI", "Task 1"]);
    });

    it("should export table to CSV", () => {
      const tables = parseMarkdownTables(originalDoc);
      const csv = exportTableToCSV(tables[0]);
      expect(csv).toContain("Task,Tags");
      expect(csv).toContain('Task 1,"Bug, UI"');
    });

    it("should export table to CSV with hidden columns excluded", () => {
      const tables = parseMarkdownTables(originalDoc);
      const csv = exportTableToCSV(tables[0], [1]);
      expect(csv).toContain("Task");
      expect(csv).not.toContain("Tags");
      expect(csv).toContain("Task 1");
      expect(csv).not.toContain("Bug, UI");
    });

    it("should allow arbitrary atomic mutations via mutateTableInDocument", () => {
      const updated = mutateTableInDocument(originalDoc, 0, (table) => {
        table.rows[0].cells[0] = "Mutated 1";
        table.headers.push("Extra");
        table.alignments.push("---");
        table.rows.forEach((r) => r.cells.push("val"));
        return true;
      });
      const newTables = parseMarkdownTables(updated);
      expect(newTables[0].rows[0].cells[0]).toBe("Mutated 1");
      expect(newTables[0].headers).toEqual(["Task", "Tags", "Extra"]);
    });

    it("should cancel mutation when callback returns false", () => {
      const result = mutateTableInDocument(originalDoc, 0, (table) => {
        table.rows[0].cells[0] = "Should not apply";
        return false;
      });
      expect(result).toBe(originalDoc);
    });

    it("should preserve CRLF line endings through document mutations", () => {
      const crlfDoc = "Header\r\n\r\n| A | B |\r\n| --- | --- |\r\n| 1 | 2 |\r\n\r\nFooter";
      const updated = updateCellInDocument(crlfDoc, 2, 0, 0, "99");
      expect(updated).toContain("\r\n");
      expect(updated).not.toMatch(/[^\r]\n/);
      expect(updated).toContain("99");
    });

    it("should target specific table in multi-table document by tableIndex or headers", () => {
      const multiDoc = `# Section 1
| First | Col |\n| --- | --- |\n| a | b |

# Section 2
| Second | Col |\n| --- | --- |\n| x | y |`;

      const updatedByIndex = updateCellInDocument(multiDoc, -1, 0, 0, "z", undefined, 1);
      const tables1 = parseMarkdownTables(updatedByIndex);
      expect(tables1[0].rows[0].cells[0]).toBe("a");
      expect(tables1[1].rows[0].cells[0]).toBe("z");

      const updatedByHeaders = updateCellInDocument(multiDoc, -1, 0, 0, "w", ["Second", "Col"]);
      const tables2 = parseMarkdownTables(updatedByHeaders);
      expect(tables2[0].rows[0].cells[0]).toBe("a");
      expect(tables2[1].rows[0].cells[0]).toBe("w");
    });

    it("should safely return unmodified document on invalid row or col indices", () => {
      expect(reorderRowInDocument(originalDoc, 0, -1, 0)).toBe(originalDoc);
      expect(reorderRowInDocument(originalDoc, 0, 0, 99)).toBe(originalDoc);
      expect(reorderColumnInDocument(originalDoc, 0, -1, 0)).toBe(originalDoc);
      expect(reorderColumnInDocument(originalDoc, 0, 0, 99)).toBe(originalDoc);
      expect(deleteRowFromDocument(originalDoc, 0, 99)).toBe(originalDoc);
      expect(deleteColumnFromDocument(originalDoc, 0, 99)).toBe(originalDoc);
      expect(renameColumnInDocument(originalDoc, 0, 99, "New")).toBe(originalDoc);
    });

    it("should change column alignment in document", () => {
      const doc = `# Notes
| Title | Count | Status |
| --- | --- | --- |
| Task 1 | 5 | Done |`;

      const updated1 = changeColumnAlignmentInDocument(doc, 1, 1, "right");
      const tables1 = parseMarkdownTables(updated1);
      expect(tables1[0].alignments[1]).toBe("----:");
      expect(parseColumnAlignment(tables1[0].alignments[1])).toBe("right");

      const updated2 = changeColumnAlignmentInDocument(updated1, 1, 2, "center");
      const tables2 = parseMarkdownTables(updated2);
      expect(tables2[0].alignments[2]).toBe(":----:");
      expect(parseColumnAlignment(tables2[0].alignments[2])).toBe("center");

      const updated3 = changeColumnAlignmentInDocument(updated2, 1, 0, "left");
      const tables3 = parseMarkdownTables(updated3);
      expect(tables3[0].alignments[0]).toBe(":-----");
      expect(parseColumnAlignment(tables3[0].alignments[0])).toBe("left");

      expect(changeColumnAlignmentInDocument(doc, 1, 99, "center")).toBe(doc);
    });
  });

  describe("Column Alignment Helpers", () => {
    it("should parse various alignment delimiter tokens", () => {
      expect(parseColumnAlignment(":---:")).toBe("center");
      expect(parseColumnAlignment(":-:")).toBe("center");
      expect(parseColumnAlignment(":------:")).toBe("center");
      expect(parseColumnAlignment("---:")).toBe("right");
      expect(parseColumnAlignment("--:")).toBe("right");
      expect(parseColumnAlignment(":---")).toBe("left");
      expect(parseColumnAlignment(":--")).toBe("left");
      expect(parseColumnAlignment("---")).toBe("left");
      expect(parseColumnAlignment("")).toBe("left");
      expect(parseColumnAlignment(undefined)).toBe("left");
    });

    it("should format alignment tokens with desired minimum width", () => {
      expect(formatColumnAlignmentToken("center", 3)).toBe(":---:");
      expect(formatColumnAlignmentToken("right", 3)).toBe("---:");
      expect(formatColumnAlignmentToken("left", 3)).toBe(":---");
      expect(formatColumnAlignmentToken("center", 6)).toBe(":----:");
      expect(formatColumnAlignmentToken("right", 6)).toBe("-----:");
    });
  });
});
