import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import * as obsidian from "obsidian";
import { App, Plugin } from "obsidian";
import { SettingsService } from "../src/services/settings-service";
import { TableBaseSettingTab } from "../src/ui/settings-tab";
import { installObsidianDomHelpers } from "./helpers/obsidian-dom";

describe("TableBaseSettingTab", () => {
  beforeAll(() => {
    installObsidianDomHelpers(window as Window & typeof globalThis);
  });

  beforeEach(() => {
    document.body.innerHTML = "";
  });

  function createMockPlugin(): Plugin {
    let storedData: unknown = null;
    return {
      loadData: vi.fn(async () => storedData),
      saveData: vi.fn(async (data: unknown) => {
        storedData = data;
      }),
    } as unknown as Plugin;
  }

  it("should render all settings sections on display", async () => {
    const plugin = createMockPlugin();
    const settingsService = new SettingsService(plugin);
    await settingsService.loadSettings();

    const tab = new TableBaseSettingTab({} as App, plugin, settingsService);
    tab.display();

    const headings = Array.from(
      tab.containerEl.querySelectorAll<HTMLElement>(".setting-item-heading .setting-item-name")
    ).map((el) => el.textContent?.trim());

    expect(headings).toContain("Column detection");
    expect(headings).toContain("Tag and date formatting");
    expect(headings).toContain("Appearance");
    expect(headings).toContain("Custom tag colors");
    expect(headings).toContain("Reset settings");
  });

  it("should update autoDetectMultiSelect when toggle is clicked", async () => {
    const plugin = createMockPlugin();
    const settingsService = new SettingsService(plugin);
    await settingsService.loadSettings();

    const tab = new TableBaseSettingTab({} as App, plugin, settingsService);
    tab.display();

    const toggles = tab.containerEl.querySelectorAll<HTMLElement>(".checkbox-container");
    expect(toggles.length).toBeGreaterThan(0);

    const autoDetectToggle = toggles[1];
    autoDetectToggle.click();

    expect(settingsService.getSettings().autoDetectMultiSelect).toBe(false);
  });

  it("should update autoConvertMarkdownTables when its toggle is clicked", async () => {
    const plugin = createMockPlugin();
    const settingsService = new SettingsService(plugin);
    await settingsService.loadSettings();

    const tab = new TableBaseSettingTab({} as App, plugin, settingsService);
    tab.display();

    const toggles = tab.containerEl.querySelectorAll<HTMLElement>(".checkbox-container");
    toggles[0].click();

    expect(settingsService.getSettings().autoConvertMarkdownTables).toBe(false);
  });

  it("should update multiSelectColumnNames when textarea changes", async () => {
    const plugin = createMockPlugin();
    const settingsService = new SettingsService(plugin);
    await settingsService.loadSettings();

    const tab = new TableBaseSettingTab({} as App, plugin, settingsService);
    tab.display();

    const textarea = tab.containerEl.querySelector<HTMLTextAreaElement>("textarea");
    expect(textarea).not.toBeNull();

    if (textarea) {
      textarea.value = "Status, Milestone, Sprint";
      textarea.dispatchEvent(new Event("input", { bubbles: true }));
    }

    const updated = settingsService.getSettings().multiSelectColumnNames;
    expect(updated).toEqual(["Status", "Milestone", "Sprint"]);
  });

  it("should update defaultTagFormat when dropdown changes", async () => {
    const plugin = createMockPlugin();
    const settingsService = new SettingsService(plugin);
    await settingsService.loadSettings();

    const tab = new TableBaseSettingTab({} as App, plugin, settingsService);
    tab.display();

    const dropdowns = tab.containerEl.querySelectorAll<HTMLSelectElement>("select");
    expect(dropdowns.length).toBeGreaterThan(1);

    const tagFormatSelect = dropdowns[0];
    tagFormatSelect.value = "wikilink";
    tagFormatSelect.dispatchEvent(new Event("change", { bubbles: true }));

    expect(settingsService.getSettings().defaultTagFormat).toBe("wikilink");
  });

  it("should update showRowNumbers when appearance toggle is clicked", async () => {
    const plugin = createMockPlugin();
    const settingsService = new SettingsService(plugin);
    await settingsService.loadSettings();

    const tab = new TableBaseSettingTab({} as App, plugin, settingsService);
    tab.display();

    const toggles = tab.containerEl.querySelectorAll<HTMLElement>(".checkbox-container");
    const rowNumberToggle = toggles[2];
    expect(rowNumberToggle).toBeDefined();

    rowNumberToggle.click();
    expect(settingsService.getSettings().showRowNumbers).toBe(true);
  });

  it("should add and remove custom tag colors", async () => {
    const plugin = createMockPlugin();
    const settingsService = new SettingsService(plugin);
    await settingsService.loadSettings();

    const tab = new TableBaseSettingTab({} as App, plugin, settingsService);
    tab.display();

    const textInputs = tab.containerEl.querySelectorAll<HTMLInputElement>("input[type='text']");
    const addInput = Array.from(textInputs).find(
      (i) => i.placeholder === "e.g. In Progress, High, Bug..."
    );
    expect(addInput).toBeDefined();

    if (addInput) {
      addInput.value = "In Progress";
      addInput.dispatchEvent(new Event("input", { bubbles: true }));
    }

    const addBtn = Array.from(
      tab.containerEl.querySelectorAll<HTMLButtonElement>("button")
    ).find((b) => b.textContent === "Add");
    expect(addBtn).toBeDefined();

    addBtn?.click();
    await new Promise((r) => setTimeout(r, 10));

    expect(settingsService.getSettings().customTagColors["in progress"]).toBeDefined();

    const trashBtn = tab.containerEl.querySelector<HTMLElement>(
      ".setting-item [data-icon='trash']"
    );
    expect(trashBtn).not.toBeNull();
    trashBtn?.click();
    await new Promise((r) => setTimeout(r, 10));

    expect(settingsService.getSettings().customTagColors["in progress"]).toBeUndefined();
  });

  it("should restore defaults on reset button click", async () => {
    const plugin = createMockPlugin();
    const settingsService = new SettingsService(plugin);
    await settingsService.loadSettings();
    await settingsService.updateSettings({ showRowNumbers: true, defaultTagFormat: "hashtag" });

    const tab = new TableBaseSettingTab({} as App, plugin, settingsService);
    tab.display();

    const resetBtn = Array.from(
      tab.containerEl.querySelectorAll<HTMLButtonElement>("button")
    ).find((b) => b.textContent === "Reset to defaults");
    expect(resetBtn).toBeDefined();

    resetBtn?.click();

    expect(settingsService.getSettings().showRowNumbers).toBe(false);
    expect(settingsService.getSettings().defaultTagFormat).toBe("comma");
  });

  it("should expose Custom tag colors as an interactive SettingPage definition for Obsidian 1.13+ (#25.4)", async () => {
    const plugin = createMockPlugin();
    const settingsService = new SettingsService(plugin);
    await settingsService.loadSettings();

    const tab = new TableBaseSettingTab({} as App, plugin, settingsService);
    const mockUpdate = vi.fn();
    (tab as unknown as { update: () => void }).update = mockUpdate;

    const defs = tab.getSettingDefinitions();
    const customColorsDef = defs.find(
      (item): item is Extract<(typeof defs)[number], { type: "page" }> =>
        "type" in item && item.type === "page" && item.name === "Custom tag colors"
    );

    expect(customColorsDef).toBeDefined();
    expect(typeof customColorsDef?.page).toBe("function");
    expect(
      typeof (typeof customColorsDef?.displayValue === "function"
        ? customColorsDef.displayValue()
        : customColorsDef?.displayValue)
    ).toBe("string");

    const page = customColorsDef!.page!();
    page.display();
    expect(page.title).toBe("Custom tag colors");

    const input = page.containerEl.querySelector<HTMLInputElement>("input[type='text']");
    expect(input).not.toBeNull();
    if (input) {
      input.value = "Blocked";
      input.dispatchEvent(new Event("input", { bubbles: true }));
    }

    const addBtn = Array.from(page.containerEl.querySelectorAll<HTMLButtonElement>("button")).find(
      (b) => b.textContent === "Add"
    );
    expect(addBtn).toBeDefined();
    addBtn?.click();
    await new Promise((r) => setTimeout(r, 10));

    expect(settingsService.getSettings().customTagColors["blocked"]).toBeDefined();
    expect(mockUpdate).toHaveBeenCalled();
    expect(tab.containerEl.querySelectorAll(".setting-item")).toHaveLength(0);

    const trashBtn = page.containerEl.querySelector<HTMLElement>(
      ".setting-item [data-icon='trash']"
    );
    expect(trashBtn).not.toBeNull();
    trashBtn?.click();
    await new Promise((r) => setTimeout(r, 10));

    expect(settingsService.getSettings().customTagColors["blocked"]).toBeUndefined();

    // Reset action should call update() without clobbering declarative DOM via legacy display.
    mockUpdate.mockClear();
    const resetDef = defs.find(
      (item): item is (typeof defs)[number] & { action: () => void } =>
        "action" in item && typeof item.action === "function"
    );
    expect(resetDef).toBeDefined();
    resetDef?.action();
    await new Promise((r) => setTimeout(r, 10));

    expect(mockUpdate).toHaveBeenCalledTimes(1);
    expect(tab.containerEl.querySelectorAll(".setting-item")).toHaveLength(0);
  });

  it("should expose and update showBoardView in Appearance and declarative definitions (#25.1)", async () => {
    const plugin = createMockPlugin();
    const settingsService = new SettingsService(plugin);
    await settingsService.loadSettings();

    expect(settingsService.getSettings().showBoardView).toBe(true);

    const tab = new TableBaseSettingTab({} as App, plugin, settingsService);
    tab.display();

    const boardSettingItem = Array.from(
      tab.containerEl.querySelectorAll<HTMLElement>(".setting-item")
    ).find(
      (item) => item.querySelector(".setting-item-name")?.textContent?.trim() === "Show Board view"
    );
    expect(boardSettingItem).toBeDefined();

    const toggle = boardSettingItem?.querySelector<HTMLElement>(".checkbox-container");
    expect(toggle).not.toBeNull();
    toggle?.click();
    expect(settingsService.getSettings().showBoardView).toBe(false);

    const defs = tab.getSettingDefinitions();
    const boardDef = defs.find(
      (item) => "control" in item && item.control && "key" in item.control && item.control.key === "showBoardView"
    );
    expect(boardDef).toBeDefined();
    expect(tab.getControlValue("showBoardView")).toBe(false);
    await tab.setControlValue("showBoardView", true);
    expect(settingsService.getSettings().showBoardView).toBe(true);
  });

  it("should guard Custom tag colors SettingPage creation behind requireApiVersion 1.13.0", async () => {
    const plugin = createMockPlugin();
    const settingsService = new SettingsService(plugin);
    await settingsService.loadSettings();

    const spy = vi.spyOn(obsidian, "requireApiVersion").mockReturnValue(false);
    try {
      const tab = new TableBaseSettingTab({} as App, plugin, settingsService);
      const defs = tab.getSettingDefinitions();
      const customColorsDef = defs.find(
        (item): item is Extract<(typeof defs)[number], { type: "page" }> =>
          "type" in item && item.type === "page" && item.name === "Custom tag colors"
      );
      expect(customColorsDef).toBeDefined();
      expect(() => customColorsDef!.page!()).toThrow("1.13.0");
    } finally {
      spy.mockRestore();
    }
  });
});
