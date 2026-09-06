import { App, Plugin, PluginSettingTab, Setting } from "obsidian";
import { DEFAULT_SETTINGS, PluginSettings, TagFormat, DateFormatOption } from "../types";
import { DATE_FORMAT_OPTIONS } from "../core/date-utils";

export interface SettingsPlugin extends Plugin {
  settings: PluginSettings;
  saveSettings: () => Promise<void>;
}

export class TableBaseSettingTab extends PluginSettingTab {
  private plugin: SettingsPlugin;

  constructor(app: App, plugin: SettingsPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    containerEl.createEl("h2", {
      text: "TableBase Settings",
    });

    // Column Detection Settings
    containerEl.createEl("h3", { text: "Column Detection" });

    new Setting(containerEl)
      .setName("Auto-detect Multi-select Columns")
      .setDesc(
        "Automatically detect multi-select columns by analyzing cell values (lists, wikilinks, tags)."
      )
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.autoDetectMultiSelect)
          .onChange(async (value) => {
            this.plugin.settings.autoDetectMultiSelect = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Multi-select Column Names")
      .setDesc(
        "Comma-separated list of column header keywords to always treat as multi-select."
      )
      .addTextArea((text) =>
        text
          .setPlaceholder("Tags, Status, Categories, Теги, Метки...")
          .setValue(this.plugin.settings.multiSelectColumnNames.join(", "))
          .onChange(async (value) => {
            this.plugin.settings.multiSelectColumnNames = value
              .split(",")
              .map((s) => s.trim())
              .filter((s) => s.length > 0);
            await this.plugin.saveSettings();
          })
      );

    // Tag & Date Formatting
    containerEl.createEl("h3", { text: "Tag & Date Formatting" });

    new Setting(containerEl)
      .setName("Default Tag Format")
      .setDesc("Format used when writing multi-select tags back to Markdown cells.")
      .addDropdown((dropdown) =>
        dropdown
          .addOption("comma", "Comma-separated (Frontend, UI, Bug)")
          .addOption("wikilink", "Wikilinks ([[Frontend]], [[UI]])")
          .addOption("hashtag", "Hashtags (#Frontend #UI)")
          .setValue(this.plugin.settings.defaultTagFormat)
          .onChange(async (value) => {
            this.plugin.settings.defaultTagFormat = value as TagFormat;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Default Date Format")
      .setDesc("Format used when displaying and entering dates in date columns.")
      .addDropdown((dropdown) => {
        DATE_FORMAT_OPTIONS.forEach((opt) => {
          dropdown.addOption(opt.format, `${opt.label} (${opt.example})`);
        });
        dropdown
          .setValue(this.plugin.settings.dateFormat || "YYYY-MM-DD")
          .onChange(async (value) => {
            this.plugin.settings.dateFormat = value as DateFormatOption;
            await this.plugin.saveSettings();
          });
      });

    // Filter & Appearance
    containerEl.createEl("h3", { text: "Toolbar & Appearance" });

    new Setting(containerEl)
      .setName("Enable Live Filtering")
      .setDesc("Filter table rows instantly in real-time as filter criteria change.")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.enableLiveFiltering)
          .onChange(async (value) => {
            this.plugin.settings.enableLiveFiltering = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Show Filter Toolbar on Hover Only")
      .setDesc("Keep the table header clean and show the filter bar only when hovering over the table.")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.showFilterButtonOnHoverOnly)
          .onChange(async (value) => {
            this.plugin.settings.showFilterButtonOnHoverOnly = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Show Row Numbers")
      .setDesc("Display leading column with row numbers (#) in database tables.")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.showRowNumbers ?? false)
          .onChange(async (value) => {
            this.plugin.settings.showRowNumbers = value;
            await this.plugin.saveSettings();
          })
      );

    // Reset Defaults
    containerEl.createEl("h3", { text: "Reset Settings" });

    new Setting(containerEl)
      .setName("Restore Default Settings")
      .setDesc("Reset all plugin settings back to default values.")
      .addButton((btn) =>
        btn
          .setButtonText("Reset to Defaults")
          .setWarning()
          .onClick(async () => {
            this.plugin.settings = { ...DEFAULT_SETTINGS };
            await this.plugin.saveSettings();
            this.display();
          })
      );
  }
}

export { TableBaseSettingTab as MultiSelectSettingTab };
