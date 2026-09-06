import { App, Notice } from "obsidian";
import { calculateColumnSummary, getCalculationOptionsForColumnType } from "../core/calculation-engine";
import { evaluateFilterStateOnRow, getFilterOperatorsForColumnType } from "../core/filter-engine";
import { exportTableToCSV } from "../core/markdown-parser";
import { isCellChecked, sortRows } from "../core/sort-engine";
import { parseCellTags } from "../core/tag-parser";
import {
  ColumnType,
  DatabaseViewType,
  DateFormatOption,
  FilterOperator,
  MarkdownTableData,
  MarkdownTableRow,
  PluginSettings,
  SortDirection,
  SortRule,
  TableColumn,
  TableFilterState,
} from "../types";
import { AddColumnModal } from "./add-column-modal";
import { RenameColumnModal } from "./rename-column-modal";
import { DatePickerPopover } from "./date-picker-modal";
import { KanbanView } from "./kanban-view";
import { SingleSelectPopover } from "./single-select-popover";
import { createTagBadge } from "./tag-badge";
import { mountFloatingPopover } from "./popover-utils";
import { attachStrictNumericInputHandlers, sanitizeNumericCellValue } from "./input-utils";
import { TagSelectModal } from "./tag-select-modal";
import {
  COLUMN_TYPE_DEFINITIONS,
  getColumnTypeIcon,
  ICON_ARROW_DOWN,
  ICON_ARROW_LEFT,
  ICON_ARROW_RIGHT,
  ICON_ARROW_UP,
  ICON_CHECK,
  ICON_CLEAR,
  ICON_COPY,
  ICON_CROSS,
  ICON_DOWNLOAD,
  ICON_DUPLICATE,
  ICON_EDIT,
  ICON_EXPORT_ACTION,
  ICON_EYE_OFF,
  ICON_FILTER_ACTION,
  ICON_PLUS,
  ICON_PROPERTIES_ACTION,
  ICON_SEARCH,
  ICON_SORT_ACTION,
  ICON_TRASH,
  ICON_TYPE_DATE,
  ICON_TYPE_NUMBER,
  ICON_VIEW_BOARD,
  ICON_VIEW_TABLE,
} from "./icons";

export interface NotionTableViewOptions {
  app: App;
  tableData: MarkdownTableData;
  columns: TableColumn[];
  filterState: TableFilterState;
  settings: PluginSettings;
  onCellUpdate: (rowIndex: number, colIndex: number, newValue: string) => Promise<void>;
  onAddRow: (atIndex?: number, prefilledCells?: string[]) => Promise<void>;
  onDuplicateRow: (rowIndex: number) => Promise<void>;
  onDeleteRow: (rowIndex: number) => Promise<void>;
  onReorderRows?: (fromIndex: number, toIndex: number) => Promise<void>;
  onAddColumn: (name: string, type: ColumnType, atIndex?: number, dateFormat?: DateFormatOption) => Promise<void>;
  onRenameColumn: (colIndex: number, newName: string) => Promise<void>;
  onDeleteColumn: (colIndex: number) => Promise<void>;
  onColumnTypeChange?: (colIndex: number, newType: ColumnType, dateFormat?: DateFormatOption) => Promise<void>;
  onColumnDateFormatChange?: (colIndex: number, newDateFormat: DateFormatOption) => Promise<void>;
  onReorderColumns?: (fromIndex: number, toIndex: number) => Promise<void>;
  onFilterChange: (newState: TableFilterState) => void;
  onSortChange: (sortRules: SortRule[]) => void;
}

export class NotionTableView {
  private options: NotionTableViewOptions;
  private containerEl: HTMLElement;
  private focusedCell: { row: number; col: number } | null = null;
  private editingCell: { row: number; col: number } | null = null;
  private draggedColIdx: number | null = null;
  private draggedRowIdx: number | null = null;
  private activeMenu: "properties" | "export" | null = null;
  private closeCurrentPopover?: () => void;
  private isSearchFocused = false;
  private searchCursorPos: number | null = null;
  private keyboardBound = false;

  constructor(options: NotionTableViewOptions) {
    this.options = options;
    if (!this.options.filterState.viewType) {
      this.options.filterState.viewType = "table";
    }
    if (!this.options.filterState.hiddenColumnIndices) {
      this.options.filterState.hiddenColumnIndices = [];
    }

    this.containerEl = document.createElement("div");
    this.containerEl.className = "ms-notion-database-container";
    this.containerEl.tabIndex = 0;
  }

  public getElement(): HTMLElement {
    this.render();
    if (!this.keyboardBound) {
      this.bindKeyboardNavigation();
      this.keyboardBound = true;
    }
    return this.containerEl;
  }

  public updateData(tableData: MarkdownTableData, columns: TableColumn[]): void {
    this.options.tableData = tableData;
    this.options.columns = columns;
    this.render();
  }

  public render(): void {
    if (this.closeCurrentPopover) {
      this.closeCurrentPopover();
      this.closeCurrentPopover = undefined;
    }
    this.containerEl.empty();

    const { tableData, columns, filterState, settings } = this.options;
    const isBoardView = filterState.viewType === "board";

    // If Board View is active, render KanbanView
    if (isBoardView) {
      const kanban = new KanbanView({
        app: this.options.app,
        tableData,
        columns,
        filterState,
        settings,
        onCellUpdate: this.options.onCellUpdate,
        onAddRow: this.options.onAddRow,
        onDeleteRow: this.options.onDeleteRow,
        onReorderRows: this.options.onReorderRows,
        onSwitchView: (view: DatabaseViewType) => {
          filterState.viewType = view;
          this.options.onFilterChange(filterState);
          this.render();
        },
      });
      this.containerEl.appendChild(kanban.getElement());
      return;
    }

    // 1. Filter rows
    let visibleRows = tableData.rows.filter((row) =>
      evaluateFilterStateOnRow(row, filterState, columns)
    );

    // 2. Sort rows if active sort rules
    if (filterState.sortRules && filterState.sortRules.length > 0) {
      for (const sortRule of filterState.sortRules) {
        const col = columns[sortRule.columnIndex];
        visibleRows = sortRows(
          visibleRows,
          sortRule.columnIndex,
          sortRule.direction,
          col ? col.type : "text"
        );
      }
    }

    const hiddenIndices = filterState.hiddenColumnIndices || [];
    const visibleColumns = columns.filter((c) => !hiddenIndices.includes(c.index));

    // 3. Database Top Bar (View tabs, Filter, Sort, Properties, Export, Search, + New)
    const topBar = this.containerEl.createDiv({ cls: "ms-db-top-bar" });

    // Left title & view tabs
    const leftHeader = topBar.createDiv({ cls: "ms-db-header-left" });

    const tableTabBtn = leftHeader.createEl("button", {
      cls: "ms-db-view-tab-btn is-active",
    });
    tableTabBtn.innerHTML = `${ICON_VIEW_TABLE}<span>Table</span>`;

    const boardTabBtn = leftHeader.createEl("button", {
      cls: "ms-db-view-tab-btn",
    });
    boardTabBtn.innerHTML = `${ICON_VIEW_BOARD}<span>Board</span>`;
    boardTabBtn.addEventListener("click", () => {
      filterState.viewType = "board";
      this.options.onFilterChange(filterState);
      this.render();
    });

    // Right Controls
    const rightHeader = topBar.createDiv({ cls: "ms-db-header-right" });

    // 1. Search Input (placed before buttons so buttons do not shift)
    const searchWrap = rightHeader.createDiv({ cls: "ms-db-search-wrap" });
    const searchIcon = searchWrap.createSpan({ cls: "ms-db-search-icon" });
    searchIcon.innerHTML = ICON_SEARCH;

    const searchInput = searchWrap.createEl("input", {
      type: "text",
      cls: "ms-db-search-input",
      placeholder: "Search...",
      value: filterState.searchQuery || "",
    });

    if (this.isSearchFocused) {
      searchInput.focus();
      if (this.searchCursorPos !== null) {
        try {
          searchInput.setSelectionRange(this.searchCursorPos, this.searchCursorPos);
        } catch {
          // ignore
        }
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
      this.options.onFilterChange(filterState);
      this.render();
    });

    searchInput.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        this.isSearchFocused = false;
        this.searchCursorPos = null;
        filterState.searchQuery = "";
        this.options.onFilterChange(filterState);
        this.render();
      }
    });

    // 2. Filter Toggle Button
    const activeFiltersCount = filterState.rules.filter((r) => r.enabled).length;
    const filterBtn = rightHeader.createEl("button", {
      cls: `ms-db-action-btn ${filterState.isFilterOpen || activeFiltersCount > 0 ? "is-active" : ""}`,
    });
    filterBtn.innerHTML = `${ICON_FILTER_ACTION} <span>Filter</span> ${activeFiltersCount > 0 ? `(${activeFiltersCount})` : ""}`;
    filterBtn.addEventListener("click", () => {
      if (this.closeCurrentPopover) {
        this.closeCurrentPopover();
      }
      filterState.isFilterOpen = !filterState.isFilterOpen;
      this.render();
    });

    // 3. Sort Toggle Button
    const activeSortCount = filterState.sortRules ? filterState.sortRules.length : 0;
    const sortBtn = rightHeader.createEl("button", {
      cls: `ms-db-action-btn ${filterState.isSortOpen || activeSortCount > 0 ? "is-active" : ""}`,
    });
    sortBtn.innerHTML = `${ICON_SORT_ACTION} <span>Sort</span> ${activeSortCount > 0 ? `(${activeSortCount})` : ""}`;
    sortBtn.addEventListener("click", () => {
      if (this.closeCurrentPopover) {
        this.closeCurrentPopover();
      }
      filterState.isSortOpen = !filterState.isSortOpen;
      this.render();
    });

    // 4. Properties Visibility Button
    const hiddenCount = hiddenIndices.length;
    const isPropsOpen = this.activeMenu === "properties";
    const propsBtn = rightHeader.createEl("button", {
      cls: `ms-db-action-btn ${isPropsOpen ? "is-active" : ""}`,
    });
    propsBtn.innerHTML = `${ICON_PROPERTIES_ACTION} <span>Properties</span> ${hiddenCount > 0 ? `(${hiddenCount})` : ""}`;
    propsBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      if (this.activeMenu === "properties") {
        if (this.closeCurrentPopover) {
          this.closeCurrentPopover();
        }
        return;
      }
      if (this.closeCurrentPopover) {
        this.closeCurrentPopover();
      }
      this.openPropertiesMenu(propsBtn);
    });

    // 5. Export Button
    const isExportOpen = this.activeMenu === "export";
    const exportBtn = rightHeader.createEl("button", {
      cls: `ms-db-action-btn ${isExportOpen ? "is-active" : ""}`,
    });
    exportBtn.innerHTML = `${ICON_EXPORT_ACTION} <span>Export</span>`;
    exportBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      if (this.activeMenu === "export") {
        if (this.closeCurrentPopover) {
          this.closeCurrentPopover();
        }
        return;
      }
      if (this.closeCurrentPopover) {
        this.closeCurrentPopover();
      }
      this.openExportMenu(exportBtn);
    });

    // 4. Sort Panel (if opened)
    if (filterState.isSortOpen) {
      this.renderSortPanel(this.containerEl, filterState, columns);
    }

    // 5. Clean Filter Panel (if opened)
    if (filterState.isFilterOpen) {
      this.renderFilterPanel(this.containerEl, filterState, columns);
    }

    // 6. Scrollable Table Wrapper
    const tableScrollWrapper = this.containerEl.createDiv({
      cls: "ms-db-table-scroll-wrapper",
    });

    const showRowNumbers = filterState.showRowNumbers !== undefined
      ? filterState.showRowNumbers
      : !!settings.showRowNumbers;

    const tableEl = tableScrollWrapper.createEl("table", {
      cls: `ms-db-grid-table ${settings.stickyFirstColumn ? "is-sticky-first" : ""} ${showRowNumbers ? "has-row-numbers" : "no-row-numbers"}`,
    });

    tableEl.addEventListener("mouseover", (e) => {
      const target = e.target as HTMLElement | null;
      const inAddCol = Boolean(target?.closest(".ms-db-th-add-col, .ms-db-td-add-col"));
      tableEl.classList.toggle("is-add-col-hovered", inAddCol);
    });

    tableEl.addEventListener("mouseleave", () => {
      tableEl.classList.remove("is-add-col-hovered");
    });

    // Table Header Row
    const thead = tableEl.createEl("thead");
    const headerRow = thead.createEl("tr");

    // Optional Row Handle Column Header
    if (showRowNumbers) {
      const indexTh = headerRow.createEl("th", { cls: "ms-db-th ms-db-th-index" });
      const content = indexTh.createDiv({ cls: "ms-db-th-content ms-db-th-index-content" });
      const iconSpan = content.createSpan({ cls: "ms-db-type-icon ms-db-th-index-icon" });
      iconSpan.innerHTML = ICON_TYPE_NUMBER;
      const strut = content.createSpan({ cls: "ms-db-col-name ms-index-strut" });
      strut.innerHTML = "&nbsp;";
      indexTh.setAttribute("title", "Row numbers (Right-click to hide)");
      indexTh.addEventListener("contextmenu", (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.openIndexHeaderMenu(indexTh);
      });
    }

    visibleColumns.forEach((col) => {
      const cIdx = col.index;
      const th = headerRow.createEl("th", { cls: "ms-db-th" });
      th.dataset.colIndex = `${cIdx}`;
      if (this.focusedCell && this.focusedCell.col === cIdx) {
        th.classList.add("is-col-focused");
      }
      th.setAttribute("draggable", "true");

      if (col.width) {
        th.style.width = `${col.width}px`;
        th.style.minWidth = `${col.width}px`;
      }

      // Drag & Drop Column Reordering
      th.addEventListener("dragstart", (e) => {
        this.draggedColIdx = cIdx;
        e.dataTransfer?.setData("text/col", `${cIdx}`);
        th.classList.add("is-dragging-col");
      });

      th.addEventListener("dragend", () => {
        th.classList.remove("is-dragging-col");
        this.draggedColIdx = null;
      });

      th.addEventListener("dragover", (e) => {
        if (this.draggedColIdx !== null && this.draggedColIdx !== cIdx) {
          e.preventDefault();
          th.classList.add("is-col-drop-target");
        }
      });

      th.addEventListener("dragleave", () => {
        th.classList.remove("is-col-drop-target");
      });

      th.addEventListener("drop", async (e) => {
        th.classList.remove("is-col-drop-target");
        if (this.draggedColIdx !== null && this.draggedColIdx !== cIdx) {
          e.preventDefault();
          if (this.options.onReorderColumns) {
            await this.options.onReorderColumns(this.draggedColIdx, cIdx);
          }
        }
      });

      const headerContent = th.createDiv({ cls: "ms-db-th-content" });

      // Property Type Icon
      const typeIcon = headerContent.createSpan({ cls: "ms-db-type-icon" });
      typeIcon.innerHTML = getColumnTypeIcon(col.type);

      const colNameSpan = headerContent.createSpan({
        cls: "ms-db-col-name",
        text: col.name,
      });

      colNameSpan.addEventListener("dblclick", (e) => {
        e.stopPropagation();
        e.preventDefault();
        new RenameColumnModal({
          app: this.options.app,
          currentName: col.name,
          onSave: async (newName) => {
            if (this.options.onRenameColumn) {
              await this.options.onRenameColumn(cIdx, newName);
            } else {
              col.name = newName;
              this.render();
            }
          },
        }).open();
      });

      // Sort Indicator
      const activeSort = filterState.sortRules?.find(
        (s) => s.columnIndex === cIdx
      );
      if (activeSort) {
        const sortIndicator = headerContent.createSpan({
          cls: "ms-db-sort-indicator",
        });
        sortIndicator.innerHTML = activeSort.direction === "asc" ? ICON_ARROW_UP : ICON_ARROW_DOWN;
      }

      // Column Header Menu Trigger (Right-Click only) & Column Focus (Left-Click)
      th.addEventListener("click", (e) => {
        e.stopPropagation();
        document.querySelector(".ms-col-header-menu")?.remove();
        this.setColumnFocus(cIdx);
      });
      th.addEventListener("contextmenu", (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.setColumnFocus(cIdx);
        this.openColumnHeaderMenu(th, col, cIdx);
      });

      // Resizer Handle
      const resizer = th.createDiv({ cls: "ms-col-resizer" });
      this.bindColumnResizer(resizer, th, col);
    });

    // Add Column Button (+)
    const addColTh = headerRow.createEl("th", {
      cls: "ms-db-th-add-col",
      attr: { title: "Add column" },
    });
    const addColBtn = addColTh.createEl("button", {
      cls: "ms-db-add-col-btn",
      attr: { title: "Add column", type: "button" },
    });
    addColBtn.innerHTML = ICON_PLUS;
    addColTh.addEventListener("click", (e) => {
      e.stopPropagation();
      this.openAddColumnModal();
    });

    // Table Body (Rows)
    const tbody = tableEl.createEl("tbody");

    visibleRows.forEach((row) => {
      const tr = tbody.createEl("tr", { cls: "ms-db-tr" });
      tr.dataset.rowIndex = `${row.rowIndex}`;
      if (this.focusedCell && this.focusedCell.row === row.rowIndex) {
        tr.classList.add("is-row-focused");
      }

      if (showRowNumbers) {
        // Row Handle Cell with Drag & Drop Reordering
        const indexTd = tr.createEl("td", { cls: "ms-db-td-index" });
        indexTd.setAttribute("draggable", "true");
        indexTd.createSpan({
          cls: "ms-db-row-handle",
          text: `${row.rowIndex + 1}`,
        });

        indexTd.addEventListener("dragstart", (e) => {
          this.draggedRowIdx = row.rowIndex;
          e.dataTransfer?.setData("text/row", `${row.rowIndex}`);
          tr.classList.add("is-dragging-row");
        });

        indexTd.addEventListener("dragend", () => {
          tr.classList.remove("is-dragging-row");
          this.draggedRowIdx = null;
        });

        indexTd.addEventListener("click", (e) => {
          e.stopPropagation();
          this.setCellFocus(row.rowIndex, this.focusedCell ? this.focusedCell.col : 0);
          this.openRowContextMenu(indexTd, row.rowIndex);
        });

        indexTd.addEventListener("contextmenu", (e) => {
          e.preventDefault();
          e.stopPropagation();
          this.setCellFocus(row.rowIndex, this.focusedCell ? this.focusedCell.col : 0);
          this.openRowContextMenu(indexTd, row.rowIndex);
        });
      }

      tr.addEventListener("dragover", (e) => {
        if (this.draggedRowIdx !== null && this.draggedRowIdx !== row.rowIndex) {
          e.preventDefault();
          tr.classList.add("is-row-drop-target");
        }
      });

      tr.addEventListener("dragleave", () => {
        tr.classList.remove("is-row-drop-target");
      });

      tr.addEventListener("drop", async (e) => {
        tr.classList.remove("is-row-drop-target");
        if (this.draggedRowIdx !== null && this.draggedRowIdx !== row.rowIndex) {
          e.preventDefault();
          if (this.options.onReorderRows) {
            await this.options.onReorderRows(this.draggedRowIdx, row.rowIndex);
          }
        }
      });

      // Cells
      visibleColumns.forEach((col) => {
        const cIdx = col.index;
        const td = tr.createEl("td", { cls: "ms-db-td" });
        td.dataset.rowIndex = `${row.rowIndex}`;
        td.dataset.colIndex = `${cIdx}`;

        const isFocused =
          this.focusedCell?.row === row.rowIndex &&
          this.focusedCell?.col === cIdx;
        if (isFocused) {
          td.classList.add("is-focused");
        }
        if (this.focusedCell?.col === cIdx) {
          td.classList.add("is-col-focused");
        }

        // Right-Click Context Menu
        td.addEventListener("contextmenu", (e) => {
          e.preventDefault();
          e.stopPropagation();
          this.openCellContextMenu(td, row.rowIndex, cIdx, col);
        });

        this.renderCellContent(td, row, col, cIdx);
      });

      // Add Column Spacer Cell in Row
      const addColTd = tr.createEl("td", {
        cls: "ms-db-td-spacer ms-db-td-add-col",
        attr: { title: "Add column" },
      });
      addColTd.addEventListener("click", (e) => {
        e.stopPropagation();
        this.openAddColumnModal();
      });
    });

    // 7. Bottom + New Row inside table
    const addRowTr = tbody.createEl("tr", { cls: "ms-db-tr ms-db-add-row-tr" });
    if (showRowNumbers) {
      addRowTr.createEl("td", { cls: "ms-db-td-index" });
    }
    const addRowTd = addRowTr.createEl("td", {
      cls: "ms-db-td ms-db-add-row-td",
      attr: { colspan: `${visibleColumns.length + 1}` },
    });
    const addRowBtn = addRowTd.createEl("button", {
      cls: "ms-db-add-row-btn",
    });
    addRowBtn.innerHTML = `${ICON_PLUS}<span>New</span>`;
    addRowBtn.addEventListener("click", () => this.options.onAddRow());

    // 8. Footer Calculations Bar as Table tfoot (renders when at least one column has an active calculation)
    const hasActiveCalculations = columns.some(
      (col) => col.calculation && col.calculation !== "none"
    );
    if (settings.enableCalculations && hasActiveCalculations && visibleColumns.length > 0) {
      this.renderCalculationBar(tableEl, visibleRows, visibleColumns);
    }
  }

  private openIndexHeaderMenu(anchor: HTMLElement): void {
    const existing = document.querySelector(".ms-col-header-menu");
    if (existing) existing.remove();

    const menu = document.createElement("div");
    menu.className = "ms-col-header-menu";

    const hideItem = menu.createDiv({ cls: "ms-menu-item" });
    hideItem.innerHTML = `${ICON_EYE_OFF}<span>Hide row numbers</span>`;
    hideItem.addEventListener("click", () => {
      this.options.filterState.showRowNumbers = false;
      this.options.onFilterChange(this.options.filterState);
      this.render();
      menu.remove();
    });

    mountFloatingPopover({
      anchorEl: anchor,
      popoverEl: menu,
      offsetTop: 2,
    });
  }

  private openPropertiesMenu(anchor: HTMLElement): void {
    this.activeMenu = "properties";
    anchor.classList.add("is-active");

    const menu = document.createElement("div");
    menu.className = "ms-col-header-menu ms-props-menu";

    // 1. Table View Options
    menu.createDiv({ cls: "ms-menu-section-title", text: "Table Options" });

    const isRowNums = this.options.filterState.showRowNumbers !== undefined
      ? this.options.filterState.showRowNumbers
      : !!this.options.settings.showRowNumbers;

    const rowNumsItem = menu.createDiv({
      cls: `ms-menu-item ms-prop-toggle-item ${isRowNums ? "is-selected" : ""}`,
    });
    rowNumsItem.innerHTML = `<span class="ms-prop-icon">${ICON_TYPE_NUMBER}</span> <span>Row numbers</span> <span class="ms-prop-check">${isRowNums ? ICON_CHECK : ""}</span>`;

    rowNumsItem.addEventListener("click", () => {
      this.options.filterState.showRowNumbers = !isRowNums;
      this.options.onFilterChange(this.options.filterState);
      if (this.closeCurrentPopover) {
        this.closeCurrentPopover();
      }
      this.render();
    });

    menu.createDiv({ cls: "ms-menu-divider" });

    // 2. Visible Column Properties
    menu.createDiv({ cls: "ms-menu-section-title", text: "Visible Properties" });

    const hiddenIndices = this.options.filterState.hiddenColumnIndices || [];

    this.options.columns.forEach((col) => {
      const isVisible = !hiddenIndices.includes(col.index);
      const row = menu.createDiv({
        cls: `ms-menu-item ms-prop-toggle-item ${isVisible ? "is-selected" : ""}`,
      });
      const typeIconSvg = getColumnTypeIcon(col.type);
      row.innerHTML = `<span class="ms-prop-icon">${typeIconSvg}</span> <span>${col.name}</span> <span class="ms-prop-check">${isVisible ? ICON_CHECK : ""}</span>`;

      row.addEventListener("click", () => {
        if (isVisible) {
          hiddenIndices.push(col.index);
        } else {
          const idx = hiddenIndices.indexOf(col.index);
          if (idx !== -1) hiddenIndices.splice(idx, 1);
        }
        this.options.filterState.hiddenColumnIndices = hiddenIndices;
        this.options.onFilterChange(this.options.filterState);
        if (this.closeCurrentPopover) {
          this.closeCurrentPopover();
        }
        this.render();
      });
    });

    this.closeCurrentPopover = mountFloatingPopover({
      anchorEl: anchor,
      popoverEl: menu,
      className: "ms-props-menu",
      offsetTop: 4,
      onClose: () => {
        this.activeMenu = null;
        this.closeCurrentPopover = undefined;
        anchor.classList.remove("is-active");
      },
    });
  }

  private openExportMenu(anchor: HTMLElement): void {
    this.activeMenu = "export";
    anchor.classList.add("is-active");

    const menu = document.createElement("div");
    menu.className = "ms-col-header-menu ms-export-menu";

    const copyCsv = menu.createDiv({ cls: "ms-menu-item" });
    copyCsv.innerHTML = `${ICON_COPY}<span>Copy table as CSV</span>`;
    copyCsv.addEventListener("click", () => {
      const csv = exportTableToCSV(
        this.options.tableData,
        this.options.filterState.hiddenColumnIndices || []
      );
      navigator.clipboard.writeText(csv);
      new Notice("Table CSV copied to clipboard!");
      if (this.closeCurrentPopover) {
        this.closeCurrentPopover();
      }
    });

    const downloadCsv = menu.createDiv({ cls: "ms-menu-item" });
    downloadCsv.innerHTML = `${ICON_DOWNLOAD}<span>Download CSV file</span>`;
    downloadCsv.addEventListener("click", () => {
      const csv = exportTableToCSV(
        this.options.tableData,
        this.options.filterState.hiddenColumnIndices || []
      );
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `table_export_${Date.now()}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      new Notice("Table CSV downloaded!");
      if (this.closeCurrentPopover) {
        this.closeCurrentPopover();
      }
    });

    this.closeCurrentPopover = mountFloatingPopover({
      anchorEl: anchor,
      popoverEl: menu,
      className: "ms-export-menu",
      offsetTop: 4,
      onClose: () => {
        this.activeMenu = null;
        this.closeCurrentPopover = undefined;
        anchor.classList.remove("is-active");
      },
    });
  }

  private renderSortPanel(
    container: HTMLElement,
    filterState: TableFilterState,
    columns: TableColumn[]
  ): void {
    const sortPanel = container.createDiv({ cls: "ms-table-toolbar-wrapper ms-sort-panel" });
    const rulesList = sortPanel.createDiv({ cls: "ms-rules-list" });

    if (!filterState.sortRules || filterState.sortRules.length === 0) {
      const emptyRow = rulesList.createDiv({ cls: "ms-filter-empty-row" });
      emptyRow.createSpan({ cls: "ms-empty-text", text: "No sorts applied." });
      const addBtn = emptyRow.createEl("button", {
        cls: "ms-add-filter-btn",
        text: "+ Add sort",
      });
      addBtn.addEventListener("click", () => {
        const firstCol = columns[0];
        filterState.sortRules = [
          {
            column: firstCol ? firstCol.name : "",
            columnIndex: firstCol ? firstCol.index : 0,
            direction: "asc",
          },
        ];
        this.options.onSortChange(filterState.sortRules);
        this.render();
      });
      return;
    }

    filterState.sortRules.forEach((rule, sIdx) => {
      const row = rulesList.createDiv({ cls: "ms-filter-rule-row" });
      row.createSpan({ cls: "ms-rule-prefix", text: sIdx === 0 ? "Sort by" : "Then by" });

      // Column Select
      const colSelect = row.createEl("select", { cls: "ms-rule-col-select" });
      columns.forEach((c) => {
        const opt = colSelect.createEl("option", { value: `${c.index}`, text: c.name });
        if (c.index === rule.columnIndex) opt.selected = true;
      });
      colSelect.addEventListener("change", (e) => {
        const selected = parseInt((e.target as HTMLSelectElement).value, 10);
        rule.columnIndex = selected;
        rule.column = columns[selected]?.name || "";
        this.options.onSortChange(filterState.sortRules);
        this.render();
      });

      // Direction Select
      const dirSelect = row.createEl("select", { cls: "ms-rule-op-select" });
      dirSelect.createEl("option", { value: "asc", text: "Ascending" });
      dirSelect.createEl("option", { value: "desc", text: "Descending" });
      dirSelect.value = rule.direction;
      dirSelect.addEventListener("change", (e) => {
        rule.direction = (e.target as HTMLSelectElement).value as SortDirection;
        this.options.onSortChange(filterState.sortRules);
        this.render();
      });

      // Delete sort rule
      const delBtn = row.createEl("button", { cls: "ms-delete-rule-btn", attr: { title: "Remove sort rule" } });
      delBtn.innerHTML = ICON_CROSS;
      delBtn.addEventListener("click", () => {
        filterState.sortRules.splice(sIdx, 1);
        this.options.onSortChange(filterState.sortRules);
        this.render();
      });
    });

    const footer = sortPanel.createDiv({ cls: "ms-panel-footer" });
    const addSortBtn = footer.createEl("button", {
      cls: "ms-add-filter-btn",
    });
    addSortBtn.innerHTML = `${ICON_PLUS}<span>Add sort</span>`;
    addSortBtn.addEventListener("click", () => {
      const firstCol = columns[0];
      filterState.sortRules.push({
        column: firstCol ? firstCol.name : "",
        columnIndex: firstCol ? firstCol.index : 0,
        direction: "asc",
      });
      this.options.onSortChange(filterState.sortRules);
      this.render();
    });

    const clearBtn = footer.createEl("button", {
      cls: "ms-clear-filters-btn",
      text: "Clear all sorts",
    });
    clearBtn.addEventListener("click", () => {
      filterState.sortRules = [];
      this.options.onSortChange(filterState.sortRules);
      this.render();
    });
  }

  private renderFilterPanel(
    container: HTMLElement,
    filterState: TableFilterState,
    columns: TableColumn[]
  ): void {
    const filterPanel = container.createDiv({ cls: "ms-table-toolbar-wrapper ms-filter-panel" });
    const rulesList = filterPanel.createDiv({ cls: "ms-rules-list" });

    if (!filterState.rules || filterState.rules.length === 0) {
      const emptyRow = rulesList.createDiv({ cls: "ms-filter-empty-row" });
      emptyRow.createSpan({ cls: "ms-empty-text", text: "No filter rules applied." });
      const addBtn = emptyRow.createEl("button", {
        cls: "ms-add-filter-btn",
      });
      addBtn.innerHTML = `${ICON_PLUS}<span>Add filter rule</span>`;
      addBtn.addEventListener("click", () => {
        const firstCol = columns[0];
        filterState.rules.push({
          id: `rule_${Date.now()}`,
          column: firstCol ? firstCol.name : "",
          columnIndex: firstCol ? firstCol.index : 0,
          operator: "contains",
          value: "",
          enabled: true,
        });
        this.options.onFilterChange(filterState);
        this.render();
      });
      return;
    }

    filterState.rules.forEach((rule, rIdx) => {
      const row = rulesList.createDiv({ cls: "ms-filter-rule-row" });

      if (rIdx === 0) {
        row.createSpan({ cls: "ms-rule-prefix", text: "Where" });
      } else {
        const conjSelect = row.createEl("select", { cls: "ms-conjunction-select" });
        conjSelect.createEl("option", { value: "AND", text: "And" });
        conjSelect.createEl("option", { value: "OR", text: "Or" });
        conjSelect.value = filterState.conjunction;
        conjSelect.addEventListener("change", (e) => {
          filterState.conjunction = (e.target as HTMLSelectElement).value as "AND" | "OR";
          this.options.onFilterChange(filterState);
          this.render();
        });
      }

      // Column Select
      const colSelect = row.createEl("select", { cls: "ms-rule-col-select" });
      columns.forEach((c) => {
        const opt = colSelect.createEl("option", { value: `${c.index}`, text: c.name });
        if (c.index === rule.columnIndex) opt.selected = true;
      });
      colSelect.addEventListener("change", (e) => {
        const selected = parseInt((e.target as HTMLSelectElement).value, 10);
        rule.columnIndex = selected;
        rule.column = columns[selected]?.name || "";
        this.options.onFilterChange(filterState);
        this.render();
      });

      // Operator Select
      const col = columns[rule.columnIndex];
      const colType = col ? col.type : "text";

      const opSelect = row.createEl("select", { cls: "ms-rule-op-select" });
      const ops = getFilterOperatorsForColumnType(colType);

      for (const op of ops) {
        const opt = opSelect.createEl("option", { value: op.value, text: op.label });
        if (op.value === rule.operator) opt.selected = true;
      }

      opSelect.addEventListener("change", (e) => {
        rule.operator = (e.target as HTMLSelectElement).value as FilterOperator;
        this.options.onFilterChange(filterState);
        this.render();
      });

      // Value Input
      if (rule.operator !== "is_empty" && rule.operator !== "is_not_empty") {
        const isOneOf = rule.operator === "is_one_of" || rule.operator === "is_not_one_of";
        const valInput = row.createEl("input", {
          type: "text",
          cls: "ms-rule-text-input",
          placeholder: isOneOf ? "Tags (e.g. Done, In Progress)..." : "Value...",
          value: Array.isArray(rule.value) ? rule.value.join(", ") : rule.value,
        });
        valInput.addEventListener("input", (e) => {
          rule.value = (e.target as HTMLInputElement).value;
          this.options.onFilterChange(filterState);
          this.render();
        });
      }

      // Delete Rule Button
      const delBtn = row.createEl("button", { cls: "ms-delete-rule-btn", attr: { title: "Remove filter rule" } });
      delBtn.innerHTML = ICON_CROSS;
      delBtn.addEventListener("click", () => {
        filterState.rules.splice(rIdx, 1);
        this.options.onFilterChange(filterState);
        this.render();
      });
    });

    const footer = filterPanel.createDiv({ cls: "ms-panel-footer" });
    const addRuleBtn = footer.createEl("button", {
      cls: "ms-add-filter-btn",
    });
    addRuleBtn.innerHTML = `${ICON_PLUS}<span>Add filter rule</span>`;
    addRuleBtn.addEventListener("click", () => {
      const firstCol = columns[0];
      filterState.rules.push({
        id: `rule_${Date.now()}`,
        column: firstCol ? firstCol.name : "",
        columnIndex: firstCol ? firstCol.index : 0,
        operator: "contains",
        value: "",
        enabled: true,
      });
      this.options.onFilterChange(filterState);
      this.render();
    });

    const clearBtn = footer.createEl("button", {
      cls: "ms-clear-filters-btn",
      text: "Clear all filters",
    });
    clearBtn.addEventListener("click", () => {
      filterState.rules = [];
      this.options.onFilterChange(filterState);
      this.render();
    });
  }

  private renderCellContent(
    td: HTMLElement,
    row: MarkdownTableRow,
    col: TableColumn,
    colIndex: number
  ): void {
    const rawVal = row.cells[colIndex] || "";

    switch (col.type) {
      case "checkbox": {
        const checked = isCellChecked(rawVal);
        const checkboxWrapper = td.createDiv({ cls: "ms-cell-checkbox-wrapper" });
        const chk = checkboxWrapper.createEl("input", {
          type: "checkbox",
          cls: "ms-notion-checkbox",
        });
        chk.checked = checked;

        chk.addEventListener("change", async (e) => {
          this.setCellFocus(row.rowIndex, colIndex);
          const newVal = (e.target as HTMLInputElement).checked ? "[x]" : "[ ]";
          await this.options.onCellUpdate(row.rowIndex, colIndex, newVal);
        });

        td.addEventListener("click", () => {
          this.setCellFocus(row.rowIndex, colIndex);
        });
        break;
      }

      case "date": {
        const dateWrapper = td.createDiv({ cls: "ms-cell-date-wrapper" });
        if (rawVal.trim()) {
          dateWrapper.innerHTML = `<span class="ms-date-icon">${ICON_TYPE_DATE}</span> <span class="ms-date-text">${rawVal}</span>`;
        } else {
          dateWrapper.createSpan({ cls: "ms-cell-empty-placeholder", text: "Empty" });
        }

        td.addEventListener("click", () => {
          this.setCellFocus(row.rowIndex, colIndex);
          this.openDatePicker(td, row.rowIndex, colIndex, rawVal);
        });
        break;
      }

      case "select": {
        const tags = parseCellTags(rawVal, this.options.settings.customTagColors);
        const container = td.createDiv({ cls: "ms-cell-badges-container is-single-select" });

        if (tags.length === 0) {
          container.createSpan({
            cls: "ms-cell-empty-placeholder",
            text: "Empty",
          });
        } else {
          const tag = tags[0];
          const badge = createTagBadge({
            tag,
            clickable: true,
            onClick: () => this.openSingleSelectPopover(td, row, col, colIndex, rawVal),
          });
          container.appendChild(badge);
        }

        td.addEventListener("click", () => {
          this.setCellFocus(row.rowIndex, colIndex);
          this.openSingleSelectPopover(td, row, col, colIndex, rawVal);
        });
        break;
      }

      case "multi-select": {
        const tags = parseCellTags(rawVal, this.options.settings.customTagColors);
        const container = td.createDiv({ cls: "ms-cell-badges-container" });

        if (tags.length === 0) {
          container.createSpan({
            cls: "ms-cell-empty-placeholder",
            text: "Empty",
          });
        } else {
          for (const tag of tags) {
            const badge = createTagBadge({
              tag,
              clickable: true,
              onClick: () => this.openTagSelectModal(td, row, col, colIndex, rawVal),
            });
            container.appendChild(badge);
          }
        }

        td.addEventListener("click", () => {
          this.setCellFocus(row.rowIndex, colIndex);
          this.openTagSelectModal(td, row, col, colIndex, rawVal);
        });
        break;
      }

      case "number":
      case "text":
      default: {
        const textWrapper = td.createDiv({
          cls: `ms-cell-text-wrapper ${col.type === "number" ? "is-number" : ""}`,
        });
        textWrapper.textContent = rawVal;

        td.addEventListener("click", () => {
          this.setCellFocus(row.rowIndex, colIndex);
        });

        td.addEventListener("dblclick", () => {
          this.startInlineEditing(td, row.rowIndex, colIndex, rawVal);
        });
        break;
      }
    }
  }

  private openDatePicker(
    anchor: HTMLElement,
    rowIndex: number,
    colIndex: number,
    currentVal: string
  ): void {
    const col = this.options.columns[colIndex];
    const popover = new DatePickerPopover({
      app: this.options.app,
      anchorEl: anchor,
      currentDate: currentVal,
      dateFormat: col?.dateFormat || this.options.settings.dateFormat || "YYYY-MM-DD",
      onSelectDate: async (newDate) => {
        await this.options.onCellUpdate(rowIndex, colIndex, newDate);
        this.render();
      },
    });
    popover.open();
  }

  private startInlineEditing(
    td: HTMLElement,
    rowIndex: number,
    colIndex: number,
    currentVal: string,
    initialChar?: string
  ): void {
    this.editingCell = { row: rowIndex, col: colIndex };
    td.empty();
    td.classList.add("is-editing");

    const col = this.options.columns[colIndex];
    const isNumber = col ? col.type === "number" : false;

    const input = td.createEl("input", {
      type: "text",
      cls: `ms-inline-cell-input ${isNumber ? "is-number" : ""}`,
      value: initialChar !== undefined ? initialChar : currentVal,
    });
    input.setAttribute("autocomplete", "off");
    input.setAttribute("spellcheck", "false");

    if (isNumber) {
      attachStrictNumericInputHandlers(input);
    }

    input.focus();
    if (initialChar === undefined) {
      input.select();
    }

    let committed = false;
    const commit = async () => {
      if (committed) return;
      committed = true;
      let newVal = input.value.trim();
      if (isNumber) {
        newVal = sanitizeNumericCellValue(newVal);
      }
      this.editingCell = null;
      td.classList.remove("is-editing");
      await this.options.onCellUpdate(rowIndex, colIndex, newVal);
      this.render();
    };

    input.addEventListener("blur", commit);
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        commit();
      } else if (e.key === "Escape") {
        committed = true;
        this.editingCell = null;
        td.classList.remove("is-editing");
        this.render();
      } else if (e.key === "Tab") {
        e.preventDefault();
        commit();
        this.moveFocus(0, e.shiftKey ? -1 : 1);
      }
    });
  }

  private clearFocus(): void {
    this.focusedCell = null;
    this.containerEl
      .querySelectorAll(
        ".ms-db-td.is-focused, .ms-db-td.is-col-focused, .ms-db-th.is-col-focused, .ms-db-tr.is-row-focused"
      )
      .forEach((el) => {
        el.classList.remove("is-focused", "is-col-focused", "is-row-focused");
      });
    const tableEl = this.containerEl.querySelector<HTMLElement>(".ms-db-grid-table");
    if (tableEl) {
      tableEl.classList.remove("is-add-col-active");
    }
  }

  private setCellFocus(row: number, col: number): void {
    this.clearFocus();
    this.focusedCell = { row, col };

    // 1. Focused cell
    const targetTd = this.containerEl.querySelector(
      `.ms-db-td[data-row-index="${row}"][data-col-index="${col}"]`
    );
    if (targetTd) {
      targetTd.classList.add("is-focused");
    }

    // 2. Entire column (header + cells)
    const targetTh = this.containerEl.querySelector(
      `.ms-db-th[data-col-index="${col}"]`
    );
    if (targetTh) {
      targetTh.classList.add("is-col-focused");
    }
    this.containerEl
      .querySelectorAll(`.ms-db-td[data-col-index="${col}"]`)
      .forEach((el) => el.classList.add("is-col-focused"));

    // 3. Entire row
    const targetTr = this.containerEl.querySelector(
      `.ms-db-tr[data-row-index="${row}"]`
    );
    if (targetTr) {
      targetTr.classList.add("is-row-focused");
    }
  }

  private setColumnFocus(col: number): void {
    this.clearFocus();

    const targetTh = this.containerEl.querySelector(
      `.ms-db-th[data-col-index="${col}"]`
    );
    if (targetTh) {
      targetTh.classList.add("is-col-focused");
    }

    this.containerEl
      .querySelectorAll(`.ms-db-td[data-col-index="${col}"]`)
      .forEach((el) => el.classList.add("is-col-focused"));
  }

  private moveFocus(dRow: number, dCol: number): void {
    const totalRows = this.options.tableData.rows.length;
    const totalCols = this.options.columns.length;
    if (totalCols === 0) return;

    if (!this.focusedCell) {
      this.setCellFocus(0, 0);
      return;
    }

    let newRow = this.focusedCell.row + dRow;
    let newCol = this.focusedCell.col + dCol;

    if (newCol >= totalCols) {
      newCol = 0;
      newRow++;
    } else if (newCol < 0) {
      newCol = totalCols - 1;
      newRow--;
    }

    if (newRow >= totalRows) {
      this.options.onAddRow().then(() => {
        this.setCellFocus(totalRows, 0);
      });
      return;
    }

    if (newRow < 0) newRow = 0;

    this.setCellFocus(newRow, newCol);
  }

  private bindKeyboardNavigation(): void {
    this.containerEl.addEventListener("keydown", (e) => {
      if (this.editingCell) return;

      if (e.key === "Escape") {
        e.preventDefault();
        this.clearFocus();
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        this.moveFocus(-1, 0);
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        this.moveFocus(1, 0);
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        this.moveFocus(0, -1);
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        this.moveFocus(0, 1);
      } else if (e.key === "Tab") {
        e.preventDefault();
        this.moveFocus(0, e.shiftKey ? -1 : 1);
      } else if (e.key === "Enter") {
        e.preventDefault();
        this.triggerFocusedCellAction();
      } else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
        if (this.focusedCell) {
          const col = this.options.columns[this.focusedCell.col];
          if (col && (col.type === "text" || col.type === "number")) {
            if (col.type === "number" && !/^[0-9.,-]$/.test(e.key)) {
              return;
            }
            const td = this.containerEl.querySelector(
              `.ms-db-td[data-row-index="${this.focusedCell.row}"][data-col-index="${this.focusedCell.col}"]`
            ) as HTMLElement;
            if (td) {
              this.startInlineEditing(td, this.focusedCell.row, this.focusedCell.col, "", e.key);
            }
          }
        }
      }
    });
  }

  private triggerFocusedCellAction(): void {
    if (!this.focusedCell) return;
    const col = this.options.columns[this.focusedCell.col];
    const row = this.options.tableData.rows[this.focusedCell.row];
    if (!col || !row) return;

    const rawVal = row.cells[this.focusedCell.col] || "";
    const td = this.containerEl.querySelector(
      `.ms-db-td[data-row-index="${this.focusedCell.row}"][data-col-index="${this.focusedCell.col}"]`
    ) as HTMLElement;
    if (!td) return;

    if (col.type === "checkbox") {
      const newVal = isCellChecked(rawVal) ? "[ ]" : "[x]";
      this.options.onCellUpdate(this.focusedCell.row, this.focusedCell.col, newVal);
    } else if (col.type === "select") {
      this.openSingleSelectPopover(td, row, col, this.focusedCell.col, rawVal);
    } else if (col.type === "multi-select") {
      this.openTagSelectModal(td, row, col, this.focusedCell.col, rawVal);
    } else if (col.type === "date") {
      this.openDatePicker(td, this.focusedCell.row, this.focusedCell.col, rawVal);
    } else {
      this.startInlineEditing(td, this.focusedCell.row, this.focusedCell.col, rawVal);
    }
  }

  private openSingleSelectPopover(
    anchor: HTMLElement,
    row: MarkdownTableRow,
    col: TableColumn,
    colIndex: number,
    currentRawVal: string
  ): void {
    const popover = new SingleSelectPopover({
      app: this.options.app,
      anchorEl: anchor,
      columnName: col.name,
      currentValue: currentRawVal,
      allAvailableTags: col.uniqueTags || [],
      settings: this.options.settings,
      onSelect: async (selectedTag) => {
        await this.options.onCellUpdate(row.rowIndex, colIndex, selectedTag);
        this.render();
      },
    });
    popover.open();
  }

  private openTagSelectModal(
    _td: HTMLElement,
    row: MarkdownTableRow,
    col: TableColumn,
    colIndex: number,
    currentRawVal: string
  ): void {
    const modal = new TagSelectModal({
      app: this.options.app,
      settings: this.options.settings,
      columnName: col.name,
      currentValue: currentRawVal,
      allAvailableTags: col.uniqueTags || [],
      onTagColorChange: (tagName, color) => {
        this.options.settings.customTagColors[tagName.toLowerCase()] = color;
      },
      onSave: async (formattedText) => {
        await this.options.onCellUpdate(row.rowIndex, colIndex, formattedText);
        this.render();
      },
    });
    modal.open();
  }

  private populateRowActionMenuItems(menu: HTMLElement, rowIndex: number): void {
    const addItem = (icon: string, label: string, onClick: () => void, isDanger = false) => {
      const item = menu.createDiv({ cls: `ms-menu-item${isDanger ? " is-danger" : ""}` });
      item.innerHTML = `${icon}<span>${label}</span>`;
      item.addEventListener("click", () => {
        onClick();
        menu.remove();
      });
      return item;
    };

    addItem(ICON_ARROW_UP, "Insert row above", () => this.options.onAddRow(rowIndex));
    addItem(ICON_ARROW_DOWN, "Insert row below", () => this.options.onAddRow(rowIndex + 1));
    addItem(ICON_DUPLICATE, "Duplicate row", () => this.options.onDuplicateRow(rowIndex));
    menu.createDiv({ cls: "ms-menu-divider" });
    addItem(ICON_TRASH, "Delete row", () => this.options.onDeleteRow(rowIndex), true);
  }

  private openRowContextMenu(anchor: HTMLElement, rowIndex: number): void {
    const existing = document.querySelector(".ms-col-header-menu");
    if (existing) existing.remove();

    const menu = document.createElement("div");
    menu.className = "ms-col-header-menu ms-row-context-menu";

    this.populateRowActionMenuItems(menu, rowIndex);

    mountFloatingPopover({
      anchorEl: anchor,
      popoverEl: menu,
      offsetTop: 2,
    });
  }

  private openCellContextMenu(
    anchor: HTMLElement,
    rowIndex: number,
    colIndex: number,
    column: TableColumn
  ): void {
    const existing = document.querySelector(".ms-col-header-menu");
    if (existing) existing.remove();

    const menu = document.createElement("div");
    menu.className = "ms-col-header-menu ms-cell-context-menu";

    this.populateRowActionMenuItems(menu, rowIndex);

    menu.createDiv({ cls: "ms-menu-divider" });

    // Column Actions
    const insertLeft = menu.createDiv({ cls: "ms-menu-item" });
    insertLeft.innerHTML = `${ICON_ARROW_LEFT}<span>Insert column left</span>`;
    insertLeft.addEventListener("click", () => {
      menu.remove();
      this.openAddColumnModal(colIndex);
    });

    const insertRight = menu.createDiv({ cls: "ms-menu-item" });
    insertRight.innerHTML = `${ICON_ARROW_RIGHT}<span>Insert column right</span>`;
    insertRight.addEventListener("click", () => {
      menu.remove();
      this.openAddColumnModal(colIndex + 1);
    });

    const renameCol = menu.createDiv({ cls: "ms-menu-item" });
    renameCol.innerHTML = `${ICON_EDIT}<span>Rename column "${column.name}"</span>`;
    renameCol.addEventListener("click", () => {
      menu.remove();
      new RenameColumnModal({
        app: this.options.app,
        currentName: column.name,
        onSave: async (newName) => {
          if (this.options.onRenameColumn) {
            await this.options.onRenameColumn(colIndex, newName);
          } else {
            column.name = newName;
            this.render();
          }
        },
      }).open();
    });

    const delCol = menu.createDiv({ cls: "ms-menu-item is-danger" });
    delCol.innerHTML = `${ICON_TRASH}<span>Delete column "${column.name}"</span>`;
    delCol.addEventListener("click", () => {
      if (confirm(`Delete column "${column.name}"?`)) {
        this.options.onDeleteColumn(colIndex);
      }
      menu.remove();
    });

    menu.createDiv({ cls: "ms-menu-divider" });

    // Clear Cell Content
    const clearCell = menu.createDiv({ cls: "ms-menu-item" });
    clearCell.innerHTML = `${ICON_CLEAR}<span>Clear cell</span>`;
    clearCell.addEventListener("click", () => {
      this.options.onCellUpdate(rowIndex, colIndex, "");
      menu.remove();
    });

    mountFloatingPopover({
      anchorEl: anchor,
      popoverEl: menu,
      offsetTop: 2,
    });
  }

  private openColumnHeaderMenu(
    anchor: HTMLElement,
    column: TableColumn,
    columnIndex: number
  ): void {
    const existing = document.querySelector(".ms-col-header-menu");
    if (existing) existing.remove();

    const menu = document.createElement("div");
    menu.className = "ms-col-header-menu";

    // Top Property Header (Notion-style inline rename)
    const headerRow = menu.createDiv({ cls: "ms-col-menu-name-row" });
    const typeIconSpan = headerRow.createSpan({ cls: "ms-col-menu-type-icon" });
    typeIconSpan.innerHTML = getColumnTypeIcon(column.type);

    const nameInput = headerRow.createEl("input", {
      type: "text",
      cls: "ms-col-menu-name-input",
      value: column.name,
      placeholder: "Property name...",
    });

    let isCommitting = false;
    const commitRename = async () => {
      if (isCommitting) return;
      const newName = nameInput.value.trim();
      if (newName && newName !== column.name) {
        isCommitting = true;
        if (this.options.onRenameColumn) {
          await this.options.onRenameColumn(columnIndex, newName);
        } else {
          column.name = newName;
          this.render();
        }
      }
    };

    nameInput.addEventListener("keydown", async (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        await commitRename();
        menu.remove();
      } else if (e.key === "Escape") {
        e.preventDefault();
        menu.remove();
      }
    });

    nameInput.addEventListener("blur", () => {
      commitRename();
    });

    nameInput.addEventListener("click", (e) => {
      e.stopPropagation();
    });

    menu.createDiv({ cls: "ms-menu-divider" });

    // Sort Ascending
    const sortAsc = menu.createDiv({ cls: "ms-menu-item" });
    sortAsc.innerHTML = `${ICON_ARROW_UP}<span>Sort ascending</span>`;
    sortAsc.addEventListener("click", () => {
      this.options.onSortChange([
        { column: column.name, columnIndex, direction: "asc" },
      ]);
      menu.remove();
    });

    // Sort Descending
    const sortDesc = menu.createDiv({ cls: "ms-menu-item" });
    sortDesc.innerHTML = `${ICON_ARROW_DOWN}<span>Sort descending</span>`;
    sortDesc.addEventListener("click", () => {
      this.options.onSortChange([
        { column: column.name, columnIndex, direction: "desc" },
      ]);
      menu.remove();
    });

    menu.createDiv({ cls: "ms-menu-divider" });

    // Hide Column
    const hideItem = menu.createDiv({ cls: "ms-menu-item" });
    hideItem.innerHTML = `${ICON_EYE_OFF}<span>Hide in view</span>`;
    hideItem.addEventListener("click", () => {
      const hidden = this.options.filterState.hiddenColumnIndices || [];
      if (!hidden.includes(columnIndex)) {
        hidden.push(columnIndex);
        this.options.filterState.hiddenColumnIndices = hidden;
        this.options.onFilterChange(this.options.filterState);
        this.render();
      }
      menu.remove();
    });

    // Change Column Type Submenu
    const types = COLUMN_TYPE_DEFINITIONS;

    const typeSection = menu.createDiv({ cls: "ms-menu-section" });
    typeSection.createDiv({ cls: "ms-menu-section-title", text: "Property Type" });

    for (const t of types) {
      const typeRow = typeSection.createDiv({
        cls: `ms-menu-item ${column.type === t.type ? "is-selected" : ""}`,
      });
      typeRow.innerHTML = `<span class="ms-menu-icon">${t.icon}</span> <span>${t.label}</span> ${column.type === t.type ? `<span class="ms-check">${ICON_CHECK}</span>` : ""}`;
      typeRow.addEventListener("click", async () => {
        if (t.type === "date" && column.type !== "date") {
          const defaultFmt = column.dateFormat || this.options.settings.dateFormat || "YYYY-MM-DD";
          if (this.options.onColumnTypeChange) {
            await this.options.onColumnTypeChange(columnIndex, "date", defaultFmt);
          } else {
            column.type = "date";
            column.dateFormat = defaultFmt;
            this.render();
          }
        } else if (this.options.onColumnTypeChange) {
          await this.options.onColumnTypeChange(columnIndex, t.type);
        } else {
          column.type = t.type;
          this.render();
        }
        menu.remove();
      });
    }

    menu.createDiv({ cls: "ms-menu-divider" });

    // Insert Left
    const insertLeft = menu.createDiv({ cls: "ms-menu-item" });
    insertLeft.innerHTML = `${ICON_ARROW_LEFT}<span>Insert left</span>`;
    insertLeft.addEventListener("click", () => {
      menu.remove();
      this.openAddColumnModal(columnIndex);
    });

    // Insert Right
    const insertRight = menu.createDiv({ cls: "ms-menu-item" });
    insertRight.innerHTML = `${ICON_ARROW_RIGHT}<span>Insert right</span>`;
    insertRight.addEventListener("click", () => {
      menu.remove();
      this.openAddColumnModal(columnIndex + 1);
    });

    menu.createDiv({ cls: "ms-menu-divider" });

    // Delete Column
    const deleteItem = menu.createDiv({ cls: "ms-menu-item is-danger" });
    deleteItem.innerHTML = `${ICON_TRASH}<span>Delete property</span>`;
    deleteItem.addEventListener("click", () => {
      if (confirm(`Delete property "${column.name}"?`)) {
        this.options.onDeleteColumn(columnIndex);
      }
      menu.remove();
    });

    mountFloatingPopover({
      anchorEl: anchor,
      popoverEl: menu,
      className: "ms-col-header-menu",
      offsetTop: 2,
    });

    requestAnimationFrame(() => {
      nameInput.focus();
      nameInput.select();
    });
  }

  private openAddColumnModal(atIndex?: number): void {
    const tableEl = this.containerEl.querySelector<HTMLElement>(".ms-db-grid-table");
    if (tableEl && atIndex === undefined) {
      this.clearFocus();
      tableEl.classList.add("is-add-col-active");
    }

    const modal = new AddColumnModal({
      app: this.options.app,
      onSave: (name, type, dateFormat) => {
        this.options.onAddColumn(name, type, atIndex, dateFormat);
      },
    });

    const originalOnClose = modal.onClose.bind(modal);
    modal.onClose = () => {
      if (tableEl) {
        tableEl.classList.remove("is-add-col-active");
      }
      originalOnClose();
    };

    modal.open();
  }

  private renderCalculationBar(
    tableEl: HTMLTableElement,
    rows: MarkdownTableRow[],
    columns: TableColumn[]
  ): void {
    const tfoot = tableEl.createEl("tfoot", { cls: "ms-db-tfoot" });
    const calcRow = tfoot.createEl("tr", { cls: "ms-db-calc-tr" });

    const isRowNums = this.options.filterState.showRowNumbers !== undefined
      ? this.options.filterState.showRowNumbers
      : !!this.options.settings.showRowNumbers;

    // Spacer index cell if row numbers are visible
    if (isRowNums) {
      calcRow.createEl("td", { cls: "ms-db-td-index ms-calc-index" });
    }

    columns.forEach((col) => {
      const cIdx = col.index;
      const calcCell = calcRow.createEl("td", { cls: "ms-db-td ms-db-calc-td" });
      calcCell.dataset.colIndex = `${cIdx}`;
      const calculation = col.calculation || "none";
      const summary = calculateColumnSummary(rows, cIdx, calculation, col.type);

      if (summary) {
        calcCell.innerHTML = `<span class="ms-calc-label">${summary.label}:</span> <span class="ms-calc-val">${summary.value}</span>`;
      } else {
        calcCell.createSpan({ cls: "ms-calc-placeholder", text: "Calculate" });
      }

      calcCell.addEventListener("click", (e) => {
        e.stopPropagation();
        this.openCalculationMenu(calcCell, col);
      });
    });

    // Trailing spacer cell in calculations row
    const calcAddColTd = calcRow.createEl("td", {
      cls: "ms-db-td-spacer ms-db-td-add-col",
      attr: { title: "Add column" },
    });
    calcAddColTd.addEventListener("click", (e) => {
      e.stopPropagation();
      this.openAddColumnModal();
    });
  }

  private openCalculationMenu(anchor: HTMLElement, column: TableColumn): void {
    const menu = document.createElement("div");
    menu.className = "ms-col-header-menu ms-calc-menu";

    const calcOptions = getCalculationOptionsForColumnType(column.type);

    for (const opt of calcOptions) {
      const isSel = column.calculation === opt.value;
      const item = menu.createDiv({
        cls: `ms-menu-item ${isSel ? "is-selected" : ""}`,
      });
      item.innerHTML = `<span>${opt.label}</span> ${isSel ? `<span class="ms-check">${ICON_CHECK}</span>` : ""}`;
      item.addEventListener("click", () => {
        column.calculation = opt.value;
        this.render();
        menu.remove();
      });
    }

    mountFloatingPopover({
      anchorEl: anchor,
      popoverEl: menu,
      className: "ms-calc-menu",
      offsetTop: 2,
    });
  }

  private bindColumnResizer(resizer: HTMLElement, th: HTMLElement, column: TableColumn): void {
    let startX = 0;
    let startWidth = 0;
    let currentWidth = 0;

    const onMouseMove = (e: MouseEvent) => {
      const diff = e.clientX - startX;
      currentWidth = Math.max(60, startWidth + diff);
      th.style.width = `${currentWidth}px`;
      th.style.minWidth = `${currentWidth}px`;
    };

    const onMouseUp = () => {
      if (currentWidth > 0) {
        column.width = currentWidth;
      }
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    };

    resizer.addEventListener("mousedown", (e) => {
      e.stopPropagation();
      e.preventDefault();
      startX = e.clientX;
      startWidth = th.offsetWidth;
      document.addEventListener("mousemove", onMouseMove);
      document.addEventListener("mouseup", onMouseUp);
    });
  }
}
