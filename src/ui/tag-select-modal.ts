import { App, Modal } from "obsidian";
import { COLOR_LIST, TAG_PALETTE_COLORS, resolveTagColor } from "../core/color-palette";
import { formatTagsToCell, parseCellTags } from "../core/tag-parser";
import { TagColor, MultiSelectTag, PluginSettings } from "../types";
import { createTagBadge } from "./tag-badge";
import { ICON_CHECK } from "./icons";

export interface TagSelectModalOptions {
  app: App;
  settings: PluginSettings;
  columnName: string;
  currentValue: string;
  allAvailableTags: MultiSelectTag[];
  onSave: (formattedCellText: string, tags: MultiSelectTag[]) => void;
  onTagColorChange?: (tagName: string, color: TagColor) => void;
}

export class TagSelectModal extends Modal {
  private options: TagSelectModalOptions;
  private selectedTags: MultiSelectTag[] = [];
  private searchQuery: string = "";
  private selectedNewColor: TagColor = "default";
  private searchInputEl?: HTMLInputElement;

  constructor(options: TagSelectModalOptions) {
    super(options.app);
    this.options = options;
    this.selectedTags = parseCellTags(options.currentValue, options.settings.customTagColors);
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("ms-tag-modal-container");

    this.renderUI();
  }

  private renderUI(): void {
    const { contentEl } = this;
    contentEl.empty();

    // Header
    const headerEl = contentEl.createDiv({ cls: "ms-modal-header" });
    headerEl.createEl("h3", { text: `Edit "${this.options.columnName}"` });

    // Selected Tags Pills Area
    const selectedArea = contentEl.createDiv({ cls: "ms-selected-tags-area" });
    if (this.selectedTags.length === 0) {
      selectedArea.createEl("span", {
        cls: "ms-empty-placeholder",
        text: "No tags selected. Select below or type to add new.",
      });
    } else {
      for (const tag of this.selectedTags) {
        const badge = createTagBadge({
          tag,
          removable: true,
          onRemove: (t) => {
            this.selectedTags = this.selectedTags.filter((item) => item.id !== t.id);
            this.renderUI();
          },
        });
        selectedArea.appendChild(badge);
      }
    }

    // Search / Create Input
    const searchContainer = contentEl.createDiv({ cls: "ms-search-container" });
    this.searchInputEl = searchContainer.createEl("input", {
      type: "text",
      cls: "ms-search-input",
      placeholder: "Search or create tag...",
      value: this.searchQuery,
    });

    setTimeout(() => {
      this.searchInputEl?.focus();
    }, 10);

    this.searchInputEl.addEventListener("input", (e) => {
      this.searchQuery = (e.target as HTMLInputElement).value;
      this.renderAvailableList(listContainer, createSection);
    });

    this.searchInputEl.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        const trimmed = this.searchQuery.trim();
        if (trimmed) {
          this.addNewTag(trimmed);
        }
      }
    });

    // List of existing tags
    const listContainer = contentEl.createDiv({ cls: "ms-tag-list-container" });
    const createSection = contentEl.createDiv({ cls: "ms-create-tag-section" });

    this.renderAvailableList(listContainer, createSection);

    // Modal Actions (Save & Cancel)
    const footerEl = contentEl.createDiv({ cls: "ms-modal-footer" });
    
    const saveBtn = footerEl.createEl("button", {
      text: "Apply Changes",
      cls: "mod-cta",
    });
    saveBtn.addEventListener("click", () => {
      const formatted = formatTagsToCell(
        this.selectedTags,
        this.options.settings.defaultTagFormat
      );
      this.options.onSave(formatted, this.selectedTags);
      this.close();
    });

    const cancelBtn = footerEl.createEl("button", {
      text: "Cancel",
      cls: "mod-warning",
    });
    cancelBtn.addEventListener("click", () => this.close());
  }

  private renderAvailableList(
    container: HTMLElement,
    createContainer: HTMLElement
  ): void {
    container.empty();
    createContainer.empty();

    const query = this.searchQuery.trim().toLowerCase();
    const existingTags = this.options.allAvailableTags || [];

    const filtered = existingTags.filter((t) =>
      t.name.toLowerCase().includes(query)
    );

    if (filtered.length > 0) {
      container.createEl("div", {
        cls: "ms-section-title",
        text: "Select an option",
      });

      for (const tag of filtered) {
        const isSelected = this.selectedTags.some((t) => t.id === tag.id);
        const itemRow = container.createDiv({
          cls: `ms-tag-item-row ${isSelected ? "is-selected" : ""}`,
        });

        const badge = createTagBadge({
          tag,
          clickable: false,
        });
        itemRow.appendChild(badge);

        if (isSelected) {
          const checkIcon = itemRow.createSpan({ cls: "ms-check-icon" });
          checkIcon.innerHTML = ICON_CHECK;
        }

        itemRow.addEventListener("click", () => {
          if (isSelected) {
            this.selectedTags = this.selectedTags.filter((t) => t.id !== tag.id);
          } else {
            this.selectedTags.push(tag);
          }
          this.renderUI();
        });
      }
    }

    // Create New Tag Section
    const trimmedQuery = this.searchQuery.trim();
    const exactMatch = existingTags.some(
      (t) => t.name.toLowerCase() === query
    );

    if (trimmedQuery && !exactMatch) {
      createContainer.createEl("div", {
        cls: "ms-section-title",
        text: `Create new option: "${trimmedQuery}"`,
      });

      // Color picker
      const colorPickerRow = createContainer.createDiv({
        cls: "ms-color-picker-row",
      });

      for (const color of COLOR_LIST) {
        const colorDot = colorPickerRow.createSpan({
          cls: `ms-color-dot ms-color-${color} ${
            this.selectedNewColor === color ? "is-active" : ""
          }`,
          title: color,
        });
        const scheme = TAG_PALETTE_COLORS[color];
        colorDot.style.backgroundColor = scheme.bg;
        colorDot.style.borderColor = scheme.text;

        colorDot.addEventListener("click", () => {
          this.selectedNewColor = color;
          this.renderAvailableList(container, createContainer);
        });
      }

      const createBtn = createContainer.createEl("button", {
        cls: "ms-create-btn",
        text: `+ Create "${trimmedQuery}" with ${this.selectedNewColor} color`,
      });

      createBtn.addEventListener("click", () => {
        this.addNewTag(trimmedQuery);
      });
    }
  }

  private addNewTag(tagName: string): void {
    const id = tagName.toLowerCase();

    // Check if tag already exists in available tags to reuse color & casing
    const existing = this.options.allAvailableTags?.find(
      (t) => t.id === id
    );

    const name = existing ? existing.name : tagName;
    const color = existing
      ? existing.color
      : this.selectedNewColor !== "default"
      ? this.selectedNewColor
      : resolveTagColor(tagName, this.options.settings.customTagColors);

    const newTag: MultiSelectTag = {
      id,
      name,
      color,
    };

    if (!this.selectedTags.some((t) => t.id === id)) {
      this.selectedTags.push(newTag);
    }

    if (this.options.onTagColorChange && this.selectedNewColor !== "default" && !existing) {
      this.options.onTagColorChange(tagName, color);
    }

    this.searchQuery = "";
    this.renderUI();
  }

  onClose(): void {
    const { contentEl } = this;
    contentEl.empty();
  }
}
