import { describe, it, expect } from "vitest";
import {
  evaluateRuleOnCell,
  filterTableRows,
  getFilterOperatorsForColumnType,
  parseFilterValues,
} from "../src/core/filter-engine";
import {
  MarkdownTableRow,
  TableColumn,
  TableFilterState,
} from "../src/types";

describe("Table Filter Engine", () => {
  const columns: TableColumn[] = [
    { name: "Task", index: 0, type: "text" },
    { name: "Status", index: 1, type: "multi-select" },
    { name: "Tags", index: 2, type: "multi-select" },
    { name: "Теги", index: 3, type: "multi-select" },
  ];

  const sampleRows: MarkdownTableRow[] = [
    {
      rowIndex: 0,
      rawLine: "| Fix Bug | In Progress | Frontend, Bug, Urgent | Срочно, Баг |",
      cells: ["Fix Bug", "In Progress", "Frontend, Bug, Urgent", "Срочно, Баг"],
    },
    {
      rowIndex: 1,
      rawLine: "| Add Auth | Done | Backend, Security | Бэкенд, Безопасность |",
      cells: ["Add Auth", "Done", "Backend, Security", "Бэкенд, Безопасность"],
    },
    {
      rowIndex: 2,
      rawLine: "| Update Docs | In Progress | Documentation | Документация |",
      cells: ["Update Docs", "In Progress", "Documentation", "Документация"],
    },
    {
      rowIndex: 3,
      rawLine: "| Refactor UI | Todo | Frontend, UI | Фронтенд, Интерфейс |",
      cells: ["Refactor UI", "Todo", "Frontend, UI", "Фронтенд, Интерфейс"],
    },
    {
      rowIndex: 4,
      rawLine: "| Empty Task | Todo | | |",
      cells: ["Empty Task", "Todo", "", ""],
    },
  ];

  describe("Multi-Select Operators on Cells", () => {
    const cellTags = "Frontend, Bug, Urgent";

    it("operator: contains", () => {
      expect(evaluateRuleOnCell(cellTags, "multi-select", "contains", "Bug")).toBe(true);
      expect(evaluateRuleOnCell(cellTags, "multi-select", "contains", ["bug", "other"])).toBe(true);
      expect(evaluateRuleOnCell(cellTags, "multi-select", "contains", "Backend")).toBe(false);
    });

    it("operator: is_one_of", () => {
      expect(evaluateRuleOnCell(cellTags, "multi-select", "is_one_of", "Bug, Security")).toBe(true);
      expect(evaluateRuleOnCell(cellTags, "multi-select", "is_one_of", ["Security", "Backend"])).toBe(false);
      expect(evaluateRuleOnCell("Done", "select", "is_one_of", "In Progress, Done")).toBe(true);
    });

    it("operator: is_not_one_of", () => {
      expect(evaluateRuleOnCell(cellTags, "multi-select", "is_not_one_of", "Backend, Security")).toBe(true);
      expect(evaluateRuleOnCell(cellTags, "multi-select", "is_not_one_of", "Bug, Backend")).toBe(false);
    });

    it("operator: does_not_contain", () => {
      expect(evaluateRuleOnCell(cellTags, "multi-select", "does_not_contain", "Backend")).toBe(true);
      expect(evaluateRuleOnCell(cellTags, "multi-select", "does_not_contain", "Frontend")).toBe(false);
    });

    it("operator: is_empty", () => {
      expect(evaluateRuleOnCell("", "multi-select", "is_empty", "")).toBe(true);
      expect(evaluateRuleOnCell("-", "multi-select", "is_empty", "")).toBe(true);
      expect(evaluateRuleOnCell(cellTags, "multi-select", "is_empty", "")).toBe(false);
    });

    it("operator: is_not_empty", () => {
      expect(evaluateRuleOnCell(cellTags, "multi-select", "is_not_empty", "")).toBe(true);
      expect(evaluateRuleOnCell("", "multi-select", "is_not_empty", "")).toBe(false);
    });

    it("operator: contains_all", () => {
      expect(evaluateRuleOnCell(cellTags, "multi-select", "contains_all", ["Frontend", "Bug"])).toBe(true);
      expect(evaluateRuleOnCell(cellTags, "multi-select", "contains_all", ["Frontend", "Backend"])).toBe(false);
    });

    it("operator: contains_any", () => {
      expect(evaluateRuleOnCell(cellTags, "multi-select", "contains_any", ["Backend", "Frontend"])).toBe(true);
      expect(evaluateRuleOnCell(cellTags, "multi-select", "contains_any", ["Backend", "Database"])).toBe(false);
    });

    it("operator: does_not_contain_any", () => {
      expect(evaluateRuleOnCell(cellTags, "multi-select", "does_not_contain_any", ["Backend", "DevOps"])).toBe(true);
      expect(evaluateRuleOnCell(cellTags, "multi-select", "does_not_contain_any", ["Backend", "Frontend"])).toBe(false);
    });

    it("supports cyrillic tags (Срочно, Баг, Фронтенд)", () => {
      const cyrillicCell = "Срочно, Баг, Релиз";
      expect(evaluateRuleOnCell(cyrillicCell, "multi-select", "contains", "Срочно")).toBe(true);
      expect(evaluateRuleOnCell(cyrillicCell, "multi-select", "contains", "баг")).toBe(true);
      expect(evaluateRuleOnCell(cyrillicCell, "multi-select", "does_not_contain", "Бэкенд")).toBe(true);
      expect(evaluateRuleOnCell(cyrillicCell, "multi-select", "contains_all", ["Срочно", "Релиз"])).toBe(true);
    });

    it("operator: equals and not_equals for multi-select", () => {
      expect(evaluateRuleOnCell("Bug", "multi-select", "equals", "bug")).toBe(true);
      expect(evaluateRuleOnCell(cellTags, "multi-select", "equals", "bug")).toBe(false);
      expect(evaluateRuleOnCell("Bug", "multi-select", "equals", [])).toBe(true);
      expect(evaluateRuleOnCell(cellTags, "multi-select", "not_equals", "bug")).toBe(true);
      expect(evaluateRuleOnCell("Bug", "multi-select", "not_equals", "bug")).toBe(false);
      expect(evaluateRuleOnCell("Bug", "multi-select", "not_equals", [])).toBe(true);
    });
  });

  describe("Text Operators on Cells", () => {
    const textCell = "Fix Critical Bug in Auth";

    it("operator: equals and not_equals", () => {
      expect(evaluateRuleOnCell("Done", "text", "equals", "done")).toBe(true);
      expect(evaluateRuleOnCell("Done", "text", "equals", "in progress")).toBe(false);
      expect(evaluateRuleOnCell("Done", "text", "not_equals", "in progress")).toBe(true);
    });

    it("operator: is_one_of and is_not_one_of for text", () => {
      expect(evaluateRuleOnCell("Frontend", "text", "is_one_of", ["frontend", "backend"])).toBe(true);
      expect(evaluateRuleOnCell("DevOps", "text", "is_one_of", ["frontend", "backend"])).toBe(false);
      expect(evaluateRuleOnCell("DevOps", "text", "is_not_one_of", ["frontend", "backend"])).toBe(true);
      expect(evaluateRuleOnCell("Frontend", "text", "is_not_one_of", ["frontend", "backend"])).toBe(false);
    });

    it("operator: starts_with and ends_with", () => {
      expect(evaluateRuleOnCell(textCell, "text", "starts_with", "fix")).toBe(true);
      expect(evaluateRuleOnCell(textCell, "text", "ends_with", "auth")).toBe(true);
      expect(evaluateRuleOnCell(textCell, "text", "starts_with", "auth")).toBe(false);
    });
  });

  describe("Table Filter State (AND / OR Conjunctions)", () => {
    it("should filter with single rule: Tags contains 'Frontend'", () => {
      const state: TableFilterState = {
        tableId: "test",
        conjunction: "AND",
        searchQuery: "",
        isFilterOpen: true,
        isSortOpen: false,
        sortRules: [],
        rules: [
          {
            id: "1",
            column: "Tags",
            columnIndex: 2,
            operator: "contains",
            value: "Frontend",
            enabled: true,
          },
        ],
      };

      const result = filterTableRows(sampleRows, state, columns);
      expect(result.matchedRows.length).toBe(2);
      expect(result.matchedRows[0].cells[0]).toBe("Fix Bug");
      expect(result.matchedRows[1].cells[0]).toBe("Refactor UI");
    });

    it("should filter with AND conjunction: Tags contains 'Frontend' AND Status equals 'In Progress'", () => {
      const state: TableFilterState = {
        tableId: "test",
        conjunction: "AND",
        searchQuery: "",
        isFilterOpen: true,
        isSortOpen: false,
        sortRules: [],
        rules: [
          {
            id: "1",
            column: "Tags",
            columnIndex: 2,
            operator: "contains",
            value: "Frontend",
            enabled: true,
          },
          {
            id: "2",
            column: "Status",
            columnIndex: 1,
            operator: "contains",
            value: "In Progress",
            enabled: true,
          },
        ],
      };

      const result = filterTableRows(sampleRows, state, columns);
      expect(result.matchedRows.length).toBe(1);
      expect(result.matchedRows[0].cells[0]).toBe("Fix Bug");
    });

    it("should filter with OR conjunction: Status contains 'Done' OR Tags contains 'Documentation'", () => {
      const state: TableFilterState = {
        tableId: "test",
        conjunction: "OR",
        searchQuery: "",
        isFilterOpen: true,
        isSortOpen: false,
        sortRules: [],
        rules: [
          {
            id: "1",
            column: "Status",
            columnIndex: 1,
            operator: "contains",
            value: "Done",
            enabled: true,
          },
          {
            id: "2",
            column: "Tags",
            columnIndex: 2,
            operator: "contains",
            value: "Documentation",
            enabled: true,
          },
        ],
      };

      const result = filterTableRows(sampleRows, state, columns);
      expect(result.matchedRows.length).toBe(2);
      expect(result.matchedRows.map((r) => r.cells[0])).toEqual(["Add Auth", "Update Docs"]);
    });

    it("should filter for empty tags (is_empty)", () => {
      const state: TableFilterState = {
        tableId: "test",
        conjunction: "AND",
        searchQuery: "",
        isFilterOpen: true,
        isSortOpen: false,
        sortRules: [],
        rules: [
          {
            id: "1",
            column: "Tags",
            columnIndex: 2,
            operator: "is_empty",
            value: "",
            enabled: true,
          },
        ],
      };

      const result = filterTableRows(sampleRows, state, columns);
      expect(result.matchedRows.length).toBe(1);
      expect(result.matchedRows[0].cells[0]).toBe("Empty Task");
    });

    it("should filter by global search query", () => {
      const state: TableFilterState = {
        tableId: "test",
        conjunction: "AND",
        searchQuery: "security",
        isFilterOpen: false,
        isSortOpen: false,
        sortRules: [],
        rules: [],
      };

      const result = filterTableRows(sampleRows, state, columns);
      expect(result.matchedRows.length).toBe(1);
      expect(result.matchedRows[0].cells[0]).toBe("Add Auth");
    });

    it("should filter cyrillic column with multiple criteria", () => {
      const state: TableFilterState = {
        tableId: "test",
        conjunction: "AND",
        searchQuery: "",
        isFilterOpen: true,
        isSortOpen: false,
        sortRules: [],
        rules: [
          {
            id: "1",
            column: "Теги",
            columnIndex: 3,
            operator: "contains",
            value: "Фронтенд",
            enabled: true,
          },
        ],
      };

      const result = filterTableRows(sampleRows, state, columns);
      expect(result.matchedRows.length).toBe(1);
      expect(result.matchedRows[0].cells[0]).toBe("Refactor UI");
    });

    it("should handle starts_with and ends_with operators", () => {
      expect(evaluateRuleOnCell("Frontend Development", "text", "starts_with", "front")).toBe(true);
      expect(evaluateRuleOnCell("Frontend Development", "text", "starts_with", "back")).toBe(false);
      expect(evaluateRuleOnCell("Frontend Development", "text", "ends_with", "ment")).toBe(true);
      expect(evaluateRuleOnCell("Frontend Development", "text", "ends_with", "front")).toBe(false);
    });

    it("should handle not_equals on multi-select column", () => {
      expect(evaluateRuleOnCell("#v1", "multi-select", "not_equals", "")).toBe(true);
      expect(evaluateRuleOnCell("#v1", "multi-select", "not_equals", "v1")).toBe(false);
      expect(evaluateRuleOnCell("#v1, #v2", "multi-select", "not_equals", "v1")).toBe(true);
      expect(evaluateRuleOnCell("#v2", "multi-select", "not_equals", "v1")).toBe(true);
    });

    it("should handle out of bounds column index or disabled rules", () => {
      const state: TableFilterState = {
        tableId: "test",
        conjunction: "AND",
        searchQuery: "",
        isFilterOpen: true,
        isSortOpen: false,
        sortRules: [],
        rules: [
          {
            id: "1",
            column: "Nonexistent",
            columnIndex: 99,
            operator: "equals",
            value: "something",
            enabled: true,
          },
          {
            id: "2",
            column: "Task",
            columnIndex: 0,
            operator: "equals",
            value: "Will not match",
            enabled: false,
          },
        ],
      };
      const result = filterTableRows(sampleRows, state, columns);
      expect(result.matchedRows.length).toBe(sampleRows.length);
    });

    it("should return true for unrecognized operator", () => {
      // @ts-expect-error test invalid operator
      expect(evaluateRuleOnCell("value", "text", "unsupported_operator", "val")).toBe(true);
    });

    it("parseFilterValues should handle arrays, comma strings, empty strings and non-strings", () => {
      expect(parseFilterValues([" One ", "", "Two"])).toEqual(["one", "two"]);
      expect(parseFilterValues(" Alpha, Beta , , Gamma ")).toEqual(["alpha", "beta", "gamma"]);
      expect(parseFilterValues("Single")).toEqual(["single"]);
      expect(parseFilterValues("")).toEqual([]);
      // @ts-expect-error testing invalid type
      expect(parseFilterValues(123)).toEqual([]);
    });

    it("should handle contains_all operator on text and multi-select", () => {
      expect(evaluateRuleOnCell("Frontend, UI, Bug", "multi-select", "contains_all", "frontend, bug")).toBe(true);
      expect(evaluateRuleOnCell("Frontend, UI, Bug", "multi-select", "contains_all", "frontend, backend")).toBe(false);
      expect(evaluateRuleOnCell("The quick brown fox", "text", "contains_all", "quick, fox")).toBe(true);
      expect(evaluateRuleOnCell("The quick brown fox", "text", "contains_all", "quick, dog")).toBe(false);
      expect(evaluateRuleOnCell("The quick brown fox", "text", "contains_all", "")).toBe(true);
    });

    it("should handle contains_any and does_not_contain_any on text and multi-select", () => {
      expect(evaluateRuleOnCell("Frontend, UI", "multi-select", "contains_any", "ui, backend")).toBe(true);
      expect(evaluateRuleOnCell("Frontend, UI", "multi-select", "contains_any", "security, backend")).toBe(false);
      expect(evaluateRuleOnCell("Frontend, UI", "multi-select", "does_not_contain_any", "security, backend")).toBe(true);
      expect(evaluateRuleOnCell("Frontend, UI", "multi-select", "does_not_contain_any", "ui, backend")).toBe(false);

      expect(evaluateRuleOnCell("Hello World", "text", "contains_any", "world, universe")).toBe(true);
      expect(evaluateRuleOnCell("Hello World", "text", "contains_any", "solar, galaxy")).toBe(false);
      expect(evaluateRuleOnCell("Hello World", "text", "does_not_contain_any", "solar, galaxy")).toBe(true);
      expect(evaluateRuleOnCell("Hello World", "text", "does_not_contain_any", "world, galaxy")).toBe(false);
    });

    it("should handle is_not_one_of on text and select columns", () => {
      expect(evaluateRuleOnCell("Done", "select", "is_not_one_of", "In Progress, Backlog")).toBe(true);
      expect(evaluateRuleOnCell("Done", "select", "is_not_one_of", "Done, In Progress")).toBe(false);
      expect(evaluateRuleOnCell("Done", "select", "is_not_one_of", "")).toBe(true);

      expect(evaluateRuleOnCell("Alpha", "text", "is_not_one_of", "Beta, Gamma")).toBe(true);
      expect(evaluateRuleOnCell("Alpha", "text", "is_not_one_of", "Alpha, Beta")).toBe(false);
      expect(evaluateRuleOnCell("Alpha", "text", "is_not_one_of", "")).toBe(true);
    });

    it("should return column-appropriate filter operators", () => {
      const selectOps = getFilterOperatorsForColumnType("select").map((o) => o.value);
      expect(selectOps).toContain("is_one_of");
      expect(selectOps).toContain("contains");
      expect(selectOps).toContain("contains_all");

      const chkOps = getFilterOperatorsForColumnType("checkbox").map((o) => o.value);
      expect(chkOps).toEqual(["equals", "not_equals"]);

      const textOps = getFilterOperatorsForColumnType("text").map((o) => o.value);
      expect(textOps).toContain("contains");
      expect(textOps).toContain("equals");
      expect(textOps).not.toContain("contains_all");
    });
  });
});
