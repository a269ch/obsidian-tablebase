import { App, Modal } from "obsidian";
import { resolveTagColor } from "../../core/color-palette";
import { formatTagsToCell, parseCellTags } from "../../core/tag-parser";
import { MultiSelectTag, PluginSettings, TagColor } from "../../types";
import { appendIcon } from "../../utils/dom";
import { createColorPickerElement } from "../color-picker";
import { ICON_CHECK, ICON_PALETTE } from "../icons";
import { createTagBadge } from "../tag-badge";

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
  private selectedTags: MultiSelectTag[];
  private searchQuery = "";
  private selectedNewColor: TagColor = "default";
  private activeColorPickerTagId: string | null = null;
  private listContainerEl?: HTMLElement;
  private createContainerEl?: HTMLElement;

  constructor(options: TagSelectModalOptions) {
    super(options.app);
    this.options = options;
    this.selectedTags = parseCellTags(options.currentValue, options.settings.customTagColors);
  }

  override onOpen(): void {
    this.contentEl.addClass("ms-tag-modal-container");
    this.renderUI();
  }

  private renderUI(): void {
    const { contentEl } = this;
    contentEl.empty();

    const headerEl = contentEl.createDiv({ cls: "ms-modal-header" });
    headerEl.createEl("h3", { text: `Edit "${this.options.columnName}"` });

    this.renderSelectedTags(contentEl.createDiv({ cls: "ms-selected-tags-area" }));

    const searchContainer = contentEl.createDiv({ cls: "ms-search-container" });
    const searchInput = searchContainer.createEl("input", {
      type: "text",
      cls: "ms-search-input",
      placeholder: "Search or create tag...",
      value: this.searchQuery,
    });

    window.setTimeout(() => searchInput.focus(), 10);

    searchInput.addEventListener("input", (e) => {
      this.searchQuery = (e.target as HTMLInputElement).value;
      this.renderAvailableList();
    });

    searchInput.addEventListener("keydown", (e) => {
      if (e.key !== "Enter") return;
      e.preventDefault();
      const trimmed = this.searchQuery.trim();
      if (trimmed) {
        this.addNewTag(trimmed);
      }
    });

    this.listContainerEl = contentEl.createDiv({ cls: "ms-tag-list-container" });
    this.createContainerEl = contentEl.createDiv({ cls: "ms-create-tag-section" });
    this.renderAvailableList();

    const footerEl = contentEl.createDiv({ cls: "ms-modal-footer" });

    const saveBtn = footerEl.createEl("button", { text: "Apply Changes", cls: "mod-cta" });
    saveBtn.addEventListener("click", () => {
      const formatted = formatTagsToCell(
        this.selectedTags,
        this.options.settings.defaultTagFormat
      );
      this.options.onSave(formatted, this.selectedTags);
      this.close();
    });

    const cancelBtn = footerEl.createEl("button", { text: "Cancel", cls: "mod-warning" });
    cancelBtn.addEventListener("click", () => this.close());
  }

  private renderSelectedTags(container: HTMLElement): void {
    if (this.selectedTags.length === 0) {
      container.createSpan({
        cls: "ms-empty-placeholder",
        text: "No tags selected. Select below or type to add new.",
      });
      return;
    }

    for (const tag of this.selectedTags) {
      container.appendChild(
        createTagBadge({
          tag,
          removable: true,
          onRemove: (removed) => {
            this.selectedTags = this.selectedTags.filter((item) => item.id !== removed.id);
            this.renderUI();
          },
        })
      );
    }
  }

  private renderAvailableList(): void {
    const container = this.listContainerEl;
    const createContainer = this.createContainerEl;
    if (!container || !createContainer) return;

    container.empty();
    createContainer.empty();

    const query = this.searchQuery.trim().toLowerCase();
    const existingTags = this.options.allAvailableTags ?? [];
    const filtered = existingTags.filter((t) => t.name.toLowerCase().includes(query));

    if (filtered.length > 0) {
      container.createDiv({ cls: "ms-section-title", text: "Select an option" });

      for (const tag of filtered) {
        this.renderTagRow(container, tag);
      }
    }

    const trimmedQuery = this.searchQuery.trim();
    const exactMatch = existingTags.some((t) => t.name.toLowerCase() === query);
    if (trimmedQuery && !exactMatch) {
      this.renderCreateSection(createContainer, trimmedQuery);
    }
  }

  private renderTagRow(container: HTMLElement, tag: MultiSelectTag): void {
    const isSelected = this.selectedTags.some((t) => t.id === tag.id);
    const itemWrapper = container.createDiv({ cls: "ms-tag-item-wrapper" });
    const itemRow = itemWrapper.createDiv({
      cls: `ms-tag-item-row ${isSelected ? "is-selected" : ""}`,
    });

    const leftArea = itemRow.createDiv({ cls: "ms-select-option-left" });
    leftArea.appendChild(createTagBadge({ tag, clickable: false }));

    const rightArea = itemRow.createDiv({ cls: "ms-select-option-right" });
    if (isSelected) {
      appendIcon(rightArea.createSpan({ cls: "ms-check-icon" }), ICON_CHECK);
    }

    const colorBtn = rightArea.createSpan({
      cls: "ms-tag-color-btn",
      attr: { title: "Change tag color" },
    });
    appendIcon(colorBtn, ICON_PALETTE);
    colorBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      e.preventDefault();
      this.activeColorPickerTagId =
        this.activeColorPickerTagId === tag.id ? null : tag.id;
      this.renderAvailableList();
    });

    itemRow.addEventListener("click", () => {
      this.selectedTags = isSelected
        ? this.selectedTags.filter((t) => t.id !== tag.id)
        : [...this.selectedTags, tag];
      this.renderUI();
    });

    if (this.activeColorPickerTagId !== tag.id) return;

    const pickerWrap = itemWrapper.createDiv({ cls: "ms-tag-item-color-picker-wrap" });
    pickerWrap.appendChild(
      createColorPickerElement({
        currentColor: tag.color,
        onSelectColor: (newColor) => {
          tag.color = newColor;
          this.options.settings.customTagColors[tag.id] = newColor;
          const inSelected = this.selectedTags.find((t) => t.id === tag.id);
          if (inSelected) {
            inSelected.color = newColor;
          }
          this.options.onTagColorChange?.(tag.name, newColor);
          this.renderUI();
        },
      })
    );
  }

  private renderCreateSection(container: HTMLElement, query: string): void {
    container.createDiv({
      cls: "ms-section-title",
      text: `Create new option: "${query}"`,
    });

    container.appendChild(
      createColorPickerElement({
        currentColor: this.selectedNewColor,
        onSelectColor: (newColor) => {
          this.selectedNewColor = newColor;
          this.renderAvailableList();
        },
      })
    );

    const colorLabel = this.selectedNewColor !== "default" ? ` (${this.selectedNewColor})` : "";
    const createBtn = container.createEl("button", {
      cls: "ms-create-btn",
      text: `+ Create "${query}"${colorLabel}`,
    });
    createBtn.addEventListener("click", () => this.addNewTag(query));
  }

  private addNewTag(tagName: string): void {
    const id = tagName.toLowerCase();
    const existing = this.options.allAvailableTags?.find((t) => t.id === id);
    const name = existing ? existing.name : tagName;
    const hasExplicitColor = this.selectedNewColor !== "default";

    let color: TagColor;
    if (existing) {
      color = existing.color;
    } else if (hasExplicitColor) {
      color = this.selectedNewColor;
    } else {
      color = resolveTagColor(tagName, this.options.settings.customTagColors);
    }

    if (!this.selectedTags.some((t) => t.id === id)) {
      this.selectedTags.push({ id, name, color });
    }

    if (hasExplicitColor || !existing) {
      if (hasExplicitColor) {
        this.options.settings.customTagColors[id] = this.selectedNewColor;
      }
      this.options.onTagColorChange?.(name, color);
    }

    this.searchQuery = "";
    this.renderUI();
  }

  override onClose(): void {
    this.contentEl.empty();
  }
}
