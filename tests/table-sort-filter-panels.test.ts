import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import { App } from "obsidian";
import { parseMarkdownTables } from "../src/core/markdown-parser";
import { FilterPanel } from "../src/ui/table/filter-panel";
import { SelectionModel } from "../src/ui/table/selection";
import { SortPanel } from "../src/ui/table/sort-panel";
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
      isFilterOpen: true,
      isSortOpen: true,
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

  return { ctx, actions, containerEl };
}

describe("SortPanel and FilterPanel", () => {
  beforeAll(() => {
    installObsidianDomHelpers(window as Window & typeof globalThis);
  });

  beforeEach(() => {
    document.body.innerHTML = "";
    vi.restoreAllMocks();
  });

  describe("SortPanel", () => {
    it("should render empty state and allow adding a sort rule", () => {
      const raw = "| Name | Age |\n| --- | --- |\n| Alice | 30 |";
      const tableData = parseMarkdownTables(raw)[0];
      const columns: TableColumn[] = [
        { name: "Name", type: "text", index: 0 },
        { name: "Age", type: "number", index: 1 },
      ];

      const { ctx, actions } = createContext(tableData, columns);
      const panel = new SortPanel(ctx);
      const panelEl = document.createElement("div");

      panel.render(panelEl);

      const addBtn = panelEl.querySelector(".ms-add-filter-btn") as HTMLButtonElement;
      expect(addBtn).not.toBeNull();

      addBtn.click();

      expect(ctx.filterState.sortRules).toHaveLength(1);
      expect(actions.onSortChange).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ column: "Name", columnIndex: 0, direction: "asc" }),
        ])
      );
      expect(ctx.render).toHaveBeenCalled();
    });

    it("should allow changing direction and removing a sort rule", () => {
      const raw = "| Name | Age |\n| --- | --- |\n| Alice | 30 |";
      const tableData = parseMarkdownTables(raw)[0];
      const columns: TableColumn[] = [
        { name: "Name", type: "text", index: 0 },
        { name: "Age", type: "number", index: 1 },
      ];

      const { ctx, actions } = createContext(tableData, columns);
      ctx.filterState.sortRules = [{ column: "Name", columnIndex: 0, direction: "asc" }];

      const panel = new SortPanel(ctx);
      const panelEl = document.createElement("div");

      panel.render(panelEl);

      const dirSelect = panelEl.querySelector(".ms-rule-op-select") as HTMLSelectElement;
      expect(dirSelect).not.toBeNull();
      dirSelect.value = "desc";
      dirSelect.dispatchEvent(new Event("change"));

      expect(ctx.filterState.sortRules[0].direction).toBe("desc");
      expect(actions.onSortChange).toHaveBeenCalled();

      const deleteBtn = panelEl.querySelector(".ms-delete-rule-btn") as HTMLButtonElement;
      expect(deleteBtn).not.toBeNull();
      deleteBtn.click();

      expect(ctx.filterState.sortRules).toHaveLength(0);
      expect(actions.onSortChange).toHaveBeenCalledWith([]);
    });
  });

  describe("FilterPanel", () => {
    it("should render empty state and allow adding a filter rule", () => {
      const raw = "| Title | Priority |\n| --- | --- |\n| Task | High |";
      const tableData = parseMarkdownTables(raw)[0];
      const columns: TableColumn[] = [
        { name: "Title", type: "text", index: 0 },
        { name: "Priority", type: "select", index: 1 },
      ];

      const { ctx, actions } = createContext(tableData, columns);
      const panel = new FilterPanel(ctx);
      const panelEl = document.createElement("div");

      panel.render(panelEl);

      const addBtn = panelEl.querySelector(".ms-add-filter-btn") as HTMLButtonElement;
      expect(addBtn).not.toBeNull();

      addBtn.click();

      expect(ctx.filterState.rules).toHaveLength(1);
      expect(actions.onFilterChange).toHaveBeenCalled();
      expect(ctx.render).toHaveBeenCalled();
    });

    it("should allow editing filter rule column, operator, value and removing rule", () => {
      const raw = "| Title | Priority |\n| --- | --- |\n| Task | High |";
      const tableData = parseMarkdownTables(raw)[0];
      const columns: TableColumn[] = [
        { name: "Title", type: "text", index: 0 },
        { name: "Priority", type: "select", index: 1 },
      ];

      const { ctx, actions } = createContext(tableData, columns);
      ctx.filterState.rules = [
        {
          id: "r1",
          column: "Title",
          columnIndex: 0,
          operator: "contains",
          value: "Task",
          enabled: true,
          conjunction: "AND",
        },
      ];

      const panel = new FilterPanel(ctx);
      const panelEl = document.createElement("div");

      panel.render(panelEl);

      const colSelect = panelEl.querySelector(".ms-rule-col-select") as HTMLSelectElement;
      expect(colSelect).not.toBeNull();
      colSelect.value = "1";
      colSelect.dispatchEvent(new Event("change"));

      expect(ctx.filterState.rules[0].columnIndex).toBe(1);
      expect(ctx.filterState.rules[0].column).toBe("Priority");

      const opSelect = panelEl.querySelector(".ms-rule-op-select") as HTMLSelectElement;
      expect(opSelect).not.toBeNull();
      opSelect.value = "is_not_empty";
      opSelect.dispatchEvent(new Event("change"));

      expect(ctx.filterState.rules[0].operator).toBe("is_not_empty");

      const deleteBtn = panelEl.querySelector(".ms-delete-rule-btn") as HTMLButtonElement;
      expect(deleteBtn).not.toBeNull();
      deleteBtn.click();

      expect(ctx.filterState.rules).toHaveLength(0);
      expect(actions.onFilterChange).toHaveBeenCalled();
    });
  });
});
