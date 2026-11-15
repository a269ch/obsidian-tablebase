import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import { App } from "obsidian";
import { parseMarkdownTables, serializeMarkdownTable } from "../src/core/markdown-parser";
import { TableStateManager } from "../src/core/table-state";
import { SettingsService } from "../src/services/settings-service";
import { TableSyncService } from "../src/services/table-sync-service";
import { TableViewController } from "../src/services/table-view-controller";
import { VaultService } from "../src/services/vault-service";
import { DEFAULT_SETTINGS, MarkdownTableData } from "../src/types";
import { installObsidianDomHelpers } from "./helpers/obsidian-dom";

describe("TableViewController", () => {
  let app: App;
  let settingsService: SettingsService;
  let stateManager: TableStateManager;
  let syncService: TableSyncService;
  let vaultService: VaultService;
  let controller: TableViewController;

  beforeAll(() => {
    installObsidianDomHelpers(window as Window & typeof globalThis);
  });

  beforeEach(() => {
    document.body.innerHTML = "";
    app = {} as App;
    settingsService = new SettingsService({
      loadData: async () => ({ ...DEFAULT_SETTINGS }),
      saveData: async () => undefined,
    });
    void settingsService.loadSettings();

    stateManager = new TableStateManager();
    vaultService = {
      modifyFile: vi.fn(async (_path: string, transform: (c: string) => string) => {
        transform("");
        return true;
      }),
    } as unknown as VaultService;
    syncService = new TableSyncService(vaultService);
    controller = new TableViewController(app, settingsService, stateManager, syncService);
  });

  it("should create code block view and sync on table modification", async () => {
    const raw = "| Col A | Col B |\n| --- | --- |\n| 1 | 2 |";
    const tableData: MarkdownTableData = parseMarkdownTables(raw)[0];

    const syncSpy = vi.spyOn(syncService, "syncCodeBlock").mockResolvedValue(true);

    const view = controller.createCodeBlockView({
      sourcePath: "note.md",
      tableData,
      initialSource: raw,
      getLineStart: () => 4,
    });

    expect(view).not.toBeNull();
    expect(view.columns).toHaveLength(2);

    await view.actions.onCellUpdate(0, 0, "Updated");
    expect(syncSpy).toHaveBeenCalledWith("note.md", tableData, raw, 4);
    const savedSource = serializeMarkdownTable(tableData);

    await view.actions.onCellUpdate(0, 1, "Again");
    expect(syncSpy).toHaveBeenLastCalledWith("note.md", tableData, savedSource, 4);
  });

  it("should preserve Board group order when rows are reparsed after a move", async () => {
    const first = parseMarkdownTables(
      "| Task | Status |\n| --- | --- |\n| Buy milk | Todo |\n| Read book | Done |"
    )[0];
    controller.createInlineTableView({
      sourcePath: "inline.md",
      tableData: first,
      startLine: 0,
      tableIndex: 0,
    });
    await Promise.resolve();

    const reordered = parseMarkdownTables(
      "| Task | Status |\n| --- | --- |\n| Read book | Done |\n| Buy milk | Todo |"
    )[0];
    const view = controller.createInlineTableView({
      sourcePath: "inline.md",
      tableData: reordered,
      startLine: 0,
      tableIndex: 0,
    });

    expect(view.columns[1].uniqueTags?.map((tag) => tag.name)).toEqual(["Todo", "Done"]);
  });

  it("should restore editor scroll after a file update replaces the view DOM", async () => {
    const leaf = document.createElement("div");
    leaf.className = "workspace-leaf mod-active";
    const scroller = document.createElement("div");
    scroller.className = "cm-scroller";
    leaf.appendChild(scroller);
    scroller.scrollTop = 320;
    scroller.scrollLeft = 18;
    document.body.appendChild(leaf);

    vi.spyOn(syncService, "syncInlineTable").mockImplementation(async () => {
      leaf.empty();
      const replacement = document.createElement("div");
      replacement.className = "cm-scroller";
      leaf.appendChild(replacement);
      replacement.scrollTop = 0;
      replacement.scrollLeft = 0;
    });

    const tableData = parseMarkdownTables(
      "| Task | Status |\n| --- | --- |\n| Buy milk | Todo |"
    )[0];
    const view = controller.createInlineTableView({
      sourcePath: "inline.md",
      tableData,
      startLine: 0,
      tableIndex: 0,
    });

    await view.actions.onCellUpdate(0, 0, "Updated");

    const replacement = leaf.querySelector<HTMLElement>(".cm-scroller");
    expect(replacement?.scrollTop).toBe(320);
    expect(replacement?.scrollLeft).toBe(18);
  });

  it("should retain an empty Board group after its last card moves away", async () => {
    const tableData = parseMarkdownTables(
      "| Task | Status |\n| --- | --- |\n| Buy milk | Todo |\n| Read book | Done |"
    )[0];
    const view = controller.createInlineTableView({
      sourcePath: "inline.md",
      tableData,
      startLine: 0,
      tableIndex: 0,
    });

    await view.actions.onCellUpdate(0, 1, "Done");
    const refreshed = controller.createInlineTableView({
      sourcePath: "inline.md",
      tableData: parseMarkdownTables(
        "| Task | Status |\n| --- | --- |\n| Buy milk | Done |\n| Read book | Done |"
      )[0],
      startLine: 0,
      tableIndex: 0,
    });

    expect(refreshed.columns[1].uniqueTags?.map((tag) => tag.name)).toEqual(["Todo", "Done"]);
  });

  it("should run overlapping code block saves one at a time", async () => {
    const raw = "| Col A | Col B |\n| --- | --- |\n| 1 | 2 |";
    const tableData: MarkdownTableData = parseMarkdownTables(raw)[0];
    const sources: (string | undefined)[] = [];
    let release: () => void = () => {};

    vi.spyOn(syncService, "syncCodeBlock").mockImplementation(async (_path, _data, source) => {
      sources.push(source);
      if (sources.length === 1) await new Promise<void>((resolve) => (release = resolve));
      return true;
    });

    const view = controller.createCodeBlockView({ sourcePath: "note.md", tableData, initialSource: raw });

    const first = view.actions.onCellUpdate(0, 0, "A");
    await Promise.resolve();
    const afterFirst = serializeMarkdownTable(tableData);
    const second = view.actions.onCellUpdate(0, 1, "B");
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(sources).toHaveLength(1);

    release();
    await Promise.all([first, second]);
    expect(sources).toEqual([raw, afterFirst]);
  });

  it("should keep the last saved source when a code block save fails", async () => {
    const raw = "| Col A | Col B |\n| --- | --- |\n| 1 | 2 |";
    const tableData: MarkdownTableData = parseMarkdownTables(raw)[0];

    const syncSpy = vi.spyOn(syncService, "syncCodeBlock").mockResolvedValue(false);

    const view = controller.createCodeBlockView({
      sourcePath: "note.md",
      tableData,
      initialSource: raw,
    });

    await view.actions.onCellUpdate(0, 0, "Updated");
    await view.actions.onCellUpdate(0, 1, "Again");
    expect(syncSpy).toHaveBeenLastCalledWith("note.md", tableData, raw, undefined);
  });

  it("should create inline table view and dispatch all table mutations to syncInlineTable", async () => {
    const raw = "| Task | Status |\n| --- | --- |\n| Buy milk | Todo |";
    const tableData: MarkdownTableData = parseMarkdownTables(raw)[0];

    let capturedTransform: ((content: string) => string) | null = null;
    vi.spyOn(syncService, "syncInlineTable").mockImplementation(async (_path, transform) => {
      capturedTransform = transform;
    });

    const view = controller.createInlineTableView({
      sourcePath: "inline.md",
      tableData,
      startLine: 0,
      tableIndex: 0,
    });

    await view.actions.onCellUpdate(0, 1, "Done");
    expect(capturedTransform).not.toBeNull();
    const resultCell = capturedTransform!(raw);
    expect(resultCell).toContain("Done");

    await view.actions.onAddRow(undefined, ["Read book", "In Progress"]);
    const resultAddRow = capturedTransform!(raw);
    expect(resultAddRow).toContain("Read book");

    await view.actions.onDuplicateRow(0);
    const resultDup = capturedTransform!(raw);
    expect(resultDup).toContain("Buy milk");

    await view.actions.onAddColumn("Priority", "text");
    const resultAddCol = capturedTransform!(raw);
    expect(resultAddCol).toContain("Priority");

    await view.actions.onRenameColumn(0, "Item");
    const resultRename = capturedTransform!(raw);
    expect(resultRename).toContain("Item");

    await view.actions.onColumnAlignmentChange(0, "center");
    const resultAlign = capturedTransform!(raw);
    expect(resultAlign).toMatch(/:--+:/);

    await view.actions.onReorderColumns(0, 1);
    const resultReorderCols = capturedTransform!(raw);
    expect(resultReorderCols).toBeDefined();

    await view.actions.onReorderRows(0, 1);
    const resultReorderRows = capturedTransform!(raw);
    expect(resultReorderRows).toBeDefined();

    await view.actions.onDeleteColumn(1);
    const resultDelCol = capturedTransform!(raw);
    expect(resultDelCol).not.toContain("Status");

    await view.actions.onDeleteRow(0);
    const resultDelRow = capturedTransform!(raw);
    expect(resultDelRow).toBeDefined();
  });

  it("should write both the type annotation and the alignment of a retyped column", async () => {
    const raw = "| Task | Amount |\n| --- | --- |\n| Buy milk | 12 |";
    const tableData: MarkdownTableData = parseMarkdownTables(raw)[0];

    let capturedTransform: ((content: string) => string) | null = null;
    vi.spyOn(syncService, "syncInlineTable").mockImplementation(async (_path, transform) => {
      capturedTransform = transform;
    });

    const view = controller.createInlineTableView({
      sourcePath: "inline.md",
      tableData,
      startLine: 0,
      tableIndex: 0,
    });

    // "Task" holds text, so switching it to number also flips its alignment.
    await view.actions.onColumnTypeChange(0, "number");
    const asNumber = capturedTransform!(raw);
    expect(asNumber).toContain("Task [number]");

    const delimiterCells = asNumber
      .split("\n")[1]
      .split("|")
      .map((cell) => cell.trim())
      .filter((cell) => cell.length > 0);
    expect(delimiterCells[0].endsWith(":")).toBe(true);

    // Switching to text has to be written down too, otherwise the numeric
    // values would make the column detect itself as a number again.
    await view.actions.onColumnTypeChange(1, "text");
    expect(capturedTransform!(asNumber)).toContain("Amount [text]");
  });


  it("should keep the cell selection when the view is rebuilt for the same table", () => {
    const raw = "| Task | Status |\n| --- | --- |\n| Buy milk | Todo |\n| Write docs | Done |";
    const tableData: MarkdownTableData = parseMarkdownTables(raw)[0];
    const params = { sourcePath: "inline.md", tableData, startLine: 0, tableIndex: 0 };

    const view = controller.createInlineTableView(params);
    view.getElement();
    view.selection.focusCell(1, 1);
    view.applySelection();
    view.dispose();

    // Every write makes Obsidian re-render the section and build a new view.
    const rebuilt = controller.createInlineTableView(params);
    expect(rebuilt.selection.isCellFocused(1, 1)).toBe(true);

    rebuilt.clearFocus();
    const afterClear = controller.createInlineTableView(params);
    expect(afterClear.selection.isEmpty()).toBe(true);
  });


  it("should write the chosen calculation into the column header", async () => {
    const raw = "| Task | Hours |\n| --- | --- |\n| Buy milk | 12 |\n| Write docs | 7 |";
    const tableData: MarkdownTableData = parseMarkdownTables(raw)[0];

    let capturedTransform: ((content: string) => string) | null = null;
    vi.spyOn(syncService, "syncInlineTable").mockImplementation(async (_path, transform) => {
      capturedTransform = transform;
    });

    const view = controller.createInlineTableView({
      sourcePath: "inline.md",
      tableData,
      startLine: 0,
      tableIndex: 0,
    });

    await view.actions.onColumnCalculationChange(1, "sum");
    const withSum = capturedTransform!(raw);
    expect(withSum).toContain("Hours [number:sum]");
    expect(view.columns[1].calculation).toBe("sum");

    await view.actions.onColumnCalculationChange(1, "none");
    expect(capturedTransform!(withSum)).not.toContain(":sum");
  });

  it("should isolate column widths and sort rules between files with identical tables (#23 / #24 / #25.3)", async () => {
    const raw = "| Task | Status |\n| --- | --- |\n| Alpha | Todo |\n| Beta | Done |";
    const tableA = parseMarkdownTables(raw)[0];
    const tableB = parseMarkdownTables(raw)[0];

    const viewA = controller.createInlineTableView({
      sourcePath: "notes/a.md",
      tableData: tableA,
      startLine: 0,
      tableIndex: 0,
    });
    const viewB = controller.createInlineTableView({
      sourcePath: "notes/b.md",
      tableData: tableB,
      startLine: 0,
      tableIndex: 0,
    });

    expect(viewA.tableData.id).not.toBe(viewB.tableData.id);

    await viewA.actions.onColumnResize?.({ 0: 260 });
    viewA.actions.onSortChange([{ column: "Task", columnIndex: 0, direction: "desc" }]);
    await new Promise((r) => setTimeout(r, 0));

    const rebuiltA = controller.createInlineTableView({
      sourcePath: "notes/a.md",
      tableData: parseMarkdownTables(raw)[0],
      startLine: 0,
      tableIndex: 0,
    });
    const rebuiltB = controller.createInlineTableView({
      sourcePath: "notes/b.md",
      tableData: parseMarkdownTables(raw)[0],
      startLine: 0,
      tableIndex: 0,
    });

    expect(rebuiltA.columns[0].width).toBe(260);
    expect(rebuiltA.filterState.sortRules).toEqual([
      { column: "Task", columnIndex: 0, direction: "desc" },
    ]);
    expect(rebuiltB.columns[0].width).toBeUndefined();
    expect(rebuiltB.filterState.sortRules).toEqual([]);
  });

  it("should persist tableSortRules across fresh TableStateManager and clear on unsort", async () => {
    const raw = "| Task | Count |\n| --- | --- |\n| B | 2 |\n| A | 1 |";
    const view = controller.createInlineTableView({
      sourcePath: "notes/sort.md",
      tableData: parseMarkdownTables(raw)[0],
      startLine: 2,
      tableIndex: 0,
    });

    view.actions.onSortChange([{ column: "Task", columnIndex: 0, direction: "asc" }]);
    await new Promise((r) => setTimeout(r, 0));

    expect(settingsService.getSettings().tableSortRules?.[view.tableData.id]).toEqual([
      { column: "Task", columnIndex: 0, direction: "asc" },
    ]);

    // Simulate Obsidian restart: fresh TableStateManager, settings kept.
    const freshController = new TableViewController(
      app,
      settingsService,
      new TableStateManager(),
      syncService
    );
    const restored = freshController.createInlineTableView({
      sourcePath: "notes/sort.md",
      tableData: parseMarkdownTables(`${raw}\n| C | 3 |`)[0],
      startLine: 8,
      tableIndex: 0,
    });

    expect(restored.tableData.id).toBe(view.tableData.id);
    expect(restored.filterState.sortRules).toEqual([
      { column: "Task", columnIndex: 0, direction: "asc" },
    ]);

    restored.actions.onSortChange([]);
    await new Promise((r) => setTimeout(r, 0));
    expect(settingsService.getSettings().tableSortRules?.[view.tableData.id]).toBeUndefined();
  });

  it("should rebindTableId to the mounted occurrence and load its widths and sort rules", async () => {
    const raw = "| Task | Status |\n| --- | --- |\n| Item | Todo |";
    const { buildStableTableId } = await import("../src/core/table-id");
    const firstId = buildStableTableId({
      sourcePath: "notes/multi.md",
      headers: ["Task", "Status"],
      occurrence: 0,
    });
    const secondId = buildStableTableId({
      sourcePath: "notes/multi.md",
      headers: ["Task", "Status"],
      occurrence: 1,
    });

    await settingsService.updateSettings({
      tableColumnWidths: { [secondId]: { 1: 195 } },
      tableSortRules: { [secondId]: [{ column: "Task", columnIndex: 0, direction: "desc" }] },
    });

    const view = controller.createCodeBlockView({
      sourcePath: "notes/multi.md",
      tableData: parseMarkdownTables(raw)[0],
      initialSource: raw,
    });
    expect(view.tableData.id).toBe(firstId);
    expect(view.columns[1].width).toBeUndefined();
    expect(view.filterState.sortRules).toEqual([]);

    controller.rebindTableId(view, secondId);

    expect(view.tableData.id).toBe(secondId);
    expect(view.columns[1].width).toBe(195);
    expect(view.filterState.sortRules).toEqual([
      { column: "Task", columnIndex: 0, direction: "desc" },
    ]);
  });

  it("should migrate table widths, group orders, and sort rules when a column is renamed", async () => {
    const raw = "| Task | Status |\n| --- | --- |\n| Alpha | Todo |\n| Beta | Done |";
    vi.spyOn(syncService, "syncInlineTable").mockResolvedValue(undefined);

    const view = controller.createInlineTableView({
      sourcePath: "notes/rename.md",
      tableData: parseMarkdownTables(raw)[0],
      startLine: 0,
      tableIndex: 0,
    });
    const oldId = view.tableData.id;

    await view.actions.onColumnResize?.({ 1: 210 });
    view.actions.onSortChange([{ column: "Task", columnIndex: 0, direction: "asc" }]);
    await new Promise((r) => setTimeout(r, 0));

    await view.actions.onRenameColumn(1, "Stage");
    await new Promise((r) => setTimeout(r, 0));

    const newId = view.tableData.id;
    expect(newId).not.toBe(oldId);

    const latest = settingsService.getSettings();
    expect(latest.tableColumnWidths[oldId]).toBeUndefined();
    expect(latest.tableColumnWidths[newId]).toEqual({ 1: 210 });
    expect(latest.tableSortRules?.[oldId]).toBeUndefined();
    expect(latest.tableSortRules?.[newId]).toEqual([
      { column: "Task", columnIndex: 0, direction: "asc" },
    ]);
    expect(latest.tableBoardGroupOrders?.[oldId]).toBeUndefined();
    expect(latest.tableBoardGroupOrders?.[newId]).toBeDefined();
  });

  it("should re-render sorted table when a checkbox cell is toggled", async () => {
    const raw = "| Task | Done |\n| --- | --- |\n| First | [ ] |\n| Second | [ ] |";
    vi.spyOn(syncService, "syncInlineTable").mockResolvedValue(undefined);

    const view = controller.createInlineTableView({
      sourcePath: "notes/checks.md",
      tableData: parseMarkdownTables(raw)[0],
      startLine: 0,
      tableIndex: 0,
    });

    view.actions.onSortChange([{ column: "Done", columnIndex: 1, direction: "desc" }]);
    const el = view.getElement();
    document.body.appendChild(el);

    const checkboxes = el.querySelectorAll<HTMLInputElement>("input[type='checkbox']");
    expect(checkboxes).toHaveLength(2);
    checkboxes[1].checked = true;
    checkboxes[1].dispatchEvent(new Event("change", { bubbles: true }));

    await new Promise((r) => setTimeout(r, 10));

    const renderedTitles = Array.from(
      el.querySelectorAll<HTMLElement>('tbody tr td[data-col-index="0"]')
    ).map((td) => td.textContent?.trim());
    // "Second" was checked (`[x]`), so sorting Done desc puts it first.
    expect(renderedTitles[0]).toBe("Second");
  });

});
