import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import { App } from "obsidian";
import { DEFAULT_SETTINGS, MarkdownTableData, TableColumn, TableFilterState } from "../src/types";
import { KanbanView } from "../src/ui/kanban-view";
import { BoardViewActions } from "../src/ui/table/types";
import { installObsidianDomHelpers } from "./helpers/obsidian-dom";

describe("KanbanView", () => {
  beforeAll(() => {
    installObsidianDomHelpers(window as Window & typeof globalThis);
  });

  beforeEach(() => {
    document.body.innerHTML = "";
    window.innerHeight = 800;
    window.innerWidth = 1200;
  });

  const sampleColumns: TableColumn[] = [
    { index: 0, name: "Task", type: "text" },
    {
      index: 1,
      name: "Status",
      type: "select",
      uniqueTags: [
        { id: "todo", name: "Todo", color: "blue" },
        { id: "done", name: "Done", color: "green" },
      ],
    },
    { index: 2, name: "Priority", type: "text" },
    { index: 3, name: "Due", type: "date" },
    { index: 4, name: "Completed", type: "checkbox" },
  ];

  const sampleTableData: MarkdownTableData = {
    id: "table-1",
    startLine: 0,
    endLine: 4,
    rawMarkdown: "",
    headers: ["Task", "Status", "Priority", "Due", "Completed"],
    alignments: ["left", "left", "left", "left", "left"],
    rows: [
      {
        rowIndex: 0,
        cells: ["Design UI", "Todo", "High", "2026-09-10", "[ ]"],
        rawLine: "| Design UI | Todo | High | 2026-09-10 | [ ] |",
      },
      {
        rowIndex: 1,
        cells: ["Implement backend", "Done", "Medium", "2026-09-08", "[x]"],
        rawLine: "| Implement backend | Done | Medium | 2026-09-08 | [x] |",
      },
      {
        rowIndex: 2,
        cells: ["Write docs", "", "Low", "", "[ ]"],
        rawLine: "| Write docs | | Low | | [ ] |",
      },
    ],
  };

  function createActions(): BoardViewActions {
    return {
      onCellUpdate: vi.fn().mockResolvedValue(undefined),
      onAddRow: vi.fn().mockResolvedValue(undefined),
      onDeleteRow: vi.fn().mockResolvedValue(undefined),
      onReorderRows: vi.fn().mockResolvedValue(undefined),
      onTagColorChange: vi.fn().mockResolvedValue(undefined),
    };
  }

  const defaultFilterState: TableFilterState = {
    tableId: "test-table",
    conjunction: "AND",
    rules: [],
    sortRules: [],
    searchQuery: "",
    isFilterOpen: false,
    isSortOpen: false,
  };

  it("should render kanban board with columns and cards", () => {
    const actions = createActions();
    const onSwitchView = vi.fn();

    const kanban = new KanbanView({
      app: {} as App,
      sourcePath: "notes/test.md",
      tableData: sampleTableData,
      columns: sampleColumns,
      filterState: { ...defaultFilterState },
      settings: { ...DEFAULT_SETTINGS },
      actions,
      onSwitchView,
    });

    const el = kanban.getElement();
    document.body.appendChild(el);

    const columns = el.querySelectorAll<HTMLElement>(".ms-kanban-column");
    expect(columns.length).toBe(3);

    const cards = el.querySelectorAll<HTMLElement>(".ms-kanban-card");
    expect(cards.length).toBe(3);

    const titles = Array.from(cards).map((c) =>
      c.querySelector(".ms-kanban-card-title")?.textContent?.trim()
    );
    expect(titles).toContain("Design UI");
    expect(titles).toContain("Implement backend");
    expect(titles).toContain("Write docs");
  });

  it("should handle switching view back to table", () => {
    const actions = createActions();
    const onSwitchView = vi.fn();

    const kanban = new KanbanView({
      app: {} as App,
      sourcePath: "notes/test.md",
      tableData: sampleTableData,
      columns: sampleColumns,
      filterState: { ...defaultFilterState },
      settings: { ...DEFAULT_SETTINGS },
      actions,
      onSwitchView,
    });

    const el = kanban.getElement();
    const tableBtn = el.querySelector<HTMLButtonElement>(".ms-db-view-tab-btn");
    tableBtn?.click();

    expect(onSwitchView).toHaveBeenCalledWith("table");
  });

  it("should handle group by column selection change", () => {
    const actions = createActions();
    const onSwitchView = vi.fn();

    const kanban = new KanbanView({
      app: {} as App,
      sourcePath: "notes/test.md",
      tableData: sampleTableData,
      columns: sampleColumns,
      filterState: { ...defaultFilterState },
      settings: { ...DEFAULT_SETTINGS },
      actions,
      onSwitchView,
    });

    const el = kanban.getElement();
    const groupSelect = el.querySelector<HTMLSelectElement>(".ms-group-select");
    expect(groupSelect).not.toBeNull();

    if (groupSelect) {
      groupSelect.value = "4";
      groupSelect.dispatchEvent(new Event("change", { bubbles: true }));
    }

    const checkboxCols = el.querySelectorAll<HTMLElement>(".ms-kanban-prop-badge.is-checkbox");
    expect(checkboxCols.length).toBeGreaterThan(0);
  });

  it("should trigger onAddRow when clicking '+ New' in a column", () => {
    const actions = createActions();
    const onSwitchView = vi.fn();

    const kanban = new KanbanView({
      app: {} as App,
      sourcePath: "notes/test.md",
      tableData: sampleTableData,
      columns: sampleColumns,
      filterState: { ...defaultFilterState },
      settings: { ...DEFAULT_SETTINGS },
      actions,
      onSwitchView,
    });

    const el = kanban.getElement();
    const addButtons = el.querySelectorAll<HTMLButtonElement>(".ms-kanban-bottom-add-btn");
    expect(addButtons.length).toBeGreaterThan(0);

    addButtons[0].click();
    expect(actions.onAddRow).toHaveBeenCalledTimes(1);
    const [, prefilled] = (actions.onAddRow as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(Array.isArray(prefilled)).toBe(true);
  });

  it("should support editing card title on double-click", async () => {
    const actions = createActions();
    const onSwitchView = vi.fn();

    const kanban = new KanbanView({
      app: {} as App,
      sourcePath: "notes/test.md",
      tableData: sampleTableData,
      columns: sampleColumns,
      filterState: { ...defaultFilterState },
      settings: { ...DEFAULT_SETTINGS },
      actions,
      onSwitchView,
    });

    const el = kanban.getElement();
    const firstTitle = el.querySelector<HTMLElement>(".ms-kanban-card-title");
    expect(firstTitle).not.toBeNull();

    firstTitle?.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));

    const input = firstTitle?.querySelector<HTMLInputElement>("input");
    expect(input).not.toBeNull();

    if (input) {
      input.value = "Redesign UI completely";
      input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    }

    expect(actions.onCellUpdate).toHaveBeenCalledWith(2, 0, "Redesign UI completely");
  });

  it("should toggle checkbox property on click", async () => {
    const actions = createActions();
    const onSwitchView = vi.fn();

    const kanban = new KanbanView({
      app: {} as App,
      sourcePath: "notes/test.md",
      tableData: sampleTableData,
      columns: sampleColumns,
      filterState: { ...defaultFilterState },
      settings: { ...DEFAULT_SETTINGS },
      actions,
      onSwitchView,
    });

    const el = kanban.getElement();
    const checkboxBadges = el.querySelectorAll<HTMLElement>(
      ".ms-kanban-card .ms-kanban-prop-badge.is-checkbox"
    );
    expect(checkboxBadges.length).toBeGreaterThan(0);

    checkboxBadges[0].click();
    expect(actions.onCellUpdate).toHaveBeenCalledWith(2, 4, "[x]");
  });

  it("should render clickable links in kanban card titles and handle click events", () => {
    const actions = createActions();
    const onSwitchView = vi.fn();
    const tableDataWithLinks: MarkdownTableData = {
      ...sampleTableData,
      rows: [
        {
          rowIndex: 0,
          cells: ["Visit [GitHub](https://github.com)", "Todo", "High", "2026-09-10", "[ ]"],
          rawLine: "",
        },
      ],
    };

    const windowOpenSpy = vi.spyOn(window, "open").mockImplementation(() => null);

    const kanban = new KanbanView({
      app: {} as App,
      sourcePath: "notes/test.md",
      tableData: tableDataWithLinks,
      columns: sampleColumns,
      filterState: { ...defaultFilterState },
      settings: { ...DEFAULT_SETTINGS },
      actions,
      onSwitchView,
    });

    const el = kanban.getElement();
    const linkEl = el.querySelector<HTMLAnchorElement>(".ms-kanban-card-title a.external-link");
    expect(linkEl).not.toBeNull();
    expect(linkEl?.textContent).toBe("GitHub");
    expect(linkEl?.getAttribute("href")).toBe("https://github.com");

    linkEl?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(windowOpenSpy).toHaveBeenCalledWith("https://github.com", "_blank");

    windowOpenSpy.mockRestore();
  });
});
