import { App } from "obsidian";
import { parseCellTags } from "../../core/tag-parser";
import { MultiSelectTag, PluginSettings, TagColor } from "../../types";
import { appendIcon, appendIconLabel } from "../../utils/dom";
import { createColorPickerElement } from "../color-picker";
import { ICON_CHECK, ICON_CLEAR, ICON_PALETTE, ICON_PLUS, ICON_SEARCH } from "../icons";
import { mountFloatingPopover } from "../popover";
import { createTagBadge } from "../tag-badge";

export interface SingleSelectPopoverOptions {
  app: App;
  anchorEl: HTMLElement;
  columnName: string;
  currentValue: string;
  allAvailableTags: MultiSelectTag[];
  settings: PluginSettings;
  onSelect: (selectedTag: string) => Promise<void>;
  onTagColorChange?: (tagName: string, color: TagColor) => Promise<void>;
}

const OPTION_ITEM_SELECTOR = ".ms-select-option-item, .ms-create-option-item";

export class SingleSelectPopover {
  private options: SingleSelectPopoverOptions;
  private containerEl: HTMLElement;
  private optionsListEl?: HTMLElement;
  private closePopover?: () => void;
  private searchQuery = "";
  private currentTagName: string;
  private activeColorPickerTagId: string | null = null;
  private selectedNewTagColor: TagColor = "default";
  private isCreatingTagColorPickerOpen = false;

  constructor(options: SingleSelectPopoverOptions) {
    this.options = options;
    const parsed = parseCellTags(options.currentValue, options.settings.customTagColors);
    this.currentTagName = parsed.length > 0 ? parsed[0].name : options.currentValue.trim();

    this.containerEl = createDiv({ cls: "ms-col-header-menu ms-select-popover" });
  }

  public open(): void {
    this.render();
    this.closePopover = mountFloatingPopover({
      anchorEl: this.options.anchorEl,
      popoverEl: this.containerEl,
      className: "ms-select-popover",
      offsetTop: 4,
      positionToSide: true,
      alwaysBelow: true,
    });
  }

  private close(): void {
    if (this.closePopover) {
      this.closePopover();
      return;
    }
    this.containerEl.remove();
  }

  private render(): void {
    this.containerEl.empty();

    const searchWrapper = this.containerEl.createDiv({ cls: "ms-popover-search-wrap" });
    const inputContainer = searchWrapper.createDiv({ cls: "ms-popover-search-input-wrap" });
    appendIcon(inputContainer.createSpan({ cls: "ms-popover-search-icon" }), ICON_SEARCH);

    const searchInput = inputContainer.createEl("input", {
      type: "text",
      cls: "ms-popover-search-input",
      placeholder: "Select an option or type...",
      value: this.searchQuery,
    });

    window.setTimeout(() => searchInput.focus(), 10);

    searchInput.addEventListener("input", (e) => {
      this.searchQuery = (e.target as HTMLInputElement).value;
      this.renderOptionsList();
    });

    searchInput.addEventListener("keydown", (e) => {
      void this.handleSearchKeydown(e);
    });

    this.optionsListEl = this.containerEl.createDiv({ cls: "ms-popover-options-list" });
    this.renderOptionsList();
  }

  private async handleSearchKeydown(e: KeyboardEvent): Promise<void> {
    if (e.key === "Escape") {
      e.preventDefault();
      this.close();
      return;
    }

    const items = Array.from(
      this.containerEl.querySelectorAll<HTMLElement>(OPTION_ITEM_SELECTOR)
    );
    const activeIdx = items.findIndex((el) => el.classList.contains("is-keyboard-active"));

    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (items.length === 0) return;
      items.forEach((el) => el.classList.remove("is-keyboard-active"));

      const nextIdx =
        e.key === "ArrowDown"
          ? activeIdx < items.length - 1
            ? activeIdx + 1
            : 0
          : activeIdx > 0
          ? activeIdx - 1
          : items.length - 1;

      items[nextIdx].classList.add("is-keyboard-active");
      items[nextIdx].scrollIntoView({ block: "nearest" });
      return;
    }

    if (e.key === "Enter") {
      e.preventDefault();
      if (activeIdx >= 0) {
        items[activeIdx].click();
        return;
      }
      const trimmed = this.searchQuery.trim();
      if (trimmed) {
        await this.selectOption(trimmed);
      }
    }
  }

  private renderOptionsList(): void {
    const container = this.optionsListEl;
    if (!container) return;

    container.empty();

    const queryLower = this.searchQuery.trim().toLowerCase();
    const available = this.options.allAvailableTags ?? [];
    const filtered = available.filter((t) => t.name.toLowerCase().includes(queryLower));
    const exactMatch = available.some((t) => t.name.toLowerCase() === queryLower);

    if (filtered.length > 0) {
      container.createDiv({ cls: "ms-menu-section-title", text: "Select an option" });
      for (const tag of filtered) {
        this.renderOptionRow(container, tag);
      }
    }

    if (this.searchQuery.trim() && !exactMatch) {
      this.renderCreateOption(container, this.searchQuery.trim());
    }

    if (!this.currentTagName) return;

    container.createDiv({ cls: "ms-menu-divider" });
    const clearItem = container.createDiv({ cls: "ms-menu-item is-danger" });
    appendIconLabel(clearItem, ICON_CLEAR, "Clear selection");
    clearItem.addEventListener("click", () => {
      void this.selectOption("");
    });
  }

  private renderOptionRow(container: HTMLElement, tag: MultiSelectTag): void {
    const isSelected = tag.name.toLowerCase() === this.currentTagName.toLowerCase();
    const itemWrapper = container.createDiv({ cls: "ms-select-option-wrapper" });
    const itemRow = itemWrapper.createDiv({
      cls: `ms-menu-item ms-select-option-item ${isSelected ? "is-selected" : ""}`,
    });

    const leftArea = itemRow.createDiv({ cls: "ms-select-option-left" });
    leftArea.appendChild(createTagBadge({ tag, clickable: false }));

    const rightArea = itemRow.createDiv({ cls: "ms-select-option-right" });
    if (isSelected) {
      appendIcon(rightArea.createSpan({ cls: "ms-prop-check" }), ICON_CHECK);
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
      this.renderOptionsList();
    });

    itemRow.addEventListener("click", () => {
      void this.selectOption(tag.name);
    });

    if (this.activeColorPickerTagId !== tag.id) return;

    const pickerWrap = itemWrapper.createDiv({ cls: "ms-tag-item-color-picker-wrap" });
    pickerWrap.appendChild(
      createColorPickerElement({
        currentColor: tag.color,
        onSelectColor: async (newColor) => {
          tag.color = newColor;
          this.options.settings.customTagColors[tag.name.toLowerCase()] = newColor;
          await this.options.onTagColorChange?.(tag.name, newColor);
          this.renderOptionsList();
        },
      })
    );
  }

  private renderCreateOption(container: HTMLElement, name: string): void {
    const createWrapper = container.createDiv({ cls: "ms-create-option-wrapper" });
    const createItem = createWrapper.createDiv({
      cls: "ms-menu-item ms-create-option-item",
    });

    const createLeft = createItem.createDiv({ cls: "ms-select-option-left" });
    appendIcon(createLeft.createSpan({ cls: "ms-menu-icon" }), ICON_PLUS);
    const labelWrap = createLeft.createSpan();
    labelWrap.appendText("Create ");
    labelWrap.createEl("strong", { text: `"${name}"` });

    const createRight = createItem.createDiv({ cls: "ms-select-option-right" });
    const createColorBtn = createRight.createSpan({
      cls: "ms-tag-color-btn ms-create-color-btn",
      attr: { title: "Choose color for new tag" },
    });
    appendIcon(createColorBtn, ICON_PALETTE);

    createColorBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      e.preventDefault();
      this.isCreatingTagColorPickerOpen = !this.isCreatingTagColorPickerOpen;
      this.renderOptionsList();
    });

    createItem.addEventListener("click", (e) => {
      void (async () => {
        if (createColorBtn.contains(e.target as Node)) return;
        if (this.selectedNewTagColor !== "default") {
          this.options.settings.customTagColors[name.toLowerCase()] = this.selectedNewTagColor;
          await this.options.onTagColorChange?.(name, this.selectedNewTagColor);
        }
        await this.selectOption(name);
      })();
    });

    if (!this.isCreatingTagColorPickerOpen) return;

    const pickerWrap = createWrapper.createDiv({ cls: "ms-tag-item-color-picker-wrap" });
    pickerWrap.appendChild(
      createColorPickerElement({
        currentColor: this.selectedNewTagColor,
        onSelectColor: (newColor) => {
          this.selectedNewTagColor = newColor;
          this.renderOptionsList();
        },
      })
    );
  }

  private async selectOption(tagName: string): Promise<void> {
    if (tagName && this.selectedNewTagColor !== "default") {
      this.options.settings.customTagColors[tagName.toLowerCase()] = this.selectedNewTagColor;
      await this.options.onTagColorChange?.(tagName, this.selectedNewTagColor);
    }
    await this.options.onSelect(tagName);
    this.close();
  }
}
