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
    onColumnCalculationChange: vi.fn(noop),
    onReorderColumns: vi.fn(noop),
    onFilterChange: vi.fn(),
    onSortChange: vi.fn(),
    onTagColorChange: vi.fn(noop),
  };
}

function buildGrid(raw: string, columns: TableColumn[]) {
  const tableData: MarkdownTableData = parseMarkdownTables(raw)[0];
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
    clearFocus: vi.fn(),
  };

  const menus = new TableMenus(ctx, vi.fn());
  const grid = new TableGrid(ctx, menus, new CellRenderer(ctx), new RowDragController(ctx, menus), vi.fn());

  return { ctx, actions, containerEl, grid };
}

function dragEvent(type: string): Event {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(event, "dataTransfer", {
    value: { effectAllowed: "", dropEffect: "", setData: vi.fn(), getData: vi.fn(() => "") },
  });
  return event;
}

/** jsdom has no layout, so scrollLeft has to be made observable by hand. */
function trackScrollLeft(el: HTMLElement): { get value(): number; set value(next: number) } {
  let current = el.scrollLeft;
  Object.defineProperty(el, "scrollLeft", {
    configurable: true,
    get: () => current,
    set: (next: number) => {
      current = next;
    },
  });
  return {
    get value(): number {
      return current;
    },
    set value(next: number) {
      current = next;
    },
  };
}

const SAMPLE = "| Task | Status | Amount |\n| --- | --- | --- |\n| Buy milk | Todo | 12 |\n| Write docs | Done | 7 |";
const SAMPLE_COLUMNS: TableColumn[] = [
  { name: "Task", type: "text", index: 0 },
  { name: "Status", type: "text", index: 1 },
  { name: "Amount", type: "number", index: 2, align: "right" },
];

describe("Table grid UX", () => {
  beforeAll(() => {
    installObsidianDomHelpers(window as Window & typeof globalThis);
  });

  beforeEach(() => {
    document.body.innerHTML = "";
    vi.restoreAllMocks();
  });

  it("should centre the add-row button in a sticky wrapper", () => {
    const { ctx, grid } = buildGrid(SAMPLE, SAMPLE_COLUMNS);
    grid.render(ctx.containerEl);

    const inner = ctx.containerEl.querySelector<HTMLElement>(".ms-db-add-row-inner");
    expect(inner).not.toBeNull();
    expect(inner?.querySelector("button.ms-db-add-row-btn")).not.toBeNull();
  });

  it("should restore the horizontal scroll offset synchronously on the next render", () => {
    const { ctx, grid } = buildGrid(SAMPLE, SAMPLE_COLUMNS);
    grid.render(ctx.containerEl);

    const wrapper = ctx.containerEl.querySelector<HTMLElement>(".ms-db-table-scroll-wrapper");
    expect(wrapper).not.toBeNull();
    if (!wrapper) return;

    const scroll = trackScrollLeft(wrapper);
    scroll.value = 240;
    wrapper.dispatchEvent(new Event("scroll"));
    expect(ctx.filterState.scrollLeft).toBe(240);

    // Obsidian rebuilds the view after every write; the offset has to survive it.
    ctx.containerEl.empty();
    grid.render(ctx.containerEl);

    const rebuilt = ctx.containerEl.querySelector<HTMLElement>(".ms-db-table-scroll-wrapper");
    expect(rebuilt).not.toBeNull();
    if (!rebuilt) return;

    const restored = trackScrollLeft(rebuilt);
    expect(restored.value).toBe(240);
  });

  it("should mark the whole dragged column and the side the drop will land on", () => {
    const { ctx, actions, grid } = buildGrid(SAMPLE, SAMPLE_COLUMNS);
    grid.render(ctx.containerEl);

    const sourceTh = ctx.containerEl.querySelector<HTMLElement>('th.ms-db-th[data-col-index="0"]');
    const targetTh = ctx.containerEl.querySelector<HTMLElement>('th.ms-db-th[data-col-index="2"]');
    expect(sourceTh).not.toBeNull();
    expect(targetTh).not.toBeNull();

    sourceTh?.dispatchEvent(dragEvent("dragstart"));

    const draggedCells = ctx.containerEl.querySelectorAll('[data-col-index="0"].is-dragging-col');
    expect(draggedCells.length).toBe(3); // header + two body cells

    targetTh?.dispatchEvent(dragEvent("dragover"));
    const afterMarked = ctx.containerEl.querySelectorAll('[data-col-index="2"].is-col-drop-after');
    expect(afterMarked.length).toBe(3);
    expect(ctx.containerEl.querySelectorAll(".is-col-drop-before").length).toBe(0);

    targetTh?.dispatchEvent(dragEvent("drop"));
    expect(actions.onReorderColumns).toHaveBeenCalledWith(0, 2);
    expect(ctx.containerEl.querySelectorAll(".is-dragging-col, .is-col-drop-after").length).toBe(0);
  });

  it("should mark the leading edge when a column is dragged to the left", () => {
    const { ctx, grid } = buildGrid(SAMPLE, SAMPLE_COLUMNS);
    grid.render(ctx.containerEl);

    ctx.containerEl
      .querySelector<HTMLElement>('th.ms-db-th[data-col-index="2"]')
      ?.dispatchEvent(dragEvent("dragstart"));
    ctx.containerEl
      .querySelector<HTMLElement>('th.ms-db-th[data-col-index="0"]')
      ?.dispatchEvent(dragEvent("dragover"));

    expect(ctx.containerEl.querySelectorAll('[data-col-index="0"].is-col-drop-before').length).toBe(3);
    expect(ctx.containerEl.querySelectorAll(".is-col-drop-after").length).toBe(0);
  });

  it("should align number cells to the right and follow an explicit alignment", () => {
    const columns: TableColumn[] = [
      { name: "Task", type: "text", index: 0 },
      { name: "Status", type: "text", index: 1 },
      { name: "Amount", type: "number", index: 2, align: "left" },
    ];

    const plain = buildGrid(SAMPLE, SAMPLE_COLUMNS);
    plain.grid.render(plain.ctx.containerEl);
    const rightCell = plain.ctx.containerEl.querySelector<HTMLElement>('td.ms-db-td[data-col-index="2"]');
    expect(rightCell?.classList.contains("is-align-right")).toBe(true);
    expect(rightCell?.querySelector(".ms-cell-text-wrapper")?.classList.contains("is-number")).toBe(true);

    const overridden = buildGrid(SAMPLE, columns);
    overridden.grid.render(overridden.ctx.containerEl);
    const leftCell = overridden.ctx.containerEl.querySelector<HTMLElement>('td.ms-db-td[data-col-index="2"]');
    expect(leftCell?.classList.contains("is-align-left")).toBe(true);
  });

  it("should add a row from a click anywhere on the add-row", () => {
    const { ctx, actions, grid } = buildGrid(SAMPLE, SAMPLE_COLUMNS);
    grid.render(ctx.containerEl);

    const addRowTd = ctx.containerEl.querySelector<HTMLElement>("td.ms-db-add-row-td");
    expect(addRowTd).not.toBeNull();
    expect(addRowTd?.querySelector(".ms-db-add-row-inner button.ms-db-add-row-btn")).not.toBeNull();

    addRowTd?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(actions.onAddRow).toHaveBeenCalledTimes(1);

    // A click on the label itself must not count twice.
    ctx.containerEl
      .querySelector<HTMLElement>("button.ms-db-add-row-btn")
      ?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(actions.onAddRow).toHaveBeenCalledTimes(2);
  });

  it("should resize only the selected column from the pointer delta", () => {
    const { ctx, grid } = buildGrid(SAMPLE, SAMPLE_COLUMNS);
    const onColumnResize = vi.fn(async () => undefined);
    ctx.actions.onColumnResize = onColumnResize;
    grid.render(ctx.containerEl);

    const headers = Array.from(
      ctx.containerEl.querySelectorAll<HTMLElement>("th.ms-db-th")
    );
    const widths = [120, 180, 90];
    headers.forEach((header, index) => {
      vi.spyOn(header, "getBoundingClientRect").mockReturnValue({
        width: widths[index],
        left: widths.slice(0, index).reduce((sum, width) => sum + width, 0),
        right: widths.slice(0, index + 1).reduce((sum, width) => sum + width, 0),
        top: 0,
        bottom: 30,
        height: 30,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      });
    });

    const resizer = headers[1].querySelector<HTMLElement>(".ms-col-resizer");
    expect(resizer).not.toBeNull();
    resizer?.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, clientX: 200 }));
    document.dispatchEvent(new MouseEvent("mousemove", { clientX: 250 }));
    expect(headers[1].style.width).toBe("230px");
    expect(headers[0].style.width).toBe("120px");
    expect(headers[2].style.width).toBe("90px");

    document.dispatchEvent(new MouseEvent("mouseup"));
    expect(onColumnResize).toHaveBeenCalledWith({ "0": 120, "1": 230, "2": 90 });
  });

  it("should show the calculation bar only when enabled for the table", () => {
    const plain = buildGrid(SAMPLE, SAMPLE_COLUMNS);
    plain.grid.render(plain.ctx.containerEl);

    expect(plain.ctx.containerEl.querySelector(".ms-db-tfoot")).toBeNull();

    const withSum: TableColumn[] = SAMPLE_COLUMNS.map((col) =>
      col.name === "Amount" ? { ...col, calculation: "sum" as const } : col
    );
    const summed = buildGrid(SAMPLE, withSum);
    summed.ctx.filterState.showCalculationRow = true;
    summed.grid.render(summed.ctx.containerEl);

    const calcCell = summed.ctx.containerEl.querySelector<HTMLElement>(
      '.ms-db-calc-td[data-col-index="2"]'
    );
    expect(calcCell?.querySelector(".ms-calc-label")?.textContent).toBe("Sum:");
    expect(calcCell?.querySelector(".ms-calc-val")?.textContent).toBe("19");
    expect(summed.ctx.containerEl.querySelector(".ms-db-tfoot.is-active")).not.toBeNull();
  });

});
