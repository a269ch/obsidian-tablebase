import { App } from "obsidian";
import { parseCellTags } from "../core/tag-parser";
import { MultiSelectTag, PluginSettings } from "../types";
import { createTagBadge } from "./tag-badge";

import { mountFloatingPopover } from "./popover-utils";
import { ICON_CHECK, ICON_CLEAR, ICON_PLUS, ICON_SEARCH } from "./icons";

export interface SingleSelectPopoverOptions {
  app: App;
  anchorEl: HTMLElement;
  columnName: string;
  currentValue: string;
  allAvailableTags: MultiSelectTag[];
  settings: PluginSettings;
  onSelect: (selectedTag: string) => Promise<void>;
}

export class SingleSelectPopover {
  private options: SingleSelectPopoverOptions;
  private containerEl: HTMLElement;
  private closePopover?: () => void;
  private searchQuery: string = "";
  private currentTagName: string = "";

  constructor(options: SingleSelectPopoverOptions) {
    this.options = options;
    const parsed = parseCellTags(options.currentValue, options.settings.customTagColors);
    this.currentTagName = parsed.length > 0 ? parsed[0].name : options.currentValue.trim();

    this.containerEl = document.createElement("div");
    this.containerEl.className = "ms-col-header-menu ms-select-popover";
  }

  public open(): void {
    this.render();
    this.closePopover = mountFloatingPopover({
      anchorEl: this.options.anchorEl,
      popoverEl: this.containerEl,
      className: "ms-select-popover",
      offsetTop: 4,
    });
  }

  private render(): void {
    this.containerEl.empty();

    // 1. Search / Create input at the top
    const searchWrapper = this.containerEl.createDiv({ cls: "ms-popover-search-wrap" });
    const searchIcon = searchWrapper.createSpan({ cls: "ms-popover-search-icon" });
    searchIcon.innerHTML = ICON_SEARCH;
    const searchInput = searchWrapper.createEl("input", {
      type: "text",
      cls: "ms-popover-search-input",
      placeholder: "Select an option or type...",
      value: this.searchQuery,
    });

    setTimeout(() => searchInput.focus(), 10);

    searchInput.addEventListener("input", (e) => {
      this.searchQuery = (e.target as HTMLInputElement).value;
      this.renderOptionsList(optionsListContainer);
    });

    searchInput.addEventListener("keydown", async (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        if (this.closePopover) {
          this.closePopover();
        } else {
          this.containerEl.remove();
        }
        return;
      }

      const items = Array.from(this.containerEl.querySelectorAll<HTMLElement>(".ms-select-option-item, .ms-create-option-item"));
      const activeIdx = items.findIndex((el) => el.classList.contains("is-keyboard-active"));

      if (e.key === "ArrowDown") {
        e.preventDefault();
        items.forEach((el) => el.classList.remove("is-keyboard-active"));
        const nextIdx = activeIdx < items.length - 1 ? activeIdx + 1 : 0;
        if (items[nextIdx]) {
          items[nextIdx].classList.add("is-keyboard-active");
          items[nextIdx].scrollIntoView({ block: "nearest" });
        }
        return;
      }

      if (e.key === "ArrowUp") {
        e.preventDefault();
        items.forEach((el) => el.classList.remove("is-keyboard-active"));
        const prevIdx = activeIdx > 0 ? activeIdx - 1 : items.length - 1;
        if (items[prevIdx]) {
          items[prevIdx].classList.add("is-keyboard-active");
          items[prevIdx].scrollIntoView({ block: "nearest" });
        }
        return;
      }

      if (e.key === "Enter") {
        e.preventDefault();
        if (activeIdx >= 0 && items[activeIdx]) {
          items[activeIdx].click();
        } else {
          const trimmed = this.searchQuery.trim();
          if (trimmed) {
            await this.selectOption(trimmed);
          }
        }
      }
    });

    // 2. Options List Container
    const optionsListContainer = this.containerEl.createDiv({ cls: "ms-popover-options-list" });
    this.renderOptionsList(optionsListContainer);
  }

  private renderOptionsList(container: HTMLElement): void {
    container.empty();

    const queryLower = this.searchQuery.trim().toLowerCase();
    const available = this.options.allAvailableTags || [];

    // Filter matching existing options
    const filtered = available.filter((t) =>
      t.name.toLowerCase().includes(queryLower)
    );

    const exactMatch = available.some(
      (t) => t.name.toLowerCase() === queryLower
    );

    // Section title
    if (filtered.length > 0) {
      container.createDiv({
        cls: "ms-menu-section-title",
        text: "Select an option",
      });

      filtered.forEach((tag) => {
        const isSelected = tag.name.toLowerCase() === this.currentTagName.toLowerCase();
        const itemRow = container.createDiv({
          cls: `ms-menu-item ms-select-option-item ${isSelected ? "is-selected" : ""}`,
        });

        // Tag badge
        const badge = createTagBadge({ tag, clickable: false });
        itemRow.appendChild(badge);

        // Checkmark if selected
        if (isSelected) {
          itemRow.createSpan({ cls: "ms-prop-check" }).innerHTML = ICON_CHECK;
        }

        // Click on option selects it immediately!
        itemRow.addEventListener("click", async () => {
          await this.selectOption(tag.name);
        });
      });
    }

    // Create New Option button if query doesn't exactly match
    if (this.searchQuery.trim() && !exactMatch) {
      const createItem = container.createDiv({ cls: "ms-menu-item ms-create-option-item" });
      createItem.innerHTML = `<span class="ms-menu-icon">${ICON_PLUS}</span><span>Create <strong>"${this.searchQuery.trim()}"</strong></span>`;
      createItem.addEventListener("click", async () => {
        await this.selectOption(this.searchQuery.trim());
      });
    }

    // Clear selection button if cell currently has value
    if (this.currentTagName) {
      container.createDiv({ cls: "ms-menu-divider" });
      const clearItem = container.createDiv({ cls: "ms-menu-item is-danger" });
      clearItem.innerHTML = `${ICON_CLEAR}<span>Clear selection</span>`;
      clearItem.addEventListener("click", async () => {
        await this.selectOption("");
      });
    }
  }

  private async selectOption(tagName: string): Promise<void> {
    await this.options.onSelect(tagName);
    if (this.closePopover) {
      this.closePopover();
    } else {
      this.containerEl.remove();
    }
  }
}
