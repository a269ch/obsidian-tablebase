import { App, Plugin, PluginSettingTab, Setting, SettingDefinitionItem } from "obsidian";
import { DATE_FORMAT_OPTIONS } from "../core/date-utils";
import { SettingsService } from "../services/settings-service";
import { DateFormatOption, TagColor, TagFormat } from "../types";
import { createColorPickerElement } from "./color-picker";
import { createTagBadge } from "./tag-badge";

export class TableBaseSettingTab extends PluginSettingTab {
  private settingsService: SettingsService;

  constructor(app: App, plugin: Plugin, settingsService: SettingsService) {
    super(app, plugin);
    this.settingsService = settingsService;
  }

  override getSettingDefinitions(): SettingDefinitionItem[] {
    const dateOptions: Record<string, string> = {};
    for (const option of DATE_FORMAT_OPTIONS) {
      dateOptions[option.format] = `${option.label} (${option.example})`;
    }

    return [
      {
        name: "Auto-detect multi-select columns",
        desc: "Automatically detect multi-select columns by analyzing cell values (lists, wikilinks, tags).",
        control: {
          type: "toggle",
          key: "autoDetectMultiSelect",
        },
      },
      {
        name: "Multi-select column names",
        desc: "Comma-separated column header keywords to always treat as multi-select.",
        control: {
          type: "textarea",
          key: "multiSelectColumnNames",
          placeholder: "Tags, Status, Categories, Labels, Priority...",
        },
      },
      {
        name: "Default tag format",
        desc: "Format used when writing multi-select tags back to Markdown cells.",
        control: {
          type: "dropdown",
          key: "defaultTagFormat",
          options: {
            comma: "Comma-separated (Frontend, UI, Bug)",
            wikilink: "Wikilinks ([[Frontend]], [[UI]])",
            hashtag: "Hashtags (#Frontend #UI)",
          },
        },
      },
      {
        name: "Default date format",
        desc: "Format used when displaying and entering dates in date columns.",
        control: {
          type: "dropdown",
          key: "dateFormat",
          options: dateOptions,
        },
      },
      {
        name: "Show row numbers",
        desc: "Display a leading column with row numbers in database tables.",
        control: {
          type: "toggle",
          key: "showRowNumbers",
        },
      },
      {
        name: "Custom tag colors",
        desc: "Customize colors for specific tags. These override automatic colors across all tables and boards.",
      },
      {
        name: "Restore default settings",
        desc: "Reset all plugin settings back to default values.",
        action: () => {
          void this.settingsService.resetDefaults().then(() => {
            this.refresh();
          });
        },
      },
    ];
  }

  override getControlValue(key: string): unknown {
    const settings = this.settingsService.getSettings() as unknown as Record<string, unknown>;
    if (key === "multiSelectColumnNames") {
      const names = settings.multiSelectColumnNames;
      return Array.isArray(names) ? names.join(", ") : "";
    }
    return settings[key];
  }

  override async setControlValue(key: string, value: unknown): Promise<void> {
    if (key === "multiSelectColumnNames") {
      const names =
        typeof value === "string"
          ? value
              .split(",")
              .map((name) => name.trim())
              .filter((name) => name.length > 0)
          : [];
      await this.settingsService.updateSettings({ multiSelectColumnNames: names });
      return;
    }
    await this.settingsService.updateSettings({ [key]: value });
  }

  override display(): void {
    this.refresh();
  }

  private refresh(): void {
    if ("update" in this && typeof (this as unknown as { update?: () => void }).update === "function") {
      (this as unknown as { update: () => void }).update();
    }
    const { containerEl } = this;
    containerEl.empty();

    this.renderColumnDetection(containerEl);
    this.renderFormatting(containerEl);
    this.renderAppearance(containerEl);
    this.renderCustomTagColors(containerEl);
    this.renderReset(containerEl);
  }

  private addHeading(containerEl: HTMLElement, title: string): void {
    new Setting(containerEl).setName(title).setHeading();
  }

  private renderColumnDetection(containerEl: HTMLElement): void {
    const settings = this.settingsService.getSettings();
    this.addHeading(containerEl, "Column detection");

    new Setting(containerEl)
      .setName("Auto-detect multi-select columns")
      .setDesc(
        "Automatically detect multi-select columns by analyzing cell values (lists, wikilinks, tags)."
      )
      .addToggle((toggle) =>
        toggle
          .setValue(settings.autoDetectMultiSelect)
          .onChange(async (value) => {
            await this.settingsService.updateSettings({ autoDetectMultiSelect: value });
          })
      );

    new Setting(containerEl)
      .setName("Multi-select column names")
      .setDesc("Comma-separated column header keywords to always treat as multi-select.")
      .addTextArea((text) =>
        text
          .setPlaceholder("Tags, Status, Categories, Labels, Priority...")
          .setValue(settings.multiSelectColumnNames.join(", "))
          .onChange(async (value) => {
            const names = value
              .split(",")
              .map((name) => name.trim())
              .filter((name) => name.length > 0);
            await this.settingsService.updateSettings({ multiSelectColumnNames: names });
          })
      );
  }

  private renderFormatting(containerEl: HTMLElement): void {
    const settings = this.settingsService.getSettings();
    this.addHeading(containerEl, "Tag and date formatting");

    new Setting(containerEl)
      .setName("Default tag format")
      .setDesc("Format used when writing multi-select tags back to Markdown cells.")
      .addDropdown((dropdown) =>
        dropdown
          .addOption("comma", "Comma-separated (Frontend, UI, Bug)")
          .addOption("wikilink", "Wikilinks ([[Frontend]], [[UI]])")
          .addOption("hashtag", "Hashtags (#Frontend #UI)")
          .setValue(settings.defaultTagFormat)
          .onChange(async (value) => {
            await this.settingsService.updateSettings({
              defaultTagFormat: value as TagFormat,
            });
          })
      );

    new Setting(containerEl)
      .setName("Default date format")
      .setDesc("Format used when displaying and entering dates in date columns.")
      .addDropdown((dropdown) => {
        for (const option of DATE_FORMAT_OPTIONS) {
          dropdown.addOption(option.format, `${option.label} (${option.example})`);
        }
        dropdown
          .setValue(settings.dateFormat ?? "YYYY-MM-DD")
          .onChange(async (value) => {
            await this.settingsService.updateSettings({
              dateFormat: value as DateFormatOption,
            });
          });
      });
  }

  private renderAppearance(containerEl: HTMLElement): void {
    const settings = this.settingsService.getSettings();
    this.addHeading(containerEl, "Appearance");

    new Setting(containerEl)
      .setName("Show row numbers")
      .setDesc("Display a leading column with row numbers in database tables.")
      .addToggle((toggle) =>
        toggle
          .setValue(settings.showRowNumbers ?? false)
          .onChange(async (value) => {
            await this.settingsService.updateSettings({ showRowNumbers: value });
          })
      );
  }

  private renderCustomTagColors(containerEl: HTMLElement): void {
    const settings = this.settingsService.getSettings();
    this.addHeading(containerEl, "Custom tag colors");

    containerEl.createEl("p", {
      cls: "setting-item-description",
      text: "Customize colors for specific tags. These override automatic colors across all tables and boards.",
    });

    const customColors = settings.customTagColors ?? {};
    const tagEntries = Object.entries(customColors);
    const colorsContainer = containerEl.createDiv({ cls: "ms-settings-tag-colors-list" });

    if (tagEntries.length === 0) {
      colorsContainer.createDiv({
        cls: "ms-settings-empty-notice",
        text: "No custom tag colors configured yet. Choose colors directly from table or board dropdowns, or add one below.",
      });
    } else {
      for (const [tagKey, colorValue] of tagEntries) {
        this.renderTagColorRow(colorsContainer, tagKey, colorValue);
      }
    }

    this.renderAddTagColor(containerEl);
  }

  private renderTagColorRow(
    container: HTMLElement,
    tagKey: string,
    colorValue: TagColor
  ): void {
    const setting = new Setting(container);

    setting.nameEl.appendChild(
      createTagBadge({
        tag: { id: tagKey, name: tagKey, color: colorValue },
        clickable: false,
      })
    );

    setting.controlEl.appendChild(
      createColorPickerElement({
        currentColor: colorValue,
        onSelectColor: async (newColor) => {
          await this.settingsService.setTagColor(tagKey, newColor);
          this.refresh();
        },
      })
    );

    setting.addExtraButton((btn) =>
      btn
        .setIcon("trash")
        .setTooltip("Reset to automatic color")
        .onClick(async () => {
          await this.settingsService.removeTagColor(tagKey);
          this.refresh();
        })
    );
  }

  private renderAddTagColor(containerEl: HTMLElement): void {
    let newTagName = "";
    let newTagColor: TagColor = "blue";

    const setting = new Setting(containerEl)
      .setName("Add custom tag color")
      .setDesc("Assign a preset palette color or custom hex color to a tag name.")
      .addText((text) =>
        text.setPlaceholder("e.g. In Progress, High, Bug...").onChange((value) => {
          newTagName = value;
        })
      );

    setting.controlEl.appendChild(
      createColorPickerElement({
        currentColor: newTagColor,
        onSelectColor: (color) => {
          newTagColor = color;
        },
      })
    );

    setting.addButton((btn) =>
      btn
        .setButtonText("Add")
        .setCta()
        .onClick(async () => {
          const trimmed = newTagName.trim();
          if (!trimmed) return;
          await this.settingsService.setTagColor(trimmed, newTagColor);
          this.refresh();
        })
    );
  }

  private renderReset(containerEl: HTMLElement): void {
    this.addHeading(containerEl, "Reset settings");

    new Setting(containerEl)
      .setName("Restore default settings")
      .setDesc("Reset all plugin settings back to default values.")
      .addButton((btn) => {
        btn.setButtonText("Reset to defaults");
        const destBtn = btn as unknown as { setDestructive?: () => void };
        if (typeof destBtn.setDestructive === "function") {
          destBtn.setDestructive();
        } else {
          btn.setClass("mod-warning");
        }
        btn.onClick(async () => {
          await this.settingsService.resetDefaults();
          this.refresh();
        });
      });
  }
}
