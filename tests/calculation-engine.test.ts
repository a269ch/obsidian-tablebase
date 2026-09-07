import { describe, it, expect } from "vitest";
import {
  calculateColumnSummary,
  extractNumbers,
  getCalculationOptionsForColumnType,
  isCellFilled,
} from "../src/core/calculation-engine";
import { CalculationType, MarkdownTableRow } from "../src/types";

describe("Calculation Engine", () => {
  const rows: MarkdownTableRow[] = [
    { rowIndex: 0, rawLine: "", cells: ["10", "Frontend, UI", "[x]"] },
    { rowIndex: 1, rawLine: "", cells: ["20", "Backend", "[ ]"] },
    { rowIndex: 2, rawLine: "", cells: ["30", "Frontend", "[x]"] },
    { rowIndex: 3, rawLine: "", cells: ["-", "", "[x]"] },
  ];

  it("should calculate count all, empty, not empty, unique", () => {
    expect(calculateColumnSummary(rows, 0, "count_all", "text")?.value).toBe("4");
    expect(calculateColumnSummary(rows, 0, "count_values", "text")?.value).toBe("3");
    expect(calculateColumnSummary(rows, 0, "count_empty", "text")?.value).toBe("1");
    expect(calculateColumnSummary(rows, 1, "count_unique", "multi-select")?.value).toBe("3");
  });

  it("should calculate sum, average, min, max for numbers", () => {
    expect(calculateColumnSummary(rows, 0, "sum", "number")?.value).toBe("60");
    expect(calculateColumnSummary(rows, 0, "average", "number")?.value).toBe("20");
    expect(calculateColumnSummary(rows, 0, "min", "number")?.value).toBe("10");
    expect(calculateColumnSummary(rows, 0, "max", "number")?.value).toBe("30");
  });

  it("should calculate checkbox count and percentages", () => {
    expect(calculateColumnSummary(rows, 2, "count_checked", "checkbox")?.value).toBe("3");
    expect(calculateColumnSummary(rows, 2, "count_unchecked", "checkbox")?.value).toBe("1");
    expect(calculateColumnSummary(rows, 2, "percent_checked", "checkbox")?.value).toBe("75%");
    expect(calculateColumnSummary(rows, 2, "percent_unchecked", "checkbox")?.value).toBe("25%");
  });

  it("should calculate sum and average for formatted currency and international numbers", () => {
    const currencyRows: MarkdownTableRow[] = [
      { rowIndex: 0, rawLine: "", cells: ["$1,200.50"] },
      { rowIndex: 1, rawLine: "", cells: ["$300.00"] },
      { rowIndex: 2, rawLine: "", cells: ["12,50 €"] },
    ];
    expect(calculateColumnSummary(currencyRows, 0, "sum", "number")?.value).toBe("1513");
  });

  it("should calculate unique items for select columns", () => {
    const selectRows: MarkdownTableRow[] = [
      { rowIndex: 0, rawLine: "", cells: ["Done"] },
      { rowIndex: 1, rawLine: "", cells: ["In Progress"] },
      { rowIndex: 2, rawLine: "", cells: ["Done"] },
    ];
    expect(calculateColumnSummary(selectRows, 0, "count_unique", "select")?.value).toBe("2");
  });

  it("should calculate count_not_empty and count_unique for text columns", () => {
    const textRows: MarkdownTableRow[] = [
      { rowIndex: 0, rawLine: "", cells: ["Apple"] },
      { rowIndex: 1, rawLine: "", cells: ["Banana"] },
      { rowIndex: 2, rawLine: "", cells: ["apple"] },
      { rowIndex: 3, rawLine: "", cells: ["-"] },
      { rowIndex: 4, rawLine: "", cells: [""] },
    ];
    expect(calculateColumnSummary(textRows, 0, "count_not_empty", "text")?.value).toBe("3");
    expect(calculateColumnSummary(textRows, 0, "count_unique", "text")?.value).toBe("2");
  });

  it("should return null for none or unsupported calculation type", () => {
    expect(calculateColumnSummary(rows, 0, "none", "text")).toBeNull();

    expect(
      calculateColumnSummary(rows, 0, "unknown" as CalculationType, "text")
    ).toBeNull();
  });

  it("should handle empty cell lists for number aggregations", () => {
    const emptyRows: MarkdownTableRow[] = [];
    expect(calculateColumnSummary(emptyRows, 0, "average", "number")?.value).toBe("0");
    expect(calculateColumnSummary(emptyRows, 0, "min", "number")?.value).toBe("-");
    expect(calculateColumnSummary(emptyRows, 0, "max", "number")?.value).toBe("-");
    expect(calculateColumnSummary(emptyRows, 0, "percent_checked", "checkbox")?.value).toBe("0%");
    expect(calculateColumnSummary(emptyRows, 0, "percent_unchecked", "checkbox")?.value).toBe("0%");
  });

  it("isCellFilled and extractNumbers helpers should operate as expected", () => {
    expect(isCellFilled("")).toBe(false);
    expect(isCellFilled(" - ")).toBe(false);
    expect(isCellFilled("valid text")).toBe(true);
    expect(extractNumbers(["10", "abc", "$25.50", "-", ""])).toEqual([10, 25.5]);
  });

  it("should return column-appropriate calculation options", () => {
    const numOpts = getCalculationOptionsForColumnType("number").map((o) => o.value);
    expect(numOpts).toContain("sum");
    expect(numOpts).toContain("average");
    expect(numOpts).toContain("min");
    expect(numOpts).toContain("max");

    const chkOpts = getCalculationOptionsForColumnType("checkbox").map((o) => o.value);
    expect(chkOpts).toContain("count_checked");
    expect(chkOpts).toContain("percent_checked");
    expect(chkOpts).not.toContain("sum");

    const textOpts = getCalculationOptionsForColumnType("text").map((o) => o.value);
    expect(textOpts).toContain("count_all");
    expect(textOpts).toContain("count_unique");
    expect(textOpts).not.toContain("sum");
  });
});
