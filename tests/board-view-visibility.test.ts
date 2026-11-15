import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import { App } from "obsidian";
import { parseMarkdownTables } from "../src/core/markdown-parser";
import { TableStateManager } from "../src/core/table-state";
import { SettingsService } from "../src/services/settings-service";
import { TableSyncService } from "../src/services/table-sync-service";
import { TableViewController } from "../src/services/table-view-controller";
import { VaultService } from "../src/services/vault-service";
import { installObsidianDomHelpers } from "./helpers/obsidian-dom";

function createTestHarness(initialData: Record<string, unknown> | null = null) {
  let savedData: Record<string, unknown> | null = initialData ? { ...initialData } : null;
  const settingsService = new SettingsService({
    loadData: async () => savedData,
    saveData: async (next) => {
      savedData = JSON.parse(JSON.stringify(next)) as Record<string, unknown>;
    },
  });

  const modifyFile = vi.fn(async () => true);
  const vaultService = { modifyFile } as unknown as VaultService;
  const syncService = new TableSyncService(vaultService);

  const createController = (): TableViewController =>
    new TableViewController({} as App, settingsService, new TableStateManager(), syncService);

  const reload = async (): Promise<{
    settingsService: SettingsService;
    createController: () => TableViewController;
  }> => {
    const freshSettings = new SettingsService({
      loadData: async () => savedData,
      saveData: async (next) => {
        savedData = JSON.parse(JSON.stringify(next)) as Record<string, unknown>;
      },
    });
    await freshSettings.loadSettings();
    return {
      settingsService: freshSettings,
      createController: () =>
        new TableViewController({} as App, freshSettings, new TableStateManager(), syncService),
    };
  };

  return { settingsService, syncService, createController, reload };
}

function clickPropertiesOption(containerEl: HTMLElement, optionLabel: string): void {
  const propsBtn = Array.from(
    containerEl.querySelectorAll<HTMLButtonElement>(".ms-db-action-btn")
  ).find((btn) => btn.textContent?.includes("Properties"));
  expect(propsBtn).toBeDefined();
  if (propsBtn) {
    Object.defineProperty(propsBtn, "getBoundingClientRect", {
      configurable: true,
      value: () => ({
        x: 100,
        y: 50,
        left: 100,
        top: 50,
        right: 180,
        bottom: 78,
        width: 80,
        height: 28,
        toJSON: () => ({}),
      }),
    });
  }
  propsBtn?.click();

  const optionItem = Array.from(document.querySelectorAll<HTMLElement>(".ms-prop-toggle-item")).find(
    (item) => item.textContent?.includes(optionLabel)
  );
  expect(optionItem).toBeDefined();
  optionItem?.click();
}

describe("Board view visibility in Properties and Settings", () => {
  beforeAll(() => {
    installObsidianDomHelpers(window as Window & typeof globalThis);
  });

  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("should hide the entire Table/Board switcher when disabled per-table in Properties and persist across reload", async () => {
    const harness = createTestHarness();
    await harness.settingsService.loadSettings();

    const controller = harness.createController();
    const rawA = "| Task | Status |\n| --- | --- |\n| Alpha | Todo |";
    const rawB = "| Task | Status |\n| --- | --- |\n| Beta | Done |";

    const viewA = controller.createInlineTableView({
      sourcePath: "note.md",
      tableData: parseMarkdownTables(rawA)[0],
      startLine: 0,
      tableIndex: 0,
    });
    const viewB = controller.createInlineTableView({
      sourcePath: "note.md",
      tableData: parseMarkdownTables(rawB)[0],
      startLine: 10,
      tableIndex: 1,
    });

    const elA = viewA.getElement();
    const elB = viewB.getElement();
    document.body.append(elA, elB);

    expect(elA.querySelector(".ms-db-header-left")).not.toBeNull();
    expect(elA.querySelectorAll(".ms-db-view-tab-btn")).toHaveLength(2);
    expect(elB.querySelectorAll(".ms-db-view-tab-btn")).toHaveLength(2);

    clickPropertiesOption(elA, "Board view");
    await Promise.resolve();

    expect(viewA.isBoardViewVisible()).toBe(false);
    expect(elA.querySelector(".ms-db-header-left")).toBeNull();
    expect(elA.querySelectorAll(".ms-db-view-tab-btn")).toHaveLength(0);
    expect(elA.querySelector(".ms-db-header-right")).not.toBeNull();
    expect(elB.querySelector(".ms-db-header-left")).not.toBeNull();
    expect(elB.querySelectorAll(".ms-db-view-tab-btn")).toHaveLength(2);
    expect(harness.settingsService.getSettings().tableBoardViews).toEqual({
      [viewA.tableData.id]: false,
    });

    // Reload Obsidian with fresh SettingsService & TableStateManager.
    const reloaded = await harness.reload();
    const controller2 = reloaded.createController();
    const reloadedA = controller2.createInlineTableView({
      sourcePath: "note.md",
      tableData: parseMarkdownTables(rawA)[0],
      startLine: 0,
      tableIndex: 0,
    });
    const reloadedB = controller2.createInlineTableView({
      sourcePath: "note.md",
      tableData: parseMarkdownTables(rawB)[0],
      startLine: 10,
      tableIndex: 1,
    });

    const reloadedElA = reloadedA.getElement();
    const reloadedElB = reloadedB.getElement();
    document.body.append(reloadedElA, reloadedElB);

    expect(reloadedA.isBoardViewVisible()).toBe(false);
    expect(reloadedElA.querySelector(".ms-db-header-left")).toBeNull();
    expect(reloadedElA.querySelectorAll(".ms-db-view-tab-btn")).toHaveLength(0);
    expect(reloadedElB.querySelectorAll(".ms-db-view-tab-btn")).toHaveLength(2);

    // Turning Board view back on removes the override entry matching global default.
    clickPropertiesOption(reloadedElA, "Board view");
    await Promise.resolve();

    expect(reloadedA.isBoardViewVisible()).toBe(true);
    expect(reloadedElA.querySelector(".ms-db-header-left")).not.toBeNull();
    expect(reloadedElA.querySelectorAll(".ms-db-view-tab-btn")).toHaveLength(2);
    expect(reloaded.settingsService.getSettings().tableBoardViews).toEqual({});
  });

  it("should respect global showBoardView=false, allow per-table re-enabling in Properties, and exit active Board view", async () => {
    const harness = createTestHarness({ showBoardView: false });
    await harness.settingsService.loadSettings();

    const controller = harness.createController();
    const raw = "| Task | Status |\n| --- | --- |\n| Alpha | Todo |";
    const view = controller.createInlineTableView({
      sourcePath: "note.md",
      tableData: parseMarkdownTables(raw)[0],
      startLine: 0,
      tableIndex: 0,
    });

    const el = view.getElement();
    document.body.appendChild(el);

    expect(view.isBoardViewVisible()).toBe(false);
    expect(el.querySelector(".ms-db-header-left")).toBeNull();

    // Direct attempts to switch to board while hidden are ignored.
    view.switchView("board");
    expect(view.filterState.viewType).toBe("table");
    expect(el.querySelector(".ms-kanban-board-wrapper")).toBeNull();

    // Re-enable per-table in Properties -> restores Table | Board group and allows Board view.
    clickPropertiesOption(el, "Board view");
    await Promise.resolve();

    expect(view.isBoardViewVisible()).toBe(true);
    expect(el.querySelector(".ms-db-header-left")).not.toBeNull();
    expect(el.querySelectorAll(".ms-db-view-tab-btn")).toHaveLength(2);
    expect(harness.settingsService.getSettings().tableBoardViews).toEqual({
      [view.tableData.id]: true,
    });

    // Switch into Board mode.
    el.querySelector<HTMLButtonElement>(".ms-db-view-tab-btn:not(.is-active)")?.click();
    expect(view.filterState.viewType).toBe("board");
    expect(el.querySelector(".ms-kanban-board-wrapper")).not.toBeNull();

    // Remove per-table override and turn global showBoardView off -> active Board switches back to Table.
    // Remove per-table override and turn global showBoardView off -> active Board switches back to Table.
    await harness.settingsService.updateSettings({
      showBoardView: false,
      tableBoardViews: {},
    });

    expect(view.isBoardViewVisible()).toBe(false);
    expect(view.filterState.viewType).toBe("table");
    expect(el.querySelector(".ms-kanban-board-wrapper")).toBeNull();
    expect(el.querySelector(".ms-db-header-left")).toBeNull();
  });

  it("should migrate tableBoardViews when a column is renamed", async () => {
    const harness = createTestHarness();
    await harness.settingsService.loadSettings();
    vi.spyOn(harness.syncService, "syncInlineTable").mockResolvedValue(undefined);

    const controller = harness.createController();
    const raw = "| Task | Status |\n| --- | --- |\n| Alpha | Todo |";
    const view = controller.createInlineTableView({
      sourcePath: "notes/rename-board.md",
      tableData: parseMarkdownTables(raw)[0],
      startLine: 0,
      tableIndex: 0,
    });
    const oldId = view.tableData.id;

    const el = view.getElement();
    document.body.appendChild(el);
    clickPropertiesOption(el, "Board view");
    await Promise.resolve();

    await view.actions.onRenameColumn(1, "Stage");
    await Promise.resolve();

    const newId = view.tableData.id;
    expect(newId).not.toBe(oldId);
    const latest = harness.settingsService.getSettings();
    expect(latest.tableBoardViews[oldId]).toBeUndefined();
    expect(latest.tableBoardViews[newId]).toBe(false);
  });
});
