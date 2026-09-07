import { describe, it, expect } from "vitest";
import { TableStateManager } from "../src/core/table-state";
import { DEFAULT_SETTINGS, MarkdownTableData, TableFilterState } from "../src/types";

describe("Table State Manager", () => {
  const tableData: MarkdownTableData = {
    id: "table_1",
    headers: ["Title", "Tags", "Status", "Done", "Hours", "Due Date"],
    alignments: ["---", "---", "---", "---", "---", "---"],
    rows: [
      {
        rowIndex: 0,
        rawLine: "",
        cells: ["Item 1", "Frontend, Bug", "Open", "[x]", "12.5", "2026-09-01"],
      },
      {
        rowIndex: 1,
        rawLine: "",
        cells: ["Item 2", "Backend", "Closed", "[ ]", "5", "2026-09-10"],
      },
    ],
    startLine: 0,
    endLine: 3,
    rawMarkdown: "",
  };

  it("should infer column types automatically based on content and headers", () => {
    const manager = new TableStateManager();
    const columns = manager.analyzeColumns(tableData, DEFAULT_SETTINGS);

    expect(columns.length).toBe(6);
    expect(columns[0].type).toBe("text");
    expect(columns[1].type).toBe("multi-select");
    expect(columns[2].type).toBe("select");
    expect(columns[3].type).toBe("checkbox");
    expect(columns[4].type).toBe("number");
    expect(columns[5].type).toBe("date");
    expect(columns[5].dateFormat).toBe("YYYY-MM-DD");
  });

  it("should support explicit header type syntax [type] and [date:format]", () => {
    const explicitTable: MarkdownTableData = {
      id: "table_2",
      headers: ["Name [text]", "Skills [multi-select]", "Active [checkbox]", "Cost [number]", "Due [date:DD.MM.YYYY]"],
      alignments: ["---", "---", "---", "---", "---"],
      rows: [{ rowIndex: 0, rawLine: "", cells: ["Alex", "Go, TS", "true", "$500", "01.09.2026"] }],
      startLine: 0,
      endLine: 2,
      rawMarkdown: "",
    };

    const manager = new TableStateManager();
    const columns = manager.analyzeColumns(explicitTable, DEFAULT_SETTINGS);

    expect(columns[0].name).toBe("Name");
    expect(columns[0].type).toBe("text");

    expect(columns[1].name).toBe("Skills");
    expect(columns[1].type).toBe("multi-select");

    expect(columns[2].name).toBe("Active");
    expect(columns[2].type).toBe("checkbox");

    expect(columns[3].name).toBe("Cost");
    expect(columns[3].type).toBe("number");

    expect(columns[4].name).toBe("Due");
    expect(columns[4].type).toBe("date");
    expect(columns[4].dateFormat).toBe("DD.MM.YYYY");
  });

  it("should manage filter state per tableId", () => {
    const manager = new TableStateManager();
    const state = manager.getOrCreateFilterState("tbl_123");
    expect(state.conjunction).toBe("AND");
    expect(state.rules).toEqual([]);
    expect(state.sortRules).toEqual([]);

    state.rules.push({
      id: "r1",
      column: "Tags",
      columnIndex: 1,
      operator: "contains",
      value: "Frontend",
      enabled: true,
    });

    manager.setFilterState("tbl_123", state);
    const retrieved = manager.getOrCreateFilterState("tbl_123");
    expect(retrieved.rules.length).toBe(1);

    manager.clearFilterState("tbl_123");
    expect(manager.getOrCreateFilterState("tbl_123").rules.length).toBe(0);
  });

  it("should serialize and deserialize filter comment", () => {
    const manager = new TableStateManager();
    const state: TableFilterState = {
      tableId: "tbl_1",
      conjunction: "OR",
      rules: [
        {
          id: "r1",
          column: "Status",
          columnIndex: 2,
          operator: "contains",
          value: "Open",
          enabled: true,
        },
      ],
      sortRules: [],
      searchQuery: "",
      isFilterOpen: true,
      isSortOpen: false,
    };

    const comment = manager.serializeToComment(state);
    expect(comment).toContain("<!-- ms-filter:");
    expect(comment).toContain('"conjunction":"OR"');

    const deserialized = manager.deserializeFromComment(comment, "tbl_1");
    expect(deserialized).not.toBeNull();
    expect(deserialized?.conjunction).toBe("OR");
    expect(deserialized?.rules.length).toBe(1);
    expect(deserialized?.rules[0].value).toBe("Open");
  });

  it("should infer various date formats from cell patterns", () => {
    const manager = new TableStateManager();
    const formats: [string, string][] = [
      ["15.05.2026", "DD.MM.YYYY"],
      ["2026/05/15", "YYYY/MM/DD"],
      ["15/05/2026", "DD/MM/YYYY"],
      ["15-05-2026", "DD-MM-YYYY"],
      ["2026-05-15", "YYYY-MM-DD"],
    ];

    for (const [cellVal, expectedFmt] of formats) {
      const table: MarkdownTableData = {
        id: "tbl_date",
        headers: ["Due Date"],
        alignments: ["---"],
        rows: [{ rowIndex: 0, rawLine: "", cells: [cellVal] }],
        startLine: 0,
        endLine: 1,
        rawMarkdown: "",
      };
      const columns = manager.analyzeColumns(table, DEFAULT_SETTINGS);
      expect(columns[0].type).toBe("date");
      expect(columns[0].dateFormat).toBe(expectedFmt);
    }
  });

  it("should safely handle malformed or non-matching comments", () => {
    const manager = new TableStateManager();
    expect(manager.deserializeFromComment("not a comment", "tbl")).toBeNull();
    expect(manager.deserializeFromComment("<!-- ms-filter: { invalid json } -->", "tbl")).toBeNull();
  });

  it("should infer keywords for select and multi-select", () => {
    const manager = new TableStateManager();
    const table: MarkdownTableData = {
      id: "tbl_keywords",
      headers: ["Status", "Tags", "Priority"],
      alignments: ["---", "---", "---"],
      rows: [{ rowIndex: 0, rawLine: "", cells: ["In Progress", "UI, Bug", "High"] }],
      startLine: 0,
      endLine: 1,
      rawMarkdown: "",
    };
    const columns = manager.analyzeColumns(table, {
      ...DEFAULT_SETTINGS,
      multiSelectColumnNames: ["tags"],
    });
    expect(columns[0].type).toBe("select");
    expect(columns[1].type).toBe("multi-select");
    expect(columns[2].type).toBe("select");
  });

  it("should infer column alignments from table alignments row", () => {
    const manager = new TableStateManager();
    const table: MarkdownTableData = {
      id: "tbl_align",
      headers: ["LeftCol", "CenterCol", "RightCol", "DefaultCol"],
      alignments: [":---", ":---:", "---:", "---"],
      rows: [{ rowIndex: 0, rawLine: "", cells: ["a", "b", "c", "d"] }],
      startLine: 0,
      endLine: 1,
      rawMarkdown: "",
    };
    const columns = manager.analyzeColumns(table, DEFAULT_SETTINGS);
    expect(columns[0].align).toBe("left");
    expect(columns[1].align).toBe("center");
    expect(columns[2].align).toBe("right");
    expect(columns[3].align).toBe("left");
  });

  it("should default numbers to right alignment and checkboxes to center", () => {
    const manager = new TableStateManager();
    const table: MarkdownTableData = {
      id: "tbl_defaults",
      headers: ["Amount", "Done", "Task"],
      alignments: ["---", "---", "---"],
      rows: [
        { rowIndex: 0, rawLine: "", cells: ["100", "[x]", "Work"] },
        { rowIndex: 1, rawLine: "", cells: ["250", "[ ]", "Review"] },
      ],
      startLine: 0,
      endLine: 2,
      rawMarkdown: "",
    };
    const columns = manager.analyzeColumns(table, DEFAULT_SETTINGS);
    expect(columns[0].type).toBe("number");
    expect(columns[0].align).toBe("right");
    expect(columns[1].type).toBe("checkbox");
    expect(columns[1].align).toBe("center");
    expect(columns[2].type).toBe("text");
    expect(columns[2].align).toBe("left");
  });
});
