import { appendIcon, appendIconLabel } from "../../utils/dom";
import { debounce } from "../../utils/lifecycle";
import {
  ICON_EXPORT_ACTION,
  ICON_FILTER_ACTION,
  ICON_PROPERTIES_ACTION,
  ICON_SEARCH,
  ICON_SORT_ACTION,
  ICON_VIEW_BOARD,
  ICON_VIEW_TABLE,
} from "../icons";
import { closeAllFloatingPopovers } from "../popover";
import { TableMenus } from "./menus";
import { TableViewContext } from "./types";

const SEARCH_DEBOUNCE_MS = 120;

export class TableToolbar {
  private ctx: TableViewContext;
  private menus: TableMenus;
  private isSearchFocused = false;
  private searchCursorPos: number | null = null;
  private readonly applySearch: () => void;

  constructor(ctx: TableViewContext, menus: TableMenus) {
    this.ctx = ctx;
    this.menus = menus;
    this.applySearch = ctx.registry.add(
      debounce(() => {
        ctx.actions.onFilterChange(ctx.filterState);
        ctx.renderRows();
      }, SEARCH_DEBOUNCE_MS)
    );
  }

  public render(container: HTMLElement): void {
    const topBar = container.createDiv({ cls: "ms-db-top-bar" });

    this.renderViewTabs(topBar.createDiv({ cls: "ms-db-header-left" }));
    this.renderActions(topBar.createDiv({ cls: "ms-db-header-right" }));
  }

  private renderViewTabs(leftHeader: HTMLElement): void {
    const tableTabBtn = leftHeader.createEl("button", {
      cls: "ms-db-view-tab-btn is-active",
    });
    appendIconLabel(tableTabBtn, ICON_VIEW_TABLE, "Table");

    const boardTabBtn = leftHeader.createEl("button", { cls: "ms-db-view-tab-btn" });
    appendIconLabel(boardTabBtn, ICON_VIEW_BOARD, "Board");
    boardTabBtn.addEventListener("click", () => this.ctx.switchView("board"));
  }

  private renderActions(rightHeader: HTMLElement): void {
    this.renderSearch(rightHeader);

    const { filterState } = this.ctx;
    const activeFiltersCount = filterState.rules.filter((rule) => rule.enabled).length;
    const activeSortCount = filterState.sortRules ? filterState.sortRules.length : 0;
    const hiddenCount = (filterState.hiddenColumnIndices ?? []).length;

    const filterBtn = this.createActionButton(
      rightHeader,
      ICON_FILTER_ACTION,
      "Filter",
      activeFiltersCount,
      filterState.isFilterOpen || activeFiltersCount > 0
    );
    filterBtn.addEventListener("click", () => {
      this.menus.closeActivePopover();
      filterState.isFilterOpen = !filterState.isFilterOpen;
      this.ctx.render();
    });

    const sortBtn = this.createActionButton(
      rightHeader,
      ICON_SORT_ACTION,
      "Sort",
      activeSortCount,
      filterState.isSortOpen || activeSortCount > 0
    );
    sortBtn.addEventListener("click", () => {
      this.menus.closeActivePopover();
      filterState.isSortOpen = !filterState.isSortOpen;
      this.ctx.render();
    });

    const propsBtn = this.createActionButton(
      rightHeader,
      ICON_PROPERTIES_ACTION,
      "Properties",
      hiddenCount,
      this.menus.openMenuKind === "properties"
    );
    propsBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      const wasOpen = this.menus.openMenuKind === "properties";
      this.menus.closeActivePopover();
      if (!wasOpen) {
        this.menus.openPropertiesMenu(propsBtn);
      }
    });

    const exportBtn = this.createActionButton(
      rightHeader,
      ICON_EXPORT_ACTION,
      "Export",
      0,
      this.menus.openMenuKind === "export"
    );
    exportBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      const wasOpen = this.menus.openMenuKind === "export";
      this.menus.closeActivePopover();
      if (!wasOpen) {
        this.menus.openExportMenu(exportBtn);
      }
    });
  }

  private createActionButton(
    parent: HTMLElement,
    icon: string,
    label: string,
    count: number,
    isActive: boolean
  ): HTMLButtonElement {
    const button = parent.createEl("button", {
      cls: `ms-db-action-btn ${isActive ? "is-active" : ""}`,
    });
    appendIconLabel(button, icon, label);
    if (count > 0) {
      button.createSpan({ cls: "ms-db-action-count", text: `(${count})` });
    }
    return button;
  }

  private renderSearch(rightHeader: HTMLElement): void {
    const { filterState } = this.ctx;
    const searchWrap = rightHeader.createDiv({ cls: "ms-db-search-wrap" });
    appendIcon(searchWrap.createSpan({ cls: "ms-db-search-icon" }), ICON_SEARCH);

    const searchInput = searchWrap.createEl("input", {
      type: "text",
      cls: "ms-db-search-input",
      placeholder: "Search...",
      value: filterState.searchQuery || "",
    });

    if (this.isSearchFocused) {
      searchInput.focus();
      if (this.searchCursorPos !== null) {
        const position = Math.min(this.searchCursorPos, searchInput.value.length);
        searchInput.setSelectionRange(position, position);
      }
    }

    searchInput.addEventListener("focus", () => {
      this.isSearchFocused = true;
    });

    searchInput.addEventListener("blur", () => {
      this.isSearchFocused = false;
      this.searchCursorPos = null;
    });

    searchInput.addEventListener("input", (e) => {
      const target = e.target as HTMLInputElement;
      this.isSearchFocused = true;
      this.searchCursorPos = target.selectionStart;
      filterState.searchQuery = target.value;
      this.applySearch();
    });

    searchInput.addEventListener("keydown", (e) => {
      if (e.key !== "Escape") return;
      this.isSearchFocused = false;
      this.searchCursorPos = null;
      filterState.searchQuery = "";
      closeAllFloatingPopovers();
      this.ctx.actions.onFilterChange(filterState);
      this.ctx.render();
    });
  }
}
