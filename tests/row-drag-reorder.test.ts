import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import { App } from "obsidian";
import { parseMarkdownTables } from "../src/core/markdown-parser";
import { CellRenderer } from "../src/ui/table/cells";
import { RowDragController } from "../src/ui/table/dnd";
import { TableGrid } from "../src/ui/table/grid";
import { TableMenus } from "../src/ui/table/menus";
import { SelectionModel } from "../src/ui/table/selection";
import { TableViewActions, TableViewContext } from "../src/ui/table/types";
import { DisposableRegistry } from "../src/utils/lifecycle";
import { DEFAULT_SETTINGS, MarkdownTableData, TableColumn } from "../src/types";
import { installObsidianDomHelpers } from "./helpers/obsidian-dom";

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

function createContext(tableData: MarkdownTableData, columns: TableColumn[], showRowNumbers = false) {
  const containerEl = document.createElement("div");
  document.body.appendChild(containerEl);

  const actions = createActions();
  const ctx: TableViewContext = {
    app: {} as App,
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
      showRowNumbers,
      searchQuery: "",
      isFilterOpen: false,
      isSortOpen: false,
    },
    settings: { ...DEFAULT_SETTINGS, showRowNumbers },
    isRowNumbersVisible: () => showRowNumbers,
    getVisibleColumns: () => columns,
    render: vi.fn(),
    renderRows: vi.fn(),
    switchView: vi.fn(),
    applySelection: vi.fn(),
    clearFocus: vi.fn(),
  };

  return { ctx, actions, containerEl };
}

describe("Row drag reordering", () => {
  beforeAll(() => {
    installObsidianDomHelpers(window as Window & typeof globalThis);
  });

  beforeEach(() => {
    document.body.innerHTML = "";
    vi.restoreAllMocks();
  });

  it("should reorder adjacent rows when dragging downwards from row 0 to row 1", async () => {
    const raw = "| Task | Status |\n| --- | --- |\n| Task A | Todo |\n| Task B | Done |\n| Task C | Backlog |";
    const tables = parseMarkdownTables(raw);
    const tableData = tables[0];
    const columns: TableColumn[] = [
      { name: "Task", type: "text", index: 0 },
      { name: "Status", type: "text", index: 1 },
    ];

    const { ctx, actions } = createContext(tableData, columns);
    const menus = new TableMenus(ctx, vi.fn());
    const rowDrag = new RowDragController(ctx, menus);

    const tbody = document.createElement("tbody");
    rowDrag.setBody(tbody);

    const tr0 = document.createElement("tr");
    tr0.dataset.rowIndex = "0";
    tr0.getBoundingClientRect = () => ({
      top: 0,
      bottom: 30,
      height: 30,
      left: 0,
      right: 200,
      width: 200,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });
    rowDrag.attachRow(tr0, tableData.rows[0]);

    const tr1 = document.createElement("tr");
    tr1.dataset.rowIndex = "1";
    tr1.getBoundingClientRect = () => ({
      top: 30,
      bottom: 60,
      height: 30,
      left: 0,
      right: 200,
      width: 200,
      x: 0,
      y: 30,
      toJSON: () => ({}),
    });
    rowDrag.attachRow(tr1, tableData.rows[1]);

    tbody.appendChild(tr0);
    tbody.appendChild(tr1);

    const grip = rowDrag.element.querySelector(".ms-row-action-grip") as HTMLElement;
    tr0.dispatchEvent(new MouseEvent("mouseenter"));
    grip.dispatchEvent(new Event("dragstart"));

    const dragOverEvt = new Event("dragover", { bubbles: true, cancelable: true });
    Object.defineProperty(dragOverEvt, "clientY", { value: 35 });
    Object.defineProperty(dragOverEvt, "dataTransfer", { value: { dropEffect: "" } });
    tr1.dispatchEvent(dragOverEvt);

    expect(tr1.classList.contains("is-row-drop-target-bottom")).toBe(true);

    const dropEvt = new Event("drop", { bubbles: true, cancelable: true });
    Object.defineProperty(dropEvt, "clientY", { value: 35 });
    Object.defineProperty(dropEvt, "dataTransfer", {
      value: { getData: (format: string) => (format === "text/plain" ? "0" : "") },
    });
    tr1.dispatchEvent(dropEvt);

    expect(actions.onReorderRows).toHaveBeenCalledWith(0, 1);
  });

  it("should reorder adjacent rows when dragging upwards from row 1 to row 0", async () => {
    const raw = "| Task |\n| --- |\n| Row 0 |\n| Row 1 |";
    const tables = parseMarkdownTables(raw);
    const tableData = tables[0];
    const columns: TableColumn[] = [{ name: "Task", type: "text", index: 0 }];

    const { ctx, actions } = createContext(tableData, columns);
    const menus = new TableMenus(ctx, vi.fn());
    const rowDrag = new RowDragController(ctx, menus);

    const tbody = document.createElement("tbody");
    rowDrag.setBody(tbody);

    const tr0 = document.createElement("tr");
    tr0.dataset.rowIndex = "0";
    tr0.getBoundingClientRect = () => ({
      top: 0,
      bottom: 30,
      height: 30,
      left: 0,
      right: 200,
      width: 200,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });
    rowDrag.attachRow(tr0, tableData.rows[0]);

    const tr1 = document.createElement("tr");
    tr1.dataset.rowIndex = "1";
    tr1.getBoundingClientRect = () => ({
      top: 30,
      bottom: 60,
      height: 30,
      left: 0,
      right: 200,
      width: 200,
      x: 0,
      y: 30,
      toJSON: () => ({}),
    });
    rowDrag.attachRow(tr1, tableData.rows[1]);

    tbody.appendChild(tr0);
    tbody.appendChild(tr1);

    const grip = rowDrag.element.querySelector(".ms-row-action-grip") as HTMLElement;
    tr1.dispatchEvent(new MouseEvent("mouseenter"));
    grip.dispatchEvent(new Event("dragstart"));

    const dragOverEvt = new Event("dragover", { bubbles: true, cancelable: true });
    Object.defineProperty(dragOverEvt, "clientY", { value: 25 });
    Object.defineProperty(dragOverEvt, "dataTransfer", { value: { dropEffect: "" } });
    tr0.dispatchEvent(dragOverEvt);

    expect(tr0.classList.contains("is-row-drop-target-top")).toBe(true);

    const dropEvt = new Event("drop", { bubbles: true, cancelable: true });
    Object.defineProperty(dropEvt, "clientY", { value: 25 });
    Object.defineProperty(dropEvt, "dataTransfer", {
      value: { getData: (format: string) => (format === "text/plain" ? "1" : "") },
    });
    tr0.dispatchEvent(dropEvt);

    expect(actions.onReorderRows).toHaveBeenCalledWith(1, 0);
  });

  it("should reorder when dragging to bottom half vs top half of distant row", async () => {
    const raw = "| Task |\n| --- |\n| Row 0 |\n| Row 1 |\n| Row 2 |\n| Row 3 |";
    const tables = parseMarkdownTables(raw);
    const tableData = tables[0];
    const columns: TableColumn[] = [{ name: "Task", type: "text", index: 0 }];

    const { ctx, actions } = createContext(tableData, columns);
    const menus = new TableMenus(ctx, vi.fn());
    const rowDrag = new RowDragController(ctx, menus);

    const tbody = document.createElement("tbody");
    rowDrag.setBody(tbody);

    const tr2 = document.createElement("tr");
    tr2.dataset.rowIndex = "2";
    tr2.getBoundingClientRect = () => ({
      top: 60,
      bottom: 90,
      height: 30,
      left: 0,
      right: 200,
      width: 200,
      x: 0,
      y: 60,
      toJSON: () => ({}),
    });
    rowDrag.attachRow(tr2, tableData.rows[2]);

    const dropTopEvt = new Event("drop", { bubbles: true, cancelable: true });
    Object.defineProperty(dropTopEvt, "clientY", { value: 65 });
    Object.defineProperty(dropTopEvt, "dataTransfer", {
      value: { getData: (format: string) => (format === "text/plain" ? "0" : "") },
    });
    tr2.dispatchEvent(dropTopEvt);

    expect(actions.onReorderRows).toHaveBeenCalledWith(0, 1);

    const dropBottomEvt = new Event("drop", { bubbles: true, cancelable: true });
    Object.defineProperty(dropBottomEvt, "clientY", { value: 85 });
    Object.defineProperty(dropBottomEvt, "dataTransfer", {
      value: { getData: (format: string) => (format === "text/plain" ? "0" : "") },
    });
    tr2.dispatchEvent(dropBottomEvt);

    expect(actions.onReorderRows).toHaveBeenCalledWith(0, 2);
  });

  it("should move row to end when dropping on the add-row row", async () => {
    const raw = "| Task |\n| --- |\n| Row 0 |\n| Row 1 |\n| Row 2 |";
    const tables = parseMarkdownTables(raw);
    const tableData = tables[0];
    const columns: TableColumn[] = [{ name: "Task", type: "text", index: 0 }];

    const { ctx, actions } = createContext(tableData, columns);
    const menus = new TableMenus(ctx, vi.fn());
    const rowDrag = new RowDragController(ctx, menus);

    const addRowTr = document.createElement("tr");
    rowDrag.attachAddRowDropTarget(addRowTr, tableData.rows.length);

    const dragOverEvt = new Event("dragover", { bubbles: true, cancelable: true });
    Object.defineProperty(dragOverEvt, "dataTransfer", { value: { dropEffect: "" } });

    const grip = rowDrag.element.querySelector(".ms-row-action-grip") as HTMLElement;
    const tr0 = document.createElement("tr");
    rowDrag.attachRow(tr0, tableData.rows[0]);
    tr0.dispatchEvent(new MouseEvent("mouseenter"));
    grip.dispatchEvent(new Event("dragstart"));

    addRowTr.dispatchEvent(dragOverEvt);
    expect(addRowTr.classList.contains("is-row-drop-target-top")).toBe(true);

    const dropEvt = new Event("drop", { bubbles: true, cancelable: true });
    Object.defineProperty(dropEvt, "dataTransfer", {
      value: { getData: (format: string) => (format === "text/plain" ? "0" : "") },
    });
    addRowTr.dispatchEvent(dropEvt);

    expect(actions.onReorderRows).toHaveBeenCalledWith(0, 2);
  });

  it("should render index cell with row number only and not with grip icon", async () => {
    const raw = "| Task |\n| --- |\n| Item 1 |\n| Item 2 |";
    const tables = parseMarkdownTables(raw);
    const tableData = tables[0];
    const columns: TableColumn[] = [{ name: "Task", type: "text", index: 0 }];

    const { ctx, containerEl } = createContext(tableData, columns, true);
    const menus = new TableMenus(ctx, vi.fn());
    const cells = new CellRenderer(ctx);
    const rowDrag = new RowDragController(ctx, menus);
    const grid = new TableGrid(ctx, menus, cells, rowDrag, vi.fn());

    grid.render(containerEl);

    const indexTds = containerEl.querySelectorAll("td.ms-db-td-index:not(.ms-db-add-row-index-td)");
    expect(indexTds.length).toBe(2);

    const firstTd = indexTds[0] as HTMLElement;
    const numSpan = firstTd.querySelector(".ms-row-num-text");
    expect(numSpan?.textContent).toBe("1");

    const gripSpan = firstTd.querySelector(".ms-row-grip-icon");
    expect(gripSpan).toBeNull();

    firstTd.click();
    expect(ctx.selection.isRowFocused(0)).toBe(true);
  });
});
