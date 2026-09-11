import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import { App } from "obsidian";
import { parseMarkdownTables } from "../src/core/markdown-parser";
import { CellRenderer } from "../src/ui/table/cells";
import { KeyboardController } from "../src/ui/table/keyboard";
import { SelectionModel } from "../src/ui/table/selection";
import { TableViewActions, TableViewContext } from "../src/ui/table/types";
import { DisposableRegistry } from "../src/utils/lifecycle";
import { DEFAULT_SETTINGS, MarkdownTableData, TableColumn } from "../src/types";
import { installObsidianDomHelpers } from "./helpers/obsidian-dom";

function createActions(): TableViewActions {
  const noop = async (): Promise<void> => undefined;
  return {
    onCellUpdate: vi.fn(noop),
    onAddRow: vi.fn(async () => undefined),
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
    applySelection: vi.fn(),
    clearFocus: vi.fn(() => ctx.selection.clear()),
  };

  return { ctx, actions, containerEl };
}

describe("TableKeyboardController", () => {
  beforeAll(() => {
    installObsidianDomHelpers(window as Window & typeof globalThis);
  });

  beforeEach(() => {
    document.body.innerHTML = "";
    vi.restoreAllMocks();
  });

  it("should navigate focus with Arrow keys and Tab", () => {
    const raw = "| Col A | Col B |\n| --- | --- |\n| 1 | 2 |\n| 3 | 4 |";
    const tables = parseMarkdownTables(raw);
    const tableData = tables[0];
    const columns: TableColumn[] = [
      { name: "Col A", type: "text", index: 0 },
      { name: "Col B", type: "text", index: 1 },
    ];

    const { ctx, containerEl } = createContext(tableData, columns);
    const mockCells = {
      isEditing: false,
      startInlineEditing: vi.fn(),
      openSingleSelectPopover: vi.fn(),
      openTagSelectModal: vi.fn(),
      openDatePicker: vi.fn(),
    } as unknown as CellRenderer;

    const keyboard = new KeyboardController(ctx, mockCells);
    keyboard.bind();

    ctx.selection.focusCell(0, 0);

    containerEl.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
    expect(ctx.selection.getFocusedCell()).toEqual({ row: 0, col: 1 });

    containerEl.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
    expect(ctx.selection.getFocusedCell()).toEqual({ row: 1, col: 1 });

    containerEl.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true }));
    expect(ctx.selection.getFocusedCell()).toEqual({ row: 1, col: 0 });

    containerEl.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowUp", bubbles: true }));
    expect(ctx.selection.getFocusedCell()).toEqual({ row: 0, col: 0 });

    containerEl.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true }));
    expect(ctx.selection.getFocusedCell()).toEqual({ row: 0, col: 1 });

    containerEl.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true }));
    expect(ctx.selection.getFocusedCell()).toEqual({ row: 1, col: 0 });

    containerEl.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", shiftKey: true, bubbles: true }));
    expect(ctx.selection.getFocusedCell()).toEqual({ row: 0, col: 1 });
  });

  it("should clear focus on Escape key", () => {
    const raw = "| Col A |\n| --- |\n| 1 |";
    const tables = parseMarkdownTables(raw);
    const columns: TableColumn[] = [{ name: "Col A", type: "text", index: 0 }];

    const { ctx, containerEl } = createContext(tables[0], columns);
    const mockCells = { isEditing: false } as unknown as CellRenderer;

    const keyboard = new KeyboardController(ctx, mockCells);
    keyboard.bind();

    ctx.selection.focusCell(0, 0);
    expect(ctx.selection.getFocusedCell()).toEqual({ row: 0, col: 0 });

    containerEl.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(ctx.selection.getFocusedCell()).toBeNull();
  });

  it("should toggle checkbox cell when Enter is pressed", () => {
    const raw = "| Done |\n| --- |\n| [ ] |";
    const tables = parseMarkdownTables(raw);
    const columns: TableColumn[] = [{ name: "Done", type: "checkbox", index: 0 }];

    const { ctx, actions, containerEl } = createContext(tables[0], columns);
    const cellTd = containerEl.createEl("td", { cls: "ms-db-td" });
    cellTd.dataset.rowIndex = "0";
    cellTd.dataset.colIndex = "0";

    const mockCells = { isEditing: false } as unknown as CellRenderer;
    const keyboard = new KeyboardController(ctx, mockCells);
    keyboard.bind();

    ctx.selection.focusCell(0, 0);
    containerEl.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));

    expect(actions.onCellUpdate).toHaveBeenCalledWith(0, 0, "[x]");
  });

  it("should open corresponding picker or editor when Enter is pressed on date or select", () => {
    const raw = "| Priority | Date |\n| --- | --- |\n| High | 2026-09-01 |";
    const tables = parseMarkdownTables(raw);
    const columns: TableColumn[] = [
      { name: "Priority", type: "select", index: 0 },
      { name: "Date", type: "date", index: 1 },
    ];

    const { ctx, containerEl } = createContext(tables[0], columns);
    const td0 = containerEl.createEl("td", { cls: "ms-db-td" });
    td0.dataset.rowIndex = "0";
    td0.dataset.colIndex = "0";
    const td1 = containerEl.createEl("td", { cls: "ms-db-td" });
    td1.dataset.rowIndex = "0";
    td1.dataset.colIndex = "1";

    const mockCells = {
      isEditing: false,
      startInlineEditing: vi.fn(),
      openSingleSelectPopover: vi.fn(),
      openTagSelectModal: vi.fn(),
      openDatePicker: vi.fn(),
    } as unknown as CellRenderer;

    const keyboard = new KeyboardController(ctx, mockCells);
    keyboard.bind();

    ctx.selection.focusCell(0, 0);
    containerEl.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    expect(mockCells.openSingleSelectPopover).toHaveBeenCalledWith(
      td0,
      tables[0].rows[0],
      columns[0],
      0,
      "High"
    );

    ctx.selection.focusCell(0, 1);
    containerEl.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    expect(mockCells.openDatePicker).toHaveBeenCalledWith(
      td1,
      0,
      1,
      "2026-09-01"
    );
  });

  it("should start inline editing on printable character input", () => {
    const raw = "| Note |\n| --- |\n| Hello |";
    const tables = parseMarkdownTables(raw);
    const columns: TableColumn[] = [{ name: "Note", type: "text", index: 0 }];

    const { ctx, containerEl } = createContext(tables[0], columns);
    const td0 = containerEl.createEl("td", { cls: "ms-db-td" });
    td0.dataset.rowIndex = "0";
    td0.dataset.colIndex = "0";

    const mockCells = {
      isEditing: false,
      startInlineEditing: vi.fn(),
    } as unknown as CellRenderer;

    const keyboard = new KeyboardController(ctx, mockCells);
    keyboard.bind();

    ctx.selection.focusCell(0, 0);
    const keyEvent = new KeyboardEvent("keydown", { key: "a", bubbles: true, cancelable: true });
    containerEl.dispatchEvent(keyEvent);

    expect(keyEvent.defaultPrevented).toBe(true);
    expect(mockCells.startInlineEditing).toHaveBeenCalledWith(td0, 0, 0, "", "a");
  });
});
