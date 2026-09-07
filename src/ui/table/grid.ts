import { calculateColumnSummary } from "../../core/calculation-engine";
import { evaluateFilterStateOnRow } from "../../core/filter-engine";
import { sortRowsByRules } from "../../core/sort-engine";
import { MarkdownTableRow, TableColumn } from "../../types";
import { appendIcon, appendIconLabel, setFixedWidth } from "../../utils/dom";
import {
  getColumnTypeIcon,
  ICON_ARROW_DOWN,
  ICON_ARROW_UP,
  ICON_PLUS,
  ICON_TYPE_NUMBER,
} from "../icons";
import { closeAllFloatingPopovers } from "../popover";
import { CellRenderer, resolveColumnAlignment } from "./cells";
import { bindColumnResizer, ColumnDragController, RowDragController } from "./dnd";
import { TableMenus } from "./menus";
import { TableViewContext } from "./types";

const ADD_COLUMN_WIDTH = 28;

export class TableGrid {
  private ctx: TableViewContext;
  private menus: TableMenus;
  private cells: CellRenderer;
  private rowDrag: RowDragController;
  private columnDrag: ColumnDragController;
  private openAddColumnModal: (atIndex?: number) => void;

  private tableEl: HTMLTableElement | null = null;
  private tbodyEl: HTMLTableSectionElement | null = null;

  constructor(
    ctx: TableViewContext,
    menus: TableMenus,
    cells: CellRenderer,
    rowDrag: RowDragController,
    openAddColumnModal: (atIndex?: number) => void
  ) {
    this.ctx = ctx;
    this.menus = menus;
    this.cells = cells;
    this.rowDrag = rowDrag;
    this.columnDrag = new ColumnDragController(ctx);
    this.openAddColumnModal = openAddColumnModal;
  }

  public getVisibleRows(): MarkdownTableRow[] {
    const { tableData, filterState, columns } = this.ctx;
    const filtered = tableData.rows.filter((row) =>
      evaluateFilterStateOnRow(row, filterState, columns)
    );
    return sortRowsByRules(filtered, filterState.sortRules ?? [], columns);
  }

  public render(container: HTMLElement): void {
    const scrollWrapper = container.createDiv({ cls: "ms-db-table-scroll-wrapper" });

    scrollWrapper.addEventListener("click", (e) => {
      if (e.target !== scrollWrapper) return;
      closeAllFloatingPopovers();
      this.ctx.clearFocus();
    });

    const { settings } = this.ctx;
    const showRowNumbers = this.ctx.isRowNumbersVisible();

    const tableEl = scrollWrapper.createEl("table", {
      cls: [
        "ms-db-grid-table",
        settings.stickyFirstColumn ? "is-sticky-first" : "",
        showRowNumbers ? "has-row-numbers" : "no-row-numbers",
      ]
        .filter((token) => token.length > 0)
        .join(" "),
    });
    this.tableEl = tableEl;

    tableEl.addEventListener("mouseover", (e) => {
      const target = e.target as HTMLElement | null;
      const isOverAddColumn = Boolean(
        target?.closest(".ms-db-th-add-col, .ms-db-td-add-col")
      );
      tableEl.classList.toggle("is-add-col-hovered", isOverAddColumn);
    });

    tableEl.addEventListener("mouseleave", () => {
      tableEl.classList.remove("is-add-col-hovered");
    });

    this.renderHead(tableEl, showRowNumbers);

    this.tbodyEl = tableEl.createEl("tbody");
    this.rowDrag.setBody(this.tbodyEl);
    this.renderBody();
  }

  public get tableElement(): HTMLTableElement | null {
    return this.tableEl;
  }

  private renderHead(tableEl: HTMLTableElement, showRowNumbers: boolean): void {
    const thead = tableEl.createEl("thead");
    const headerRow = thead.createEl("tr");

    if (showRowNumbers) {
      this.renderIndexHeader(headerRow);
    }

    this.ctx.getVisibleColumns().forEach((col, orderIndex) => {
      this.renderColumnHeader(headerRow, col, orderIndex);
    });

    this.renderAddColumnHeader(headerRow);
  }

  private renderIndexHeader(headerRow: HTMLTableRowElement): void {
    const indexTh = headerRow.createEl("th", { cls: "ms-db-th-index" });
    const content = indexTh.createDiv({
      cls: "ms-db-th-content ms-db-th-index-content",
    });
    appendIcon(
      content.createSpan({ cls: "ms-db-type-icon ms-db-th-index-icon" }),
      ICON_TYPE_NUMBER
    );
    indexTh.setAttribute("title", "Row numbers (Right-click to hide)");

    const openMenu = (e: Event): void => {
      e.preventDefault();
      e.stopPropagation();
      closeAllFloatingPopovers();
      this.ctx.clearFocus();
      this.menus.openIndexHeaderMenu(indexTh);
    };

    indexTh.addEventListener("contextmenu", openMenu);
    indexTh.addEventListener("click", openMenu);
  }

  private renderColumnHeader(
    headerRow: HTMLTableRowElement,
    col: TableColumn,
    orderIndex: number
  ): void {
    const columnIndex = col.index;
    const th = headerRow.createEl("th", { cls: "ms-db-th" });
    th.dataset.colIndex = `${columnIndex}`;
    th.classList.add("is-align-left");
    if (col.type === "checkbox") {
      th.classList.add("is-col-type-checkbox");
    }

    if (orderIndex === 0) {
      th.classList.add("is-first-data-col");
    }
    if (this.ctx.selection.isColumnHighlighted(columnIndex)) {
      th.classList.add("is-col-focused");
    }
    if (col.width) {
      th.setCssStyles({
        width: `${col.width}px`,
        minWidth: `${col.width}px`,
      });
    }

    this.columnDrag.attachHeader(th, columnIndex, headerRow);

    const headerContent = th.createDiv({ cls: "ms-db-th-content" });
    appendIcon(
      headerContent.createSpan({ cls: "ms-db-type-icon" }),
      getColumnTypeIcon(col.type)
    );

    const colNameSpan = headerContent.createSpan({
      cls: "ms-db-col-name",
      text: col.name,
    });
    colNameSpan.addEventListener("dblclick", (e) => {
      e.stopPropagation();
      e.preventDefault();
      this.menus.openRenameModal(col, columnIndex);
    });

    const activeSort = this.ctx.filterState.sortRules?.find(
      (rule) => rule.columnIndex === columnIndex
    );
    if (activeSort) {
      appendIcon(
        headerContent.createSpan({ cls: "ms-db-sort-indicator" }),
        activeSort.direction === "asc" ? ICON_ARROW_UP : ICON_ARROW_DOWN
      );
    }

    th.addEventListener("click", (e) => {
      if (this.columnDrag.isDragging) return;
      e.stopPropagation();
      this.toggleColumnMenu(th, col, columnIndex);
    });

    th.addEventListener("contextmenu", (e) => {
      if (this.columnDrag.isDragging) return;
      e.preventDefault();
      e.stopPropagation();
      closeAllFloatingPopovers();
      this.ctx.selection.focusColumn(columnIndex);
      this.ctx.applySelection();
      this.menus.openColumnHeaderMenu(th, col, columnIndex);
    });

    const resizer = th.createDiv({ cls: "ms-col-resizer" });
    bindColumnResizer(this.ctx.registry, resizer, th, col);
  }

  private toggleColumnMenu(
    th: HTMLElement,
    col: TableColumn,
    columnIndex: number
  ): void {
    const isFocused = this.ctx.selection.isColumnFocused(columnIndex);
    const hasOpenMenu = Boolean(document.querySelector(".ms-col-header-menu"));

    if (isFocused && hasOpenMenu) {
      closeAllFloatingPopovers();
      this.ctx.clearFocus();
      return;
    }

    closeAllFloatingPopovers();
    this.ctx.selection.focusColumn(columnIndex);
    this.ctx.applySelection();
    this.menus.openColumnHeaderMenu(th, col, columnIndex);
  }

  private renderAddColumnHeader(headerRow: HTMLTableRowElement): void {
    const addColTh = headerRow.createEl("th", {
      cls: "ms-db-th-add-col",
      attr: { title: "Add column" },
    });
    setFixedWidth(addColTh, ADD_COLUMN_WIDTH);

    const content = addColTh.createDiv({
      cls: "ms-db-th-content ms-db-th-add-col-content",
    });
    const iconSpan = content.createSpan({
      cls: "ms-db-type-icon ms-db-th-add-col-icon ms-db-add-col-btn",
    });
    appendIcon(iconSpan, ICON_PLUS);

    addColTh.addEventListener("click", (e) => {
      e.stopPropagation();
      this.openAddColumnModal();
    });
  }

  public renderBody(): void {
    const tbody = this.tbodyEl;
    const tableEl = this.tableEl;
    if (!tbody || !tableEl) return;

    tbody.empty();
    tableEl.querySelector("tfoot")?.remove();

    const visibleRows = this.getVisibleRows();
    const visibleColumns = this.ctx.getVisibleColumns();
    const showRowNumbers = this.ctx.isRowNumbersVisible();

    for (const row of visibleRows) {
      this.renderRow(tbody, row, visibleColumns, showRowNumbers);
    }

    this.renderAddRow(tbody, visibleColumns.length, showRowNumbers, visibleRows.length);

    const hasActiveCalculations = this.ctx.columns.some(
      (col) => col.calculation && col.calculation !== "none"
    );
    if (
      this.ctx.settings.enableCalculations &&
      hasActiveCalculations &&
      visibleColumns.length > 0
    ) {
      this.renderCalculationBar(tableEl, visibleRows, visibleColumns, showRowNumbers);
    }

    this.ctx.applySelection();
  }

  private renderRow(
    tbody: HTMLTableSectionElement,
    row: MarkdownTableRow,
    visibleColumns: TableColumn[],
    showRowNumbers: boolean
  ): void {
    const tr = tbody.createEl("tr", { cls: "ms-db-tr" });
    tr.dataset.rowIndex = `${row.rowIndex}`;

    this.rowDrag.attachRow(tr, row);

    if (showRowNumbers) {
      this.renderIndexCell(tr, row);
    }

    visibleColumns.forEach((col, orderIndex) => {
      this.renderDataCell(tr, row, col, orderIndex);
    });

    const addColTd = tr.createEl("td", {
      cls: "ms-db-td-spacer ms-db-td-add-col",
      attr: { title: "Add column" },
    });
    setFixedWidth(addColTd, ADD_COLUMN_WIDTH);
    addColTd.addEventListener("click", (e) => {
      e.stopPropagation();
      this.openAddColumnModal();
    });
  }

  private renderIndexCell(tr: HTMLTableRowElement, row: MarkdownTableRow): void {
    const indexTd = tr.createEl("td", { cls: "ms-db-td-index" });
    indexTd.createSpan({ cls: "ms-row-num-text", text: `${row.rowIndex + 1}` });
    indexTd.setAttribute("title", "Click to select row, right-click for options");

    indexTd.addEventListener("click", (e) => {
      if (this.rowDrag.isDraggingRow) return;
      e.stopPropagation();
      closeAllFloatingPopovers();

      if (this.ctx.selection.isRowFocused(row.rowIndex)) {
        this.ctx.clearFocus();
        return;
      }
      this.ctx.selection.focusRow(row.rowIndex);
      this.ctx.applySelection();
    });

    indexTd.addEventListener("contextmenu", (e) => {
      if (this.rowDrag.isDraggingRow) return;
      e.preventDefault();
      e.stopPropagation();
      closeAllFloatingPopovers();
      this.ctx.selection.focusRow(row.rowIndex);
      this.ctx.applySelection();
      this.menus.openRowContextMenu(indexTd, row.rowIndex);
    });
  }

  private renderDataCell(
    tr: HTMLTableRowElement,
    row: MarkdownTableRow,
    col: TableColumn,
    orderIndex: number
  ): void {
    const columnIndex = col.index;
    const td = tr.createEl("td", { cls: "ms-db-td" });
    td.dataset.rowIndex = `${row.rowIndex}`;
    td.dataset.colIndex = `${columnIndex}`;
    td.classList.add(`is-align-${resolveColumnAlignment(col)}`);

    if (orderIndex === 0) {
      td.classList.add("is-first-data-col");
    }

    td.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      e.stopPropagation();
      closeAllFloatingPopovers();
      this.ctx.selection.focusCell(row.rowIndex, columnIndex);
      this.ctx.applySelection();
      this.menus.openCellContextMenu(td, row.rowIndex, columnIndex, col);
    });

    this.cells.render(td, row, col, columnIndex);
  }

  private renderAddRow(
    tbody: HTMLTableSectionElement,
    visibleColumnCount: number,
    showRowNumbers: boolean,
    totalRowCount: number
  ): void {
    const addRowTr = tbody.createEl("tr", { cls: "ms-db-tr ms-db-add-row-tr" });
    this.rowDrag.attachAddRowDropTarget(addRowTr, totalRowCount);

    if (showRowNumbers) {
      addRowTr.createEl("td", { cls: "ms-db-td-index ms-db-add-row-index-td" });
    }

    const addRowTd = addRowTr.createEl("td", {
      cls: `ms-db-td ms-db-add-row-td ${!showRowNumbers ? "is-first-data-col" : ""}`,
      attr: { colspan: `${visibleColumnCount + 1}` },
    });

    const addRowBtn = addRowTd.createEl("button", { cls: "ms-db-add-row-btn" });
    appendIconLabel(addRowBtn, ICON_PLUS, "New");
    addRowBtn.addEventListener("click", () => {
      void this.ctx.actions.onAddRow();
    });
  }

  private renderCalculationBar(
    tableEl: HTMLTableElement,
    rows: MarkdownTableRow[],
    columns: TableColumn[],
    showRowNumbers: boolean
  ): void {
    const tfoot = tableEl.createEl("tfoot", { cls: "ms-db-tfoot" });
    const calcRow = tfoot.createEl("tr", { cls: "ms-db-calc-tr" });

    if (showRowNumbers) {
      calcRow.createEl("td", { cls: "ms-db-td-index ms-calc-index" });
    }

    columns.forEach((col, orderIndex) => {
      const calcCell = calcRow.createEl("td", { cls: "ms-db-td ms-db-calc-td" });
      calcCell.dataset.colIndex = `${col.index}`;
      calcCell.classList.add(`is-align-${resolveColumnAlignment(col)}`);

      if (orderIndex === 0) {
        calcCell.classList.add("is-first-data-col");
      }

      const summary = calculateColumnSummary(
        rows,
        col.index,
        col.calculation || "none",
        col.type
      );

      if (summary) {
        calcCell.createSpan({ cls: "ms-calc-label", text: `${summary.label}:` });
        calcCell.createSpan({ cls: "ms-calc-val", text: summary.value });
      } else {
        calcCell.createSpan({ cls: "ms-calc-placeholder", text: "Calculate" });
      }

      calcCell.addEventListener("click", (e) => {
        e.stopPropagation();
        this.menus.openCalculationMenu(calcCell, col);
      });
    });

    const calcAddColTd = calcRow.createEl("td", {
      cls: "ms-db-td-spacer ms-db-td-add-col",
      attr: { title: "Add column" },
    });
    setFixedWidth(calcAddColTd, ADD_COLUMN_WIDTH);
    calcAddColTd.addEventListener("click", (e) => {
      e.stopPropagation();
      this.openAddColumnModal();
    });
  }
}
