import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import { App } from "obsidian";
import { parseMarkdownTables } from "../src/core/markdown-parser";
import { TableStateManager } from "../src/core/table-state";
import { CellRenderer } from "../src/ui/table/cells";
import { TableMenus } from "../src/ui/table/menus";
import { SelectionModel } from "../src/ui/table/selection";
import { TableViewActions, TableViewContext } from "../src/ui/table/types";
import { DisposableRegistry } from "../src/utils/lifecycle";
import { DEFAULT_SETTINGS, MarkdownTableData, PluginSettings, TableColumn } from "../src/types";
import { installObsidianDomHelpers } from "./helpers/obsidian-dom";

function stubLayout(el: Element): void {
  const rect = {
    top: 100, bottom: 130, left: 50, right: 200,
    width: 150, height: 30, x: 50, y: 100,
  };
  el.getBoundingClientRect = (): DOMRect =>
    ({ ...rect, toJSON: () => rect }) as DOMRect;
}

function createActions(): TableViewActions {
  const noop = async (): Promise<void> => undefined;
  return {
    onCellUpdate: vi.fn(noop),
    onAddRow: vi.fn(noop),
    onDuplicateRow: vi.fn(noop),
    onDeleteRow: vi.fn(noop),
    onReorderRows: vi.fn(noop),
    onAddColumn: vi.fn(noop),
    onRenameColumn: vi.fn(noop),
    onDeleteColumn: vi.fn(noop),
    onColumnTypeChange: vi.fn(noop),
    onColumnDateFormatChange: vi.fn(noop),
    onColumnAlignmentChange: vi.fn(noop),
    onReorderColumns: vi.fn(noop),
    onFilterChange: vi.fn(),
    onSortChange: vi.fn(),
    onTagColorChange: vi.fn(noop),
  };
}

function createContext(tableData: MarkdownTableData, columns: TableColumn[]) {
  const containerEl = document.createElement("div");
  document.body.appendChild(containerEl);

  const actions = createActions();
  const ctx: TableViewContext = {
    app: {} as App,
    sourcePath: "notes/test.md",
    actions,
    selection: new SelectionModel(),
    registry: new DisposableRegistry(),
    containerEl,
    tableData,
    columns,
    filterState: {
      tableId: tableData.id,
      conjunction: "AND",
      rules: [],
      sortRules: [],
      searchQuery: "",
      isFilterOpen: false,
      isSortOpen: false,
    },
    settings: { ...DEFAULT_SETTINGS },
    isRowNumbersVisible: () => false,
    getVisibleColumns: () => columns,
    render: vi.fn(),
    renderRows: vi.fn(),
    switchView: vi.fn(),
    clearFocus: vi.fn(),
    applySelection: vi.fn(),
  };

  return { ctx, actions, containerEl };
}

function analyze(
  markdown: string,
  customSettings?: Partial<PluginSettings>
): {
  tableData: MarkdownTableData;
  columns: TableColumn[];
} {
  const tableData = parseMarkdownTables(markdown)[0];
  const columns = new TableStateManager().analyzeColumns(tableData, {
    ...DEFAULT_SETTINGS,
    ...customSettings,
  });
  return { tableData, columns };
}

function clickCell(
  ctx: TableViewContext,
  containerEl: HTMLElement,
  tableData: MarkdownTableData,
  column: TableColumn
): void {
  const renderer = new CellRenderer(ctx);
  const td = containerEl.createEl("td", { cls: "ms-db-td" });
  stubLayout(td);
  renderer.render(td, tableData.rows[0], column, column.index);
  td.dispatchEvent(new MouseEvent("click", { bubbles: true }));
}

describe("Date column end-to-end", () => {
  beforeAll(() => {
    installObsidianDomHelpers(window as Window & typeof globalThis);
  });

  beforeEach(() => {
    document.body.innerHTML = "";
    window.innerHeight = 800;
    window.innerWidth = 1200;
  });

  it("should detect an explicit [date] annotation", () => {
    const { columns } = analyze(
      [
        "| Task | Due Date [date] |",
        "| --- | --- |",
        "| Buy bread | 2026-09-15 |",
      ].join("\n")
    );

    expect(columns[1].type).toBe("date");
    expect(columns[1].name).toBe("Due Date");
    expect(columns[1].dateFormat).toBe("YYYY-MM-DD");
  });

  it("should detect an explicit [date:FORMAT] annotation", () => {
    const { columns } = analyze(
      [
        "| Task | Due Date [date:DD.MM.YYYY] |",
        "| --- | --- |",
        "| Buy bread | 15.09.2026 |",
      ].join("\n")
    );

    expect(columns[1].type).toBe("date");
    expect(columns[1].dateFormat).toBe("DD.MM.YYYY");
  });

  it("should auto-detect a date column without annotation", () => {
    const { columns } = analyze(
      [
        "| Task | Deadline |",
        "| --- | --- |",
        "| Buy bread | 15.09.2026 |",
        "| Call | 20.09.2026 |",
      ].join("\n")
    );

    expect(columns[1].type).toBe("date");
    expect(columns[1].dateFormat).toBe("DD.MM.YYYY");
  });

  it("should open the calendar for an explicitly annotated date column", () => {
    const { tableData, columns } = analyze(
      [
        "| Task | Due Date [date] |",
        "| --- | --- |",
        "| Buy bread | 2026-09-15 |",
      ].join("\n")
    );

    const { ctx, containerEl } = createContext(tableData, columns);
    clickCell(ctx, containerEl, tableData, columns[1]);

    const calendar = document.querySelector(".ms-date-picker-popover");
    expect(calendar).not.toBeNull();
    expect(calendar?.querySelectorAll(".ms-date-day-header").length).toBe(7);
  });

  it("should open the calendar for an auto-detected date column", () => {
    const { tableData, columns } = analyze(
      [
        "| Task | Deadline |",
        "| --- | --- |",
        "| Buy bread | 15.09.2026 |",
        "| Call | 20.09.2026 |",
      ].join("\n")
    );

    const { ctx, containerEl } = createContext(tableData, columns);
    clickCell(ctx, containerEl, tableData, columns[1]);

    expect(document.querySelector(".ms-date-picker-popover")).not.toBeNull();
  });

  it("should keep the date type after a header round-trip through the parser", () => {
    const { tableData, columns } = analyze(
      [
        "| Task | Due Date [date:DD.MM.YYYY] |",
        "| --- | --- |",
        "| Buy bread | 15.09.2026 |",
      ].join("\n")
    );

    expect(tableData.headers[1]).toBe("Due Date [date:DD.MM.YYYY]");
    expect(columns[1].type).toBe("date");

    const { ctx, containerEl } = createContext(tableData, columns);
    clickCell(ctx, containerEl, tableData, columns[1]);

    expect(document.querySelector(".ms-date-picker-popover")).not.toBeNull();
  });

  it("should detect date keyword column with empty cells and apply default format", () => {
    const { tableData, columns } = analyze(
      [
        "| Task | Date |",
        "| --- | --- |",
        "| Buy bread | |",
      ].join("\n")
    );

    expect(columns[1].type).toBe("date");
    expect(columns[1].name).toBe("Date");
    expect(columns[1].dateFormat).toBe("YYYY-MM-DD");

    const { ctx, containerEl } = createContext(tableData, columns);
    clickCell(ctx, containerEl, tableData, columns[1]);

    expect(document.querySelector(".ms-date-picker-popover")).not.toBeNull();
  });

  it("should respect configured settings dateFormat when auto-detecting date keyword column with empty cells", () => {
    const { columns } = analyze(
      [
        "| Task | Due Date |",
        "| --- | --- |",
        "| Call Alice | |",
      ].join("\n"),
      { dateFormat: "DD.MM.YYYY" }
    );

    expect(columns[1].type).toBe("date");
    expect(columns[1].name).toBe("Due Date");
    expect(columns[1].dateFormat).toBe("DD.MM.YYYY");
  });

  it("should not include a date format section in the column header menu", () => {
    const { tableData, columns } = analyze(
      [
        "| Task | Due Date [date] |",
        "| --- | --- |",
        "| Buy bread | 2026-09-15 |",
      ].join("\n")
    );

    const { ctx, containerEl } = createContext(tableData, columns);
    const menus = new TableMenus(ctx, vi.fn());
    const anchor = containerEl.createEl("th");
    stubLayout(anchor);
    menus.openColumnHeaderMenu(anchor, columns[1], 1);

    const menu = document.querySelector(".ms-col-header-menu");
    expect(menu).not.toBeNull();
    const sectionTitles = Array.from(menu?.querySelectorAll(".ms-menu-section-title") || []).map(
      (el) => el.textContent
    );
    expect(sectionTitles).not.toContain("Date format");
  });
});
