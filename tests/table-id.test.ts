import { describe, it, expect } from "vitest";
import { parseMarkdownTables } from "../src/core/markdown-parser";
import {
  buildStableTableId,
  findTableOccurrenceInDocument,
  isStableTableId,
  normalizeTableHeaderSignature,
  parseOccurrenceFromTableId,
  STABLE_TABLE_ID_PREFIX,
} from "../src/core/table-id";

describe("table-id", () => {
  it("scopes stable IDs by sourcePath and normalized headers", () => {
    const idA = buildStableTableId({
      sourcePath: "notes/project-a.md",
      headers: ["Task", "Status [select]"],
      occurrence: 0,
    });
    const idB = buildStableTableId({
      sourcePath: "notes/project-b.md",
      headers: ["Task", "Status [select]"],
      occurrence: 0,
    });
    const idAnnotationChanged = buildStableTableId({
      sourcePath: "notes/project-a.md",
      headers: ["  task ", "STATUS [multi-select]"],
      occurrence: 0,
    });

    expect(idA.startsWith(STABLE_TABLE_ID_PREFIX)).toBe(true);
    expect(isStableTableId(idA)).toBe(true);
    expect(isStableTableId("tbl_0_3")).toBe(false);
    expect(idA).not.toBe(idB);
    expect(idA).toBe(idAnnotationChanged);
    expect(parseOccurrenceFromTableId(idA)).toBe(0);
    expect(normalizeTableHeaderSignature(["Task [text]", " Status [select] "])).toBe("task\x1fstatus");
  });

  it("extracts trailing occurrence index from stable IDs", () => {
    const id = buildStableTableId({
      sourcePath: "notes/doc.md",
      headers: ["Name", "Count"],
      occurrence: 2,
    });
    expect(parseOccurrenceFromTableId(id)).toBe(2);
    expect(parseOccurrenceFromTableId("legacy_0_2")).toBe(0);
  });

  it("computes per-signature occurrence for multiple inline tables and preserves IDs when rows are added", () => {
    const before = [
      "# Notes",
      "",
      "| Task | Status |",
      "| --- | --- |",
      "| One | Todo |",
      "",
      "| Name | Score |",
      "| --- | --- |",
      "| Alice | 10 |",
      "",
      "| Task | Status |",
      "| --- | --- |",
      "| Two | Done |",
    ].join("\n");

    const parsedBefore = parseMarkdownTables(before);
    expect(parsedBefore).toHaveLength(3);

    expect(
      findTableOccurrenceInDocument(before, { startLine: parsedBefore[0].startLine, isCodeBlock: false })
    ).toBe(0);
    expect(
      findTableOccurrenceInDocument(before, { startLine: parsedBefore[1].startLine, isCodeBlock: false })
    ).toBe(0);
    expect(
      findTableOccurrenceInDocument(before, { startLine: parsedBefore[2].startLine, isCodeBlock: false })
    ).toBe(1);

    const afterAddingRow = [
      "# Notes",
      "",
      "| Task | Status |",
      "| --- | --- |",
      "| One | Todo |",
      "| Extra row | Todo |",
      "",
      "| Name | Score |",
      "| --- | --- |",
      "| Alice | 10 |",
      "",
      "| Task | Status |",
      "| --- | --- |",
      "| Two | Done |",
    ].join("\n");

    const parsedAfter = parseMarkdownTables(afterAddingRow);
    expect(parsedAfter[2].startLine).not.toBe(parsedBefore[2].startLine);
    expect(
      findTableOccurrenceInDocument(afterAddingRow, {
        startLine: parsedAfter[2].startLine,
        isCodeBlock: false,
      })
    ).toBe(1);
  });

  it("counts codeblock and mixed inline/codeblock tables consistently while ignoring plain code fences", () => {
    const doc = [
      "```markdown",
      "| Task | Status |",
      "| --- | --- |",
      "| Example | Ignored |",
      "```",
      "",
      "| Task | Status |",
      "| --- | --- |",
      "| Inline 1 | Todo |",
      "",
      "```tablebase",
      "| Task | Status |",
      "| --- | --- |",
      "| Block 1 | Doing |",
      "```",
      "",
      "```notion-table",
      "| Task | Status |",
      "| --- | --- |",
      "| Block 2 | Done |",
      "```",
    ].join("\n");

    expect(findTableOccurrenceInDocument(doc, { startLine: 6, isCodeBlock: false })).toBe(0);
    expect(findTableOccurrenceInDocument(doc, { startLine: 10, isCodeBlock: true })).toBe(1);
    expect(findTableOccurrenceInDocument(doc, { startLine: 16, isCodeBlock: true })).toBe(2);
  });

  it("counts fenced table codeblocks inside Obsidian callouts", () => {
    const doc = [
      "> [!note] Project",
      "> ```tablebase",
      "> | Task | Status |",
      "> | --- | --- |",
      "> | Inside callout | Todo |",
      "> ```",
      "",
      "| Task | Status |",
      "| --- | --- |",
      "| Outside callout | Done |",
    ].join("\n");

    const parsed = parseMarkdownTables(doc);
    expect(parsed).toHaveLength(1);
    expect(findTableOccurrenceInDocument(doc, { startLine: 1, isCodeBlock: true })).toBe(0);
    expect(
      findTableOccurrenceInDocument(doc, { startLine: parsed[0].startLine, isCodeBlock: false })
    ).toBe(1);
  });
});
