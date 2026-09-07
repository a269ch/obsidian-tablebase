import { describe, it, expect, vi } from "vitest";
import { SettingsService, SettingsStorage } from "../src/services/settings-service";
import { DEFAULT_SETTINGS } from "../src/types";

describe("SettingsService", () => {
  const createMockStorage = (initialData: Record<string, unknown> | null = null): SettingsStorage => {
    let store = initialData ? { ...initialData } : null;
    return {
      loadData: vi.fn(async () => (store ? { ...store } : null)),
      saveData: vi.fn(async (data: Record<string, unknown>) => {
        store = { ...data };
      }),
    };
  };

  it("should initialize with default settings and load stored overrides", async () => {
    const storage = createMockStorage({
      defaultTagFormat: "wikilink",
      showRowNumbers: true,
    });
    const service = new SettingsService(storage);

    const loaded = await service.loadSettings();
    expect(loaded.defaultTagFormat).toBe("wikilink");
    expect(loaded.showRowNumbers).toBe(true);
    expect(loaded.autoDetectMultiSelect).toBe(DEFAULT_SETTINGS.autoDetectMultiSelect);
    expect(storage.loadData).toHaveBeenCalledOnce();
  });

  it("should gracefully handle storage load failures by using defaults", async () => {
    const storage: SettingsStorage = {
      loadData: vi.fn(async () => {
        throw new Error("Disk read failure");
      }),
      saveData: vi.fn(async () => {}),
    };
    const service = new SettingsService(storage);

    const loaded = await service.loadSettings();
    expect(loaded).toEqual(DEFAULT_SETTINGS);
  });

  it("should update partial settings and notify subscribers", async () => {
    const storage = createMockStorage();
    const service = new SettingsService(storage);
    const listener = vi.fn();
    const unsubscribe = service.subscribe(listener);

    await service.updateSettings({ stickyFirstColumn: false });
    expect(service.getSettings().stickyFirstColumn).toBe(false);
    expect(listener).toHaveBeenCalledWith(
      expect.objectContaining({ stickyFirstColumn: false })
    );

    unsubscribe();
    await service.updateSettings({ stickyFirstColumn: true });
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("should add, update, and remove custom tag colors with lowercased keys", async () => {
    const storage = createMockStorage();
    const service = new SettingsService(storage);

    await service.setTagColor("Urgent", "red");
    expect(service.getSettings().customTagColors["urgent"]).toBe("red");

    await service.setTagColor("Frontend", "#3b82f6");
    expect(service.getSettings().customTagColors["frontend"]).toBe("#3b82f6");

    await service.removeTagColor("URGENT");
    expect(service.getSettings().customTagColors["urgent"]).toBeUndefined();
    expect(service.getSettings().customTagColors["frontend"]).toBe("#3b82f6");
  });

  it("should reset settings to factory defaults", async () => {
    const storage = createMockStorage({ defaultTagFormat: "hashtag", showRowNumbers: true });
    const service = new SettingsService(storage);
    await service.loadSettings();

    await service.resetDefaults();
    expect(service.getSettings()).toEqual(DEFAULT_SETTINGS);
  });

  it("should filter out legacy non-English column names on load", async () => {
    const storage = createMockStorage({
      multiSelectColumnNames: ["Tags", "Status", "\u0422\u0435\u0433\u0438"],
    });
    const service = new SettingsService(storage);
    const loaded = await service.loadSettings();

    expect(loaded.multiSelectColumnNames).toEqual(["Tags", "Status"]);
  });
});
