import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { App } from "obsidian";
import { parseMarkdownTables } from "../src/core/markdown-parser";
import { TableStateManager } from "../src/core/table-state";
import { SettingsService } from "../src/services/settings-service";
import { TableSyncService } from "../src/services/table-sync-service";
import { TableViewController } from "../src/services/table-view-controller";
import { VaultService } from "../src/services/vault-service";
import { DEFAULT_SETTINGS, MarkdownTableData, TableColumn, TableFilterState } from "../src/types";
import { KanbanView } from "../src/ui/kanban-view";
import { NotionTableView } from "../src/ui/table/table-view";
import { TableViewActions } from "../src/ui/table/types";
import { WideModeController } from "../src/ui/wide-mode";
import { installObsidianDomHelpers } from "./helpers/obsidian-dom";

function createActions(overrides: Partial<TableViewActions> = {}): TableViewActions {
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
    ...overrides,
  };
}

function buildColumns(): TableColumn[] {
  return [
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
  ];
}

function mockElementRect(el: HTMLElement, rect: Partial<DOMRect>): void {
  const fullRect: DOMRect = {
    x: rect.left ?? 0,
    y: rect.top ?? 0,
    left: rect.left ?? 0,
    top: rect.top ?? 0,
    right: rect.right ?? (rect.left ?? 0) + (rect.width ?? 0),
    bottom: rect.bottom ?? (rect.top ?? 0) + (rect.height ?? 0),
    width: rect.width ?? 0,
    height: rect.height ?? 0,
    toJSON: () => ({}),
  };
  Object.defineProperty(el, "getBoundingClientRect", {
    configurable: true,
    value: () => fullRect,
  });
}

function mockPaneWidth(pane: HTMLElement, width: number): void {
  Object.defineProperty(pane, "clientWidth", { configurable: true, value: width });
  mockElementRect(pane, { width });
}

function mountReadingPane(host: HTMLElement): HTMLElement {
  const pane = document.createElement("div");
  pane.className = "markdown-preview-view";
  pane.style.paddingLeft = "32px";
  pane.style.paddingRight = "32px";
  mockPaneWidth(pane, 1200);
  pane.appendChild(host);
  document.body.appendChild(pane);
  return pane;
}

describe("Wide mode toggle and layout", () => {
  beforeAll(() => {
    installObsidianDomHelpers(window as Window & typeof globalThis);
  });

  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("should toggle wide mode via toolbar button and Properties menu without altering siblings", async () => {
    const tableData: MarkdownTableData = parseMarkdownTables(
      "| Task | Status |\n| --- | --- |\n| Alpha | Todo |"
    )[0];
    const filterState: TableFilterState = {
      tableId: tableData.id,
      conjunction: "AND",
      rules: [],
      sortRules: [],
      searchQuery: "",
      isFilterOpen: false,
      isSortOpen: false,
    };
    const onWideModeChange = vi.fn(async () => undefined);
    const actions = createActions({ onWideModeChange });

    const sizer = document.createElement("div");
    sizer.className = "markdown-preview-sizer";
    const siblingParagraph = document.createElement("div");
    siblingParagraph.className = "el-p";
    siblingParagraph.textContent = "Original readable paragraph";
    const hostEl = document.createElement("div");
    hostEl.className = "el-table ms-enhanced-table-wrapper";
    mockElementRect(hostEl, { left: 250, width: 700 });
    sizer.append(siblingParagraph, hostEl);
    mountReadingPane(sizer);

    const view = new NotionTableView({
      app: {} as App,
      sourcePath: "note.md",
      tableData,
      columns: buildColumns(),
      filterState,
      settings: { ...DEFAULT_SETTINGS },
      actions,
    });

    const containerEl = view.getElement();
    hostEl.appendChild(containerEl);
    await Promise.resolve();

    expect(view.isWideMode()).toBe(false);
    expect(containerEl.classList.contains("is-wide-mode")).toBe(false);
    expect(containerEl.hasAttribute("data-ms-wide-available")).toBe(true);
    expect(hostEl.classList.contains("ms-wide-mode-host")).toBe(false);

    const toggleBtn = containerEl.querySelector<HTMLButtonElement>(".ms-wide-mode-btn");
    expect(toggleBtn).not.toBeNull();
    expect(toggleBtn?.getAttribute("aria-pressed")).toBe("false");

    toggleBtn?.click();

    expect(view.isWideMode()).toBe(true);
    expect(containerEl.classList.contains("is-wide-mode")).toBe(true);
    expect(hostEl.classList.contains("ms-wide-mode-host")).toBe(true);
    expect(onWideModeChange).toHaveBeenCalledWith(true);
    expect(siblingParagraph.className).toBe("el-p");

    const updatedBtn = containerEl.querySelector<HTMLButtonElement>(".ms-wide-mode-btn");
    expect(updatedBtn?.classList.contains("is-active")).toBe(true);
    expect(updatedBtn?.getAttribute("aria-pressed")).toBe("true");

    // Verify Properties menu shows Wide mode checked and can toggle back to narrow mode.
    const propsBtn = Array.from(containerEl.querySelectorAll<HTMLButtonElement>(".ms-db-action-btn")).find(
      (btn) => btn.textContent?.includes("Properties")
    );
    expect(propsBtn).toBeDefined();
    if (propsBtn) {
      mockElementRect(propsBtn, { left: 100, top: 50, width: 80, height: 28 });
    }
    propsBtn?.click();

    const wideMenuItem = Array.from(document.querySelectorAll<HTMLElement>(".ms-prop-toggle-item")).find(
      (item) => item.textContent?.includes("Wide mode")
    );
    expect(wideMenuItem).toBeDefined();
    expect(wideMenuItem?.classList.contains("is-selected")).toBe(true);

    wideMenuItem?.click();

    expect(view.isWideMode()).toBe(false);
    expect(containerEl.classList.contains("is-wide-mode")).toBe(false);
    expect(hostEl.classList.contains("ms-wide-mode-host")).toBe(false);
    expect(onWideModeChange).toHaveBeenLastCalledWith(false);
    view.dispose();
  });

  it("should preserve and toggle wide mode across Table and Board views", async () => {
    const tableData: MarkdownTableData = parseMarkdownTables(
      "| Task | Status |\n| --- | --- |\n| Alpha | Todo |\n| Beta | Done |"
    )[0];
    const filterState: TableFilterState = {
      tableId: tableData.id,
      conjunction: "AND",
      rules: [],
      sortRules: [],
      searchQuery: "",
      isFilterOpen: false,
      isSortOpen: false,
    };

    const view = new NotionTableView({
      app: {} as App,
      sourcePath: "board.md",
      tableData,
      columns: buildColumns(),
      filterState,
      settings: { ...DEFAULT_SETTINGS },
      actions: createActions(),
    });

    const hostEl = document.createElement("div");
    hostEl.className = "block-language-tablebase";
    mockElementRect(hostEl, { left: 250, width: 700 });
    mountReadingPane(hostEl);
    const containerEl = view.getElement();
    hostEl.appendChild(containerEl);
    await Promise.resolve();

    const tableWideButton = containerEl.querySelector<HTMLButtonElement>(".ms-wide-mode-btn")!;
    tableWideButton.focus();
    tableWideButton.click();
    expect(containerEl.classList.contains("is-wide-mode")).toBe(true);
    expect(document.activeElement).toBe(containerEl.querySelector(".ms-wide-mode-btn"));
    expect(document.activeElement?.getAttribute("aria-label")).toBe("Wide mode");
    expect(document.activeElement?.getAttribute("aria-pressed")).toBe("true");

    view.switchView("board");
    expect(containerEl.classList.contains("is-wide-mode")).toBe(true);

    const boardWideBtn = containerEl.querySelector<HTMLButtonElement>(
      ".ms-kanban-container .ms-wide-mode-btn"
    );
    expect(boardWideBtn).not.toBeNull();
    expect(boardWideBtn?.classList.contains("is-active")).toBe(true);

    boardWideBtn?.focus();
    boardWideBtn?.click();
    expect(document.activeElement).toBe(containerEl.querySelector(".ms-kanban-container .ms-wide-mode-btn"));
    expect(document.activeElement?.getAttribute("aria-pressed")).toBe("false");
    expect(view.isWideMode()).toBe(false);
    expect(containerEl.classList.contains("is-wide-mode")).toBe(false);
    expect(containerEl.querySelector(".ms-kanban-container")).not.toBeNull();
    expect(
      containerEl
        .querySelector<HTMLButtonElement>(".ms-kanban-container .ms-wide-mode-btn")
        ?.classList.contains("is-active")
    ).toBe(false);
    view.dispose();
  });

  it("shows the Table and Board shortcut only when layout can gain room, and keeps Properties available", async () => {
    const style = document.createElement("style");
    style.textContent = readFileSync("styles.css", "utf8");
    document.head.appendChild(style);

    const observed = new Map<Element, () => void>();
    vi.stubGlobal("ResizeObserver", class {
      private readonly targets = new Set<Element>();

      constructor(private readonly callback: () => void) {}

      observe(element: Element): void {
        this.targets.add(element);
        observed.set(element, this.callback);
      }

      disconnect(): void {
        for (const element of this.targets) observed.delete(element);
        this.targets.clear();
      }
    });

    const tableData = parseMarkdownTables("| Task | Status |\n| --- | --- |\n| Alpha | Todo |")[0];
    const view = new NotionTableView({
      app: {} as App,
      sourcePath: "note.md",
      tableData,
      columns: buildColumns(),
      filterState: new TableStateManager().getOrCreateFilterState(tableData.id),
      settings: { ...DEFAULT_SETTINGS },
      actions: createActions(),
    });

    try {
      const host = document.createElement("div");
      mockElementRect(host, { left: 32, width: 1136 });
      const pane = mountReadingPane(host);
      const container = view.getElement();
      host.appendChild(container);
      await vi.waitFor(() => expect(observed.has(pane)).toBe(true));

      const button = () => container.querySelector<HTMLButtonElement>(".ms-wide-mode-btn")!;
      expect(getComputedStyle(button()).display).toBe("none");

      const properties = Array.from(container.querySelectorAll("button")).find(
        (item) => item.textContent?.trim() === "Properties"
      )!;
      mockElementRect(properties, { left: 100, top: 50, width: 80, height: 28 });
      properties.click();
      const option = Array.from(document.querySelectorAll<HTMLElement>(".ms-prop-toggle-item")).find(
        (item) => item.textContent === "Wide mode"
      );
      expect(option).toBeDefined();
      option?.click();
      expect(view.isWideMode()).toBe(true);
      expect(getComputedStyle(button()).display).toBe("none");
      expect(container.style.getPropertyValue("--ms-wide-width")).toBe("");

      mockElementRect(host, { left: 250, width: 700 });
      observed.get(host)?.();
      expect(container.hasAttribute("data-ms-wide-available")).toBe(true);
      expect(getComputedStyle(button()).display).toBe("inline-flex");
      expect(container.style.getPropertyValue("--ms-wide-width")).toBe("1136px");

      view.switchView("board");
      expect(getComputedStyle(button()).display).toBe("inline-flex");
      expect(button().getAttribute("aria-pressed")).toBe("true");
      button().focus();

      mockPaneWidth(pane, 764);
      observed.get(pane)?.();
      expect(getComputedStyle(button()).display).toBe("none");
      expect(document.activeElement).toBe(container);
      expect(view.isWideMode()).toBe(true);
      expect(container.style.getPropertyValue("--ms-wide-width")).toBe("");
      expect(host.classList.contains("ms-wide-mode-host")).toBe(false);

      mockPaneWidth(pane, 1200);
      observed.get(pane)?.();
      expect(getComputedStyle(button()).display).toBe("inline-flex");
      expect(button().getAttribute("aria-pressed")).toBe("true");
    } finally {
      view.dispose();
      style.remove();
      vi.unstubAllGlobals();
    }
  });

  it("should allow toggling wide mode on a standalone KanbanView", () => {
    const tableData: MarkdownTableData = parseMarkdownTables(
      "| Task | Status |\n| --- | --- |\n| Alpha | Todo |"
    )[0];
    const filterState: TableFilterState = {
      tableId: tableData.id,
      conjunction: "AND",
      rules: [],
      sortRules: [],
      searchQuery: "",
      isFilterOpen: false,
      isSortOpen: false,
    };

    const kanban = new KanbanView({
      app: {} as App,
      sourcePath: "standalone.md",
      tableData,
      columns: buildColumns(),
      filterState,
      settings: { ...DEFAULT_SETTINGS },
      actions: createActions(),
      onSwitchView: vi.fn(),
    });

    const el = kanban.getElement();
    document.body.appendChild(el);
    expect(el.classList.contains("is-wide-mode")).toBe(false);

    el.querySelector<HTMLButtonElement>(".ms-wide-mode-btn")?.click();
    expect(el.classList.contains("is-wide-mode")).toBe(true);
    expect(filterState.isWideMode).toBe(true);
  });

  it("should persist wide mode per table via TableViewController and restore after reload", async () => {
    let savedData: Record<string, unknown> = { ...DEFAULT_SETTINGS };
    const settingsService = new SettingsService({
      loadData: async () => savedData,
      saveData: async (next) => {
        savedData = JSON.parse(JSON.stringify(next)) as Record<string, unknown>;
      },
    });
    await settingsService.loadSettings();

    const vaultService = {
      modifyFile: vi.fn(async () => true),
    } as unknown as VaultService;
    const syncService = new TableSyncService(vaultService);

    const tableA = parseMarkdownTables("| Task | Status |\n| --- | --- |\n| A | Todo |")[0];
    const tableB = parseMarkdownTables("| Task | Status |\n| --- | --- |\n| B | Done |")[0];

    const controller1 = new TableViewController(
      {} as App,
      settingsService,
      new TableStateManager(),
      syncService
    );
    const viewA = controller1.createInlineTableView({
      sourcePath: "note.md",
      tableData: tableA,
      startLine: 0,
      tableIndex: 0,
    });
    const viewB = controller1.createInlineTableView({
      sourcePath: "note.md",
      tableData: tableB,
      startLine: 10,
      tableIndex: 1,
    });

    const elA = viewA.getElement();
    const elB = viewB.getElement();
    document.body.append(elA, elB);

    viewA.toggleWideMode();
    await Promise.resolve();

    expect(viewA.tableData.id).not.toBe(viewB.tableData.id);
    expect(viewA.isWideMode()).toBe(true);
    expect(viewB.isWideMode()).toBe(false);
    expect(settingsService.getSettings().tableWideModes).toEqual({
      [viewA.tableData.id]: true,
    });
    await vi.waitFor(() => expect(savedData.tableWideModes).toEqual({ [viewA.tableData.id]: true }));

    // Simulate closing/reopening Obsidian with a brand new SettingsService & TableStateManager.
    const reloadedSettings = new SettingsService({
      loadData: async () => savedData,
      saveData: async (next) => {
        savedData = JSON.parse(JSON.stringify(next)) as Record<string, unknown>;
      },
    });
    await reloadedSettings.loadSettings();

    const controller2 = new TableViewController(
      {} as App,
      reloadedSettings,
      new TableStateManager(),
      syncService
    );
    const reloadedTableA = parseMarkdownTables("| Task | Status |\n| --- | --- |\n| A | Todo |")[0];
    const reloadedTableB = parseMarkdownTables("| Task | Status |\n| --- | --- |\n| B | Done |")[0];
    const reloadedA = controller2.createInlineTableView({
      sourcePath: "note.md",
      tableData: reloadedTableA,
      startLine: 0,
      tableIndex: 0,
    });
    const reloadedB = controller2.createInlineTableView({
      sourcePath: "note.md",
      tableData: reloadedTableB,
      startLine: 10,
      tableIndex: 1,
    });

    expect(reloadedA.getElement().classList.contains("is-wide-mode")).toBe(true);
    expect(reloadedB.getElement().classList.contains("is-wide-mode")).toBe(false);

    // Turning wide mode back off removes it from saved settings.
    reloadedA.toggleWideMode();
    await Promise.resolve();
    expect(reloadedSettings.getSettings().tableWideModes).toEqual({});
  });

  it("should compute wide dimensions for readable-line-width panes, respect cm-gutters, and handle async mount", async () => {
    const pane = document.createElement("div");
    pane.className = "cm-scroller";
    pane.style.paddingLeft = "32px";
    pane.style.paddingRight = "32px";
    Object.defineProperty(pane, "clientWidth", { configurable: true, value: 1200 });
    mockElementRect(pane, { left: 300, width: 1200 });

    const gutter = document.createElement("div");
    gutter.className = "cm-gutters";
    mockElementRect(gutter, { left: 300, width: 48, right: 348 });

    const sizer = document.createElement("div");
    sizer.className = "cm-sizer";
    const hostEl = document.createElement("div");
    hostEl.className = "cm-preview-code-block";
    mockElementRect(hostEl, { left: 550, width: 700 });

    pane.append(gutter, sizer);
    sizer.appendChild(hostEl);
    document.body.appendChild(pane);

    const containerEl = document.createElement("div");
    containerEl.className = "ms-notion-database-container";

    const controller = new WideModeController(containerEl);
    // Sync before mounting containerEl into hostEl (matches processor lifecycle).
    controller.sync(true);
    hostEl.appendChild(containerEl);
    await Promise.resolve();

    expect(hostEl.classList.contains("ms-wide-mode-host")).toBe(true);
    // minLeft = max(300 + 32, 348 + 28) = 376; maxRight = 300 + 1200 - 32 = 1468
    // width = 1468 - 376 = 1092px; offset = 376 - 550 = -174px
    expect(containerEl.style.getPropertyValue("--ms-wide-width")).toBe("1092px");
    expect(containerEl.style.getPropertyValue("--ms-wide-offset-left")).toBe("-174px");

    controller.sync(false);
    expect(hostEl.classList.contains("ms-wide-mode-host")).toBe(false);
    expect(containerEl.style.getPropertyValue("--ms-wide-width")).toBe("");
    expect(containerEl.style.getPropertyValue("--ms-wide-offset-left")).toBe("");
    controller.dispose();
  });

  it("should mark enclosing block wrappers as wide-mode hosts without CSS :has and clean them up safely", () => {
    const pane = document.createElement("div");
    pane.className = "cm-scroller";
    Object.defineProperty(pane, "clientWidth", { configurable: true, value: 1200 });
    mockElementRect(pane, { left: 0, width: 1200 });

    const previewBlock = document.createElement("div");
    previewBlock.className = "cm-preview-code-block";
    const embedBlock = document.createElement("div");
    embedBlock.className = "cm-embed-block";
    const preEl = document.createElement("div");
    preEl.className = "el-pre";
    const innerHostA = document.createElement("div");
    innerHostA.className = "block-language-tablebase";
    const innerHostB = document.createElement("div");
    innerHostB.className = "block-language-tablebase";

    mockElementRect(innerHostA, { left: 200, width: 700 });
    mockElementRect(innerHostB, { left: 200, width: 700 });

    const containerA = document.createElement("div");
    containerA.className = "ms-notion-database-container";
    const containerB = document.createElement("div");
    containerB.className = "ms-notion-database-container";

    innerHostA.appendChild(containerA);
    innerHostB.appendChild(containerB);
    preEl.append(innerHostA, innerHostB);
    embedBlock.appendChild(preEl);
    previewBlock.appendChild(embedBlock);
    pane.appendChild(previewBlock);
    document.body.appendChild(pane);

    const ctrlA = new WideModeController(containerA);
    const ctrlB = new WideModeController(containerB);
    ctrlA.sync(true);
    ctrlB.sync(true);

    expect(pane.classList.contains("ms-wide-mode-host")).toBe(false);
    expect(previewBlock.classList.contains("ms-wide-mode-host")).toBe(true);
    expect(embedBlock.classList.contains("ms-wide-mode-host")).toBe(true);
    expect(preEl.classList.contains("ms-wide-mode-host")).toBe(true);
    expect(innerHostA.classList.contains("ms-wide-mode-host")).toBe(true);
    expect(innerHostB.classList.contains("ms-wide-mode-host")).toBe(true);

    // Turning off one container clears its immediate wrapper while keeping shared wide ancestors.
    ctrlA.sync(false);
    expect(innerHostA.classList.contains("ms-wide-mode-host")).toBe(false);
    expect(preEl.classList.contains("ms-wide-mode-host")).toBe(true);
    expect(embedBlock.classList.contains("ms-wide-mode-host")).toBe(true);
    expect(previewBlock.classList.contains("ms-wide-mode-host")).toBe(true);

    // Disposing the last active wide container removes host classes from all remaining ancestors.
    ctrlB.dispose();
    expect(innerHostB.classList.contains("ms-wide-mode-host")).toBe(false);
    expect(preEl.classList.contains("ms-wide-mode-host")).toBe(false);
    expect(embedBlock.classList.contains("ms-wide-mode-host")).toBe(false);
    expect(previewBlock.classList.contains("ms-wide-mode-host")).toBe(false);

    ctrlA.dispose();
  });
});
