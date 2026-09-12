import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import { App } from "obsidian";
import { parseMarkdownTables } from "../src/core/markdown-parser";
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

    const syncSpy = vi.spyOn(syncService, "syncCodeBlock").mockResolvedValue();

    const view = controller.createCodeBlockView({
      sourcePath: "note.md",
      tableData,
      initialSource: raw,
    });

    expect(view).not.toBeNull();
    expect(view.columns).toHaveLength(2);

    await view.actions.onCellUpdate(0, 0, "Updated");
    expect(syncSpy).toHaveBeenCalledWith("note.md", tableData, raw);
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

});
