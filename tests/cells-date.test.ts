import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import { App } from "obsidian";
import { CellRenderer } from "../src/ui/table/cells";
import { SelectionModel } from "../src/ui/table/selection";
import { TableViewActions, TableViewContext } from "../src/ui/table/types";
import { DisposableRegistry } from "../src/utils/lifecycle";
import {
  DEFAULT_SETTINGS,
  MarkdownTableData,
  MarkdownTableRow,
  TableColumn,
  TableFilterState,
} from "../src/types";
import { installObsidianDomHelpers } from "./helpers/obsidian-dom";

function stubLayout(el: Element): void {
  const rect = {
    top: 100,
    bottom: 130,
    left: 50,
    right: 200,
    width: 150,
    height: 30,
    x: 50,
    y: 100,
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

function createContext(columns: TableColumn[], rows: MarkdownTableRow[]) {
  const containerEl = document.createElement("div");
  document.body.appendChild(containerEl);

  const tableData: MarkdownTableData = {
    id: "tbl_test",
    headers: columns.map((col) => col.name),
    alignments: columns.map(() => "---"),
    rows,
    startLine: 0,
    endLine: rows.length + 1,
    rawMarkdown: "",
  };

  const filterState: TableFilterState = {
    tableId: tableData.id,
    conjunction: "AND",
    rules: [],
    sortRules: [],
    searchQuery: "",
    isFilterOpen: false,
    isSortOpen: false,
  };

  const actions = createActions();

  const ctx: TableViewContext = {
    app: {} as App,
    actions,
    selection: new SelectionModel(),
    registry: new DisposableRegistry(),
    containerEl,
    tableData,
    columns,
    filterState,
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

const DATE_COLUMN: TableColumn = {
  name: "Deadline",
  index: 0,
  type: "date",
  dateFormat: "DD.MM.YYYY",
};

describe("CellRenderer date cells", () => {
  beforeAll(() => {
    installObsidianDomHelpers(window as Window & typeof globalThis);
  });

  beforeEach(() => {
    document.body.innerHTML = "";
    window.innerHeight = 800;
    window.innerWidth = 1200;
  });

  it("should open the calendar when a filled date cell is clicked", () => {
    const row: MarkdownTableRow = { rowIndex: 0, rawLine: "", cells: ["15.09.2026"] };
    const { ctx, containerEl } = createContext([DATE_COLUMN], [row]);
    const renderer = new CellRenderer(ctx);

    const td = containerEl.createEl("td", { cls: "ms-db-td" });
    stubLayout(td);
    renderer.render(td, row, DATE_COLUMN, 0);

    expect(document.querySelector(".ms-date-picker-popover")).toBeNull();

    td.dispatchEvent(new MouseEvent("click", { bubbles: true }));

    const calendar = document.querySelector(".ms-date-picker-popover");
    expect(calendar).not.toBeNull();
    expect(calendar?.querySelectorAll(".ms-date-day-header").length).toBe(7);
  });

  it("should open the calendar when an empty date cell is clicked", () => {
    const row: MarkdownTableRow = { rowIndex: 0, rawLine: "", cells: [""] };
    const { ctx, containerEl } = createContext([DATE_COLUMN], [row]);
    const renderer = new CellRenderer(ctx);

    const td = containerEl.createEl("td", { cls: "ms-db-td" });
    stubLayout(td);
    renderer.render(td, row, DATE_COLUMN, 0);

    expect(td.textContent).toBe("Empty");

    td.dispatchEvent(new MouseEvent("click", { bubbles: true }));

    expect(document.querySelector(".ms-date-picker-popover")).not.toBeNull();
  });

  it("should honour the column date format when saving a picked day", () => {
    const row: MarkdownTableRow = { rowIndex: 3, rawLine: "", cells: ["15.09.2026"] };
    const { ctx, actions, containerEl } = createContext([DATE_COLUMN], [row]);
    const renderer = new CellRenderer(ctx);

    const td = containerEl.createEl("td", { cls: "ms-db-td" });
    stubLayout(td);
    renderer.render(td, row, DATE_COLUMN, 0);
    td.dispatchEvent(new MouseEvent("click", { bubbles: true }));

    const dayCell = Array.from(
      document.querySelectorAll<HTMLElement>(
        ".ms-date-picker-popover .ms-date-day-cell:not(.is-other-month)"
      )
    ).find((cell) => cell.textContent === "20");

    dayCell?.dispatchEvent(new MouseEvent("click", { bubbles: true }));

    expect(actions.onCellUpdate).toHaveBeenCalledWith(3, 0, "20.09.2026");
  });

  it("should render the date icon and text for a filled cell", () => {
    const row: MarkdownTableRow = { rowIndex: 0, rawLine: "", cells: ["15.09.2026"] };
    const { ctx, containerEl } = createContext([DATE_COLUMN], [row]);
    const renderer = new CellRenderer(ctx);

    const td = containerEl.createEl("td", { cls: "ms-db-td" });
    renderer.render(td, row, DATE_COLUMN, 0);

    const icon = td.querySelector(".ms-date-icon svg");
    expect(icon).not.toBeNull();
    expect(icon?.getAttribute("width")).toBe("13");
    expect(td.querySelector(".ms-date-text")?.textContent).toBe("15.09.2026");
  });

  it("should format dates according to plugin settings if column has no format override", () => {
    const unformattedCol: TableColumn = { name: "Due", index: 0, type: "date" };
    const row: MarkdownTableRow = { rowIndex: 0, rawLine: "", cells: ["2026-09-15"] };
    const { ctx, containerEl } = createContext([unformattedCol], [row]);
    ctx.settings.dateFormat = "DD.MM.YYYY";
    const renderer = new CellRenderer(ctx);

    const td = containerEl.createEl("td", { cls: "ms-db-td" });
    renderer.render(td, row, unformattedCol, 0);

    expect(td.querySelector(".ms-date-text")?.textContent).toBe("15.09.2026");
  });
});
