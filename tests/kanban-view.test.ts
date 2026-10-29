import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import { App } from "obsidian";
import { DEFAULT_SETTINGS, MarkdownTableData, TableColumn, TableFilterState } from "../src/types";
import { getRowDropIndex, KanbanView } from "../src/ui/kanban-view";
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

  it("should restore Board scroll positions from table state", async () => {
    const filterState = {
      ...defaultFilterState,
      boardScrollLeft: 120,
      boardScrollTops: { Todo: 45 },
    };
    const kanban = new KanbanView({
      app: {} as App,
      sourcePath: "notes/test.md",
      tableData: sampleTableData,
      columns: sampleColumns,
      filterState,
      settings: { ...DEFAULT_SETTINGS },
      actions: createActions(),
      onSwitchView: vi.fn(),
    });

    const board = kanban.getElement();
    const boardWrapper = board.querySelector<HTMLElement>(".ms-kanban-board-wrapper");
    const todoList = Array.from(
      board.querySelectorAll<HTMLElement>(".ms-kanban-cards-list")
    ).find((list) => list.parentElement?.dataset.groupName === "Todo");

    await Promise.resolve();
    expect(boardWrapper?.scrollLeft).toBe(120);
    expect(todoList?.scrollTop).toBe(45);
  });

  it("should keep select groups in property order and retain empty groups", () => {
    const columns = sampleColumns.map((column) =>
      column.name === "Status"
        ? {
            ...column,
            uniqueTags: [
              { id: "done", name: "Done", color: "green" as const },
              { id: "todo", name: "Todo", color: "blue" as const },
              { id: "blocked", name: "Blocked", color: "red" as const },
            ],
          }
        : column
    );
    const tableData = {
      ...sampleTableData,
      rows: sampleTableData.rows.map((row) => ({ ...row, cells: [...row.cells] })),
    };
    tableData.rows[0].cells[1] = "Done";
    tableData.rows[1].cells[1] = "Done";
    tableData.rows[2].cells[1] = "";

    const kanban = new KanbanView({
      app: {} as App,
      sourcePath: "notes/test.md",
      tableData,
      columns,
      filterState: { ...defaultFilterState },
      settings: { ...DEFAULT_SETTINGS },
      actions: createActions(),
      onSwitchView: vi.fn(),
    });

    const board = kanban.getElement();
    const headers = Array.from(board.querySelectorAll<HTMLElement>(".ms-kanban-column-title"))
      .map((header) => header.textContent?.replace(/\d+$/, "").trim());

    expect(headers).toEqual(["Done", "Todo", "Blocked", "No Status"]);
  });

  it("should adjust the target index when moving a card across the target", () => {
    expect(getRowDropIndex(0, 1)).toBe(0);
    expect(getRowDropIndex(3, 1)).toBe(1);
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

    expect(actions.onCellUpdate).toHaveBeenCalledWith(0, 0, "Redesign UI completely");
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
    expect(actions.onCellUpdate).toHaveBeenCalledWith(0, 4, "[x]");
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

  function findCard(el: HTMLElement, title: string): HTMLElement | undefined {
    return Array.from(el.querySelectorAll<HTMLElement>(".ms-kanban-card")).find(
      (card) => card.querySelector(".ms-kanban-card-title")?.textContent?.trim() === title
    );
  }

  function renderBoard(settings: Partial<typeof DEFAULT_SETTINGS> = {}): HTMLElement {
    const kanban = new KanbanView({
      app: {} as App,
      sourcePath: "notes/test.md",
      tableData: sampleTableData,
      columns: sampleColumns,
      filterState: { ...defaultFilterState },
      settings: { ...DEFAULT_SETTINGS, ...settings },
      actions: createActions(),
      onSwitchView: vi.fn(),
    });

    const el = kanban.getElement();
    document.body.appendChild(el);
    return el;
  }

  it("should hide empty card properties but always keep checkboxes", () => {
    // "Write docs" has no due date and no status.
    const card = findCard(renderBoard(), "Write docs");

    expect(card).toBeDefined();
    expect(card?.querySelector(".ms-kanban-prop-badge.is-date")).toBeNull();
    expect(card?.querySelector(".ms-kanban-prop-badge.is-checkbox")).not.toBeNull();
    expect(card?.textContent).toContain("Low");

    // A card with a value still shows it.
    const filled = findCard(renderBoard(), "Design UI");
    expect(filled?.querySelector(".ms-kanban-prop-badge.is-date")).not.toBeNull();
  });

  it("should show placeholders for empty properties when the setting is enabled", () => {
    const card = findCard(renderBoard({ showEmptyBoardProperties: true }), "Write docs");

    const dateBadge = card?.querySelector(".ms-kanban-prop-badge.is-date");
    expect(dateBadge).not.toBeNull();
    expect(dateBadge?.textContent).toContain("Due");
  });


  it("should draw wikilinks in card properties instead of printing them", () => {
    const columns: TableColumn[] = [
      { index: 0, name: "Модуль", type: "text" },
      { index: 1, name: "Статус", type: "select", uniqueTags: [{ id: "todo", name: "Todo", color: "blue" }] },
      { index: 2, name: "Заметка", type: "text" },
    ];
    const tableData: MarkdownTableData = {
      id: "table-links",
      startLine: 0,
      endLine: 3,
      rawMarkdown: "",
      headers: ["Модуль", "Статус", "Заметка"],
      alignments: ["---", "---", "---"],
      rows: [
        {
          rowIndex: 0,
          cells: ["Ядро", "Todo", "[[System Design]]"],
          rawLine: "| Ядро | Todo | [[System Design]] |",
        },
      ],
    };

    const kanban = new KanbanView({
      app: {} as App,
      sourcePath: "notes/test.md",
      tableData,
      columns,
      filterState: { ...defaultFilterState },
      settings: { ...DEFAULT_SETTINGS },
      actions: createActions(),
      onSwitchView: vi.fn(),
    });

    const el = kanban.getElement();
    document.body.appendChild(el);

    const link = el.querySelector<HTMLElement>(".ms-kanban-prop-badge .ms-cell-link.internal-link");
    expect(link).not.toBeNull();
    expect(link?.textContent).toBe("System Design");
    expect(el.textContent).not.toContain("[[");
  });


  it("should label numeric card properties with their column name", () => {
    const columns: TableColumn[] = [
      { index: 0, name: "Модуль", type: "text" },
      { index: 1, name: "Статус", type: "select", uniqueTags: [{ id: "todo", name: "Todo", color: "blue" }] },
      { index: 2, name: "Покрытие (%)", type: "number" },
    ];
    const tableData: MarkdownTableData = {
      id: "table-numbers",
      startLine: 0,
      endLine: 3,
      rawMarkdown: "",
      headers: ["Модуль", "Статус", "Покрытие (%)"],
      alignments: ["---", "---", "---:"],
      rows: [
        { rowIndex: 0, cells: ["Ядро", "Todo", "94"], rawLine: "| Ядро | Todo | 94 |" },
      ],
    };

    const kanban = new KanbanView({
      app: {} as App,
      sourcePath: "notes/test.md",
      tableData,
      columns,
      filterState: { ...defaultFilterState },
      settings: { ...DEFAULT_SETTINGS },
      actions: createActions(),
      onSwitchView: vi.fn(),
    });

    const el = kanban.getElement();
    document.body.appendChild(el);

    const badge = el.querySelector<HTMLElement>(".ms-kanban-prop-badge.is-number");
    expect(badge).not.toBeNull();
    expect(badge?.querySelector(".ms-kanban-prop-name")?.textContent).toBe("Покрытие (%)");
    expect(badge?.querySelector(".ms-kanban-prop-value")?.textContent).toBe("94");
  });

});
