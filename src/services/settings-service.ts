import { DEFAULT_SETTINGS, PluginSettings, TagColor } from "../types";

export interface SettingsStorage {
  loadData(): Promise<Record<string, unknown> | null>;
  saveData(data: Record<string, unknown>): Promise<void>;
}

export type SettingsChangeListener = (settings: PluginSettings) => void;

export class SettingsService {
  private settings: PluginSettings = { ...DEFAULT_SETTINGS };
  private listeners: Set<SettingsChangeListener> = new Set();
  private storage: SettingsStorage;
  private pendingSave: Promise<void> = Promise.resolve();

  constructor(storage: SettingsStorage) {
    this.storage = storage;
  }

  public async loadSettings(): Promise<PluginSettings> {
    try {
      const data = await this.storage.loadData();
      this.settings = Object.assign({}, DEFAULT_SETTINGS, data);
      if (Array.isArray(this.settings.multiSelectColumnNames)) {
        const cyrillicPattern = /[\u0400-\u04FF]/;
        this.settings.multiSelectColumnNames = this.settings.multiSelectColumnNames.filter(
          (name) => !cyrillicPattern.test(name)
        );
      }
    } catch {
      this.settings = { ...DEFAULT_SETTINGS };
    }
    this.notifyListeners();
    return this.settings;
  }

  public async saveSettings(): Promise<void> {
    const data = this.settings as unknown as Record<string, unknown>;
    const save = this.pendingSave.then(() => this.storage.saveData(data));
    this.pendingSave = save.catch(() => undefined);
    await save;
    this.notifyListeners();
  }

  public getSettings(): PluginSettings {
    return this.settings;
  }

  public async updateSettings(partial: Partial<PluginSettings>): Promise<void> {
    this.settings = { ...this.settings, ...partial };
    await this.saveSettings();
  }

  public async setTagColor(tagName: string, color: TagColor): Promise<void> {
    const key = tagName.trim().toLowerCase();
    if (!key) return;
    await this.updateSettings({ customTagColors: { ...this.settings.customTagColors, [key]: color } });
  }

  public async removeTagColor(tagName: string): Promise<void> {
    const key = tagName.trim().toLowerCase();
    if (key in this.settings.customTagColors) {
      const customTagColors = { ...this.settings.customTagColors };
      delete customTagColors[key];
      await this.updateSettings({ customTagColors });
    }
  }

  public async resetDefaults(): Promise<void> {
    this.settings = { ...DEFAULT_SETTINGS };
    await this.saveSettings();
  }

  public subscribe(listener: SettingsChangeListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notifyListeners(): void {
    for (const listener of this.listeners) {
      try {
        listener(this.settings);
      } catch { /* listener errors must not break the notification loop */ }
    }
  }
}
