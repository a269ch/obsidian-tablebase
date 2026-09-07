import { describe, it, expect } from "vitest";
import {
  applyAddColumn,
  applyAddRow,
  applyCellUpdate,
  applyChangeColumnAlignment,
  applyChangeColumnDateFormat,
  applyChangeColumnType,
  applyDeleteColumn,
  applyDeleteRow,
  applyDuplicateRow,
  applyRenameColumn,
  applyReorderColumns,
  applyReorderRows,
  stripTypeAnnotation,
} from "../src/core/table-mutator";
import { MarkdownTableData, TableColumn } from "../src/types";

describe("Table Mutator Engine", () => {
  function createSampleTable(): { tableData: MarkdownTableData; columns: TableColumn[] } {
    const tableData: MarkdownTableData = {
      id: "tbl_1",
      headers: ["Task", "Status", "Hours"],
      alignments: ["---", "---", "---"],
      rows: [
        { rowIndex: 0, rawLine: "", cells: ["Task 1", "Done", "10"] },
        { rowIndex: 1, rawLine: "", cells: ["Task 2", "In Progress", "20"] },
      ],
      startLine: 0,
      endLine: 3,
      rawMarkdown: "",
    };

    const columns: TableColumn[] = [
      { name: "Task", index: 0, type: "text" },
      { name: "Status", index: 1, type: "select" },
      { name: "Hours", index: 2, type: "number" },
    ];

    return { tableData, columns };
  }

  it("should update a cell value", () => {
    const { tableData } = createSampleTable();
    applyCellUpdate(tableData, 0, 1, "Blocked");
    expect(tableData.rows[0].cells[1]).toBe("Blocked");
  });

  it("should add a new row at the end or at a specific index", () => {
    const { tableData } = createSampleTable();
    const newRow = applyAddRow(tableData, 3, undefined, ["Task 3", "Todo", "5"]);
    expect(tableData.rows.length).toBe(3);
    expect(newRow.rowIndex).toBe(2);
    expect(newRow.cells).toEqual(["Task 3", "Todo", "5"]);

    applyAddRow(tableData, 3, 1, ["Inserted", "Todo", "0"]);
    expect(tableData.rows.length).toBe(4);
    expect(tableData.rows[1].cells[0]).toBe("Inserted");
    expect(tableData.rows.map((r) => r.rowIndex)).toEqual([0, 1, 2, 3]);
  });

  it("should duplicate an existing row", () => {
    const { tableData } = createSampleTable();
    const dup = applyDuplicateRow(tableData, 0);
    expect(dup).not.toBeNull();
    expect(tableData.rows.length).toBe(3);
    expect(tableData.rows[1].cells).toEqual(["Task 1", "Done", "10"]);
    expect(tableData.rows.map((r) => r.rowIndex)).toEqual([0, 1, 2]);
  });

  it("should delete a row and reindex remaining rows", () => {
    const { tableData } = createSampleTable();
    applyDeleteRow(tableData, 0);
    expect(tableData.rows.length).toBe(1);
    expect(tableData.rows[0].cells[0]).toBe("Task 2");
    expect(tableData.rows[0].rowIndex).toBe(0);
  });

  it("should add and rename columns preserving types", () => {
    const { tableData, columns } = createSampleTable();
    applyAddColumn(tableData, columns, "Priority", "select", 1);
    expect(tableData.headers).toEqual(["Task", "Priority", "Status", "Hours"]);
    expect(columns.map((c) => c.name)).toEqual(["Task", "Priority", "Status", "Hours"]);
    expect(columns[1].type).toBe("select");
    expect(tableData.rows[0].cells.length).toBe(4);

    applyRenameColumn(tableData, columns, 1, "Severity");
    expect(tableData.headers[1]).toBe("Severity [select]");
    expect(columns[1].name).toBe("Severity");
    expect(columns[1].type).toBe("select");

    applyAddColumn(tableData, columns, "Due Date", "date");
    expect(tableData.headers[4]).toBe("Due Date [date:YYYY-MM-DD]");
    expect(columns[4].name).toBe("Due Date");
    expect(columns[4].type).toBe("date");
    expect(columns[4].dateFormat).toBe("YYYY-MM-DD");

    applyAddColumn(tableData, columns, "Created", "date", undefined, "DD.MM.YYYY");
    expect(tableData.headers[5]).toBe("Created [date:DD.MM.YYYY]");
    expect(columns[5].name).toBe("Created");
    expect(columns[5].type).toBe("date");
    expect(columns[5].dateFormat).toBe("DD.MM.YYYY");

    applyAddColumn(tableData, columns, "Done", "checkbox");
    expect(tableData.headers[6]).toBe("Done [checkbox]");
    expect(columns[6].name).toBe("Done");
    expect(columns[6].type).toBe("checkbox");

    applyAddColumn(tableData, columns, "Amount", "number");
    expect(tableData.headers[7]).toBe("Amount [number]");
    expect(columns[7].name).toBe("Amount");
    expect(columns[7].type).toBe("number");
  });

  it("should change column type and format header", () => {
    const { tableData, columns } = createSampleTable();

    expect(columns[0].type).toBe("text");
    expect(tableData.headers[0]).toBe("Task");

    applyChangeColumnType(tableData, columns, 0, "select");
    expect(columns[0].type).toBe("select");
    expect(tableData.headers[0]).toBe("Task [select]");

    applyChangeColumnType(tableData, columns, 0, "number");
    expect(columns[0].type).toBe("number");
    expect(tableData.headers[0]).toBe("Task [number]");

    applyChangeColumnType(tableData, columns, 0, "date", "DD.MM.YYYY");
    expect(columns[0].type).toBe("date");
    expect(columns[0].dateFormat).toBe("DD.MM.YYYY");
    expect(tableData.headers[0]).toBe("Task [date:DD.MM.YYYY]");
  });

  it("should change column date format and convert existing date cells", () => {
    const { tableData, columns } = createSampleTable();
    applyAddColumn(tableData, columns, "Deadline", "date", undefined, "YYYY-MM-DD");
    tableData.rows[0].cells[3] = "2026-09-04";
    tableData.rows[1].cells[3] = "2026-12-31";

    applyChangeColumnDateFormat(tableData, columns, 3, "DD.MM.YYYY");
    expect(columns[3].dateFormat).toBe("DD.MM.YYYY");
    expect(tableData.headers[3]).toBe("Deadline [date:DD.MM.YYYY]");
    expect(tableData.rows[0].cells[3]).toBe("04.09.2026");
    expect(tableData.rows[1].cells[3]).toBe("31.12.2026");
  });

  it("should delete a column", () => {
    const { tableData, columns } = createSampleTable();
    applyDeleteColumn(tableData, columns, 1);
    expect(tableData.headers).toEqual(["Task", "Hours"]);
    expect(columns.map((c) => c.name)).toEqual(["Task", "Hours"]);
    expect(tableData.rows[0].cells).toEqual(["Task 1", "10"]);
  });

  it("should reorder rows and columns", () => {
    const { tableData, columns } = createSampleTable();
    applyReorderRows(tableData, 0, 1);
    expect(tableData.rows[0].cells[0]).toBe("Task 2");
    expect(tableData.rows[1].cells[0]).toBe("Task 1");

    applyReorderColumns(tableData, columns, 0, 2);
    expect(tableData.headers).toEqual(["Status", "Hours", "Task"]);
    expect(tableData.rows[0].cells).toEqual(["In Progress", "20", "Task 2"]);
  });

  it("stripTypeAnnotation should strip bracketed annotations", () => {
    expect(stripTypeAnnotation("Priority [select]")).toBe("Priority");
    expect(stripTypeAnnotation("Due Date [date:DD.MM.YYYY]")).toBe("Due Date");
    expect(stripTypeAnnotation("Tags [multi-select]")).toBe("Tags");
    expect(stripTypeAnnotation("Plain Text")).toBe("Plain Text");
  });

  it("should safely handle boundary conditions in delete, duplicate, and reorder", () => {
    const { tableData, columns } = createSampleTable();
    expect(applyDeleteRow(tableData, -1)).toBeNull();
    expect(applyDeleteRow(tableData, 99)).toBeNull();
    expect(applyDuplicateRow(tableData, 99)).toBeNull();

    applyReorderRows(tableData, 0, 0);
    applyReorderRows(tableData, -1, 1);
    applyReorderRows(tableData, 0, 99);
    expect(tableData.rows[0].cells[0]).toBe("Task 1");

    applyReorderColumns(tableData, columns, 0, 0);
    applyReorderColumns(tableData, columns, -1, 1);
    applyReorderColumns(tableData, columns, 0, 99);
    expect(tableData.headers[0]).toBe("Task");
  });

  it("should change column alignment and keep alignments array in sync", () => {
    const { tableData, columns } = createSampleTable();

    applyChangeColumnAlignment(tableData, columns, 1, "center");
    expect(columns[1].align).toBe("center");
    expect(tableData.alignments[1]).toBe(":---:");

    applyChangeColumnAlignment(tableData, columns, 0, "right");
    expect(columns[0].align).toBe("right");
    expect(tableData.alignments[0]).toBe("---:");

    applyChangeColumnAlignment(tableData, columns, 1, "left");
    expect(columns[1].align).toBe("left");
    expect(tableData.alignments[1]).toBe(":---");

    applyAddColumn(tableData, columns, "NewCol", "text", 1);
    expect(tableData.alignments).toEqual(["---:", "---", ":---", "---"]);

    applyReorderColumns(tableData, columns, 0, 2);
    expect(tableData.alignments).toEqual(["---", ":---", "---:", "---"]);

    applyDeleteColumn(tableData, columns, 1);
    expect(tableData.alignments).toEqual(["---", "---:", "---"]);
  });
});
