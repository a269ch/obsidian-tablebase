import { describe, it, expect } from "vitest";
import {
  isCellChecked,
  parseCellNumber,
  sortRows,
  sortRowsByRules,
} from "../src/core/sort-engine";
import { MarkdownTableRow, SortRule, TableColumn } from "../src/types";

describe("Sort Engine", () => {
  it("should check if cells are checked checkboxes", () => {
    expect(isCellChecked("[x]")).toBe(true);
    expect(isCellChecked("[X]")).toBe(true);
    expect(isCellChecked("true")).toBe(true);
    expect(isCellChecked("✓")).toBe(true);
    expect(isCellChecked("[ ]")).toBe(false);
    expect(isCellChecked("false")).toBe(false);
    expect(isCellChecked("")).toBe(false);
  });

  it("should parse cell numbers with currency, percentage, spaces", () => {
    expect(parseCellNumber("$150.00")).toBe(150);
    expect(parseCellNumber("45%")).toBe(45);
    expect(parseCellNumber("-12.5")).toBe(-12.5);
    expect(parseCellNumber("1 500")).toBe(1500);
    expect(parseCellNumber("12,50 €")).toBe(12.5);
    expect(parseCellNumber("1.200,50")).toBe(1200.5);
    expect(parseCellNumber("$1,200.50")).toBe(1200.5);
    expect(parseCellNumber("500 USD")).toBe(500);
    expect(isNaN(parseCellNumber("hello"))).toBe(true);
  });

  it("should sort text rows ascending and descending", () => {
    const rows: MarkdownTableRow[] = [
      { rowIndex: 0, rawLine: "", cells: ["Banana"] },
      { rowIndex: 1, rawLine: "", cells: ["Apple"] },
      { rowIndex: 2, rawLine: "", cells: ["Cherry"] },
    ];

    const asc = sortRows(rows, 0, "asc", "text");
    expect(asc.map((r) => r.cells[0])).toEqual(["Apple", "Banana", "Cherry"]);

    const desc = sortRows(rows, 0, "desc", "text");
    expect(desc.map((r) => r.cells[0])).toEqual(["Cherry", "Banana", "Apple"]);
  });

  it("should sort number rows numerically", () => {
    const rows: MarkdownTableRow[] = [
      { rowIndex: 0, rawLine: "", cells: ["$100"] },
      { rowIndex: 1, rawLine: "", cells: ["$20"] },
      { rowIndex: 2, rawLine: "", cells: ["$5"] },
    ];

    const asc = sortRows(rows, 0, "asc", "number");
    expect(asc.map((r) => r.cells[0])).toEqual(["$5", "$20", "$100"]);
  });

  it("should sort multi-select tags alphabetically", () => {
    const rows: MarkdownTableRow[] = [
      { rowIndex: 0, rawLine: "", cells: ["Frontend, UI"] },
      { rowIndex: 1, rawLine: "", cells: ["Backend"] },
      { rowIndex: 2, rawLine: "", cells: ["Design"] },
    ];

    const asc = sortRows(rows, 0, "asc", "multi-select");
    expect(asc.map((r) => r.cells[0])).toEqual(["Backend", "Design", "Frontend, UI"]);
  });

  it("should sort checkbox rows (checked vs unchecked)", () => {
    const rows: MarkdownTableRow[] = [
      { rowIndex: 0, rawLine: "", cells: ["[ ]"] },
      { rowIndex: 1, rawLine: "", cells: ["[x]"] },
      { rowIndex: 2, rawLine: "", cells: ["[ ]"] },
    ];

    const asc = sortRows(rows, 0, "asc", "checkbox");
    expect(asc[0].cells[0]).toBe("[ ]");
    expect(asc[2].cells[0]).toBe("[x]");
  });
});

describe("Multi-rule sorting", () => {
  const columns: TableColumn[] = [
    { name: "Team", index: 0, type: "text" },
    { name: "Score", index: 1, type: "number" },
  ];

  const rows: MarkdownTableRow[] = [
    { rowIndex: 0, rawLine: "", cells: ["Beta", "10"] },
    { rowIndex: 1, rawLine: "", cells: ["Alpha", "30"] },
    { rowIndex: 2, rawLine: "", cells: ["Beta", "20"] },
    { rowIndex: 3, rawLine: "", cells: ["Alpha", "5"] },
  ];

  it("should treat the first rule as the primary sort key", () => {
    const sortRules: SortRule[] = [
      { column: "Team", columnIndex: 0, direction: "asc" },
      { column: "Score", columnIndex: 1, direction: "desc" },
    ];

    const sorted = sortRowsByRules(rows, sortRules, columns);

    expect(sorted.map((r) => `${r.cells[0]}:${r.cells[1]}`)).toEqual([
      "Alpha:30",
      "Alpha:5",
      "Beta:20",
      "Beta:10",
    ]);
  });

  it("should fall back to later rules only when earlier rules tie", () => {
    const sortRules: SortRule[] = [
      { column: "Team", columnIndex: 0, direction: "desc" },
      { column: "Score", columnIndex: 1, direction: "asc" },
    ];

    const sorted = sortRowsByRules(rows, sortRules, columns);

    expect(sorted.map((r) => `${r.cells[0]}:${r.cells[1]}`)).toEqual([
      "Beta:10",
      "Beta:20",
      "Alpha:5",
      "Alpha:30",
    ]);
  });

  it("should return rows untouched when no sort rules are supplied", () => {
    expect(sortRowsByRules(rows, [], columns)).toBe(rows);
  });

  it("should not mutate the input array", () => {
    const original = [...rows];
    sortRowsByRules(rows, [{ column: "Score", columnIndex: 1, direction: "asc" }], columns);
    expect(rows).toEqual(original);
  });

  it("should default to text comparison for unknown column indices", () => {
    const sorted = sortRowsByRules(
      rows,
      [{ column: "Missing", columnIndex: 9, direction: "asc" }],
      columns
    );
    expect(sorted).toHaveLength(rows.length);
  });
});
