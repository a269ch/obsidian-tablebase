import { isCellChecked } from "../../core/sort-engine";
import { closeAllFloatingPopovers } from "../popover";
import { CellRenderer } from "./cells";
import { TableViewContext } from "./types";

// Matches numeric keys: digits, decimal separators, or minus sign
const NUMERIC_INPUT_KEY = /^[0-9.,-]$/;

const OUTSIDE_CLICK_EXEMPT_SELECTORS = [
  ".ms-col-header-menu",
  ".ms-select-popover",
  ".ms-date-picker-popover",
];

export class KeyboardController {
  private ctx: TableViewContext;
  private cells: CellRenderer;

  constructor(ctx: TableViewContext, cells: CellRenderer) {
    this.ctx = ctx;
    this.cells = cells;
  }

  public bind(): void {
    const registry = this.ctx.registry;

    registry.listen(document, "click", (e: MouseEvent) => this.handleDocumentClick(e));
    registry.listen(this.ctx.containerEl, "keydown", (e: KeyboardEvent) =>
      this.handleKeydown(e)
    );
  }

  private handleDocumentClick(e: MouseEvent): void {
    if (!this.ctx.containerEl.isConnected) {
      this.ctx.registry.dispose();
      return;
    }

    const target = e.target as Node | null;
    if (!target) return;
    if (this.ctx.containerEl.contains(target)) return;

    const isInsideFloatingUi = OUTSIDE_CLICK_EXEMPT_SELECTORS.some((selector) =>
      Array.from(document.querySelectorAll(selector)).some((el) => el.contains(target))
    );
    if (isInsideFloatingUi) return;

    this.ctx.clearFocus();
  }

  private handleKeydown(e: KeyboardEvent): void {
    if (this.cells.isEditing) return;

    switch (e.key) {
      case "Escape":
        e.preventDefault();
        closeAllFloatingPopovers();
        this.ctx.clearFocus();
        return;
      case "ArrowUp":
        e.preventDefault();
        this.moveFocus(-1, 0);
        return;
      case "ArrowDown":
        e.preventDefault();
        this.moveFocus(1, 0);
        return;
      case "ArrowLeft":
        e.preventDefault();
        this.moveFocus(0, -1);
        return;
      case "ArrowRight":
        e.preventDefault();
        this.moveFocus(0, 1);
        return;
      case "Tab":
        e.preventDefault();
        this.moveFocus(0, e.shiftKey ? -1 : 1);
        return;
      case "Enter":
        e.preventDefault();
        this.triggerFocusedCellAction();
        return;
      default:
        this.handlePrintableKey(e);
    }
  }

  private handlePrintableKey(e: KeyboardEvent): void {
    if (e.key.length !== 1 || e.ctrlKey || e.metaKey || e.altKey) return;

    const focused = this.ctx.selection.getFocusedCell();
    if (!focused) return;

    const column = this.ctx.columns[focused.col];
    if (!column || (column.type !== "text" && column.type !== "number")) return;
    if (column.type === "number" && !NUMERIC_INPUT_KEY.test(e.key)) return;

    const td = this.findCellElement(focused.row, focused.col);
    if (!td) return;

    e.preventDefault();
    this.cells.startInlineEditing(td, focused.row, focused.col, "", e.key);
  }

  private findCellElement(row: number, col: number): HTMLElement | null {
    return this.ctx.containerEl.querySelector<HTMLElement>(
      `.ms-db-td[data-row-index="${row}"][data-col-index="${col}"]`
    );
  }

  public moveFocus(deltaRow: number, deltaCol: number): void {
    const totalRows = this.ctx.tableData.rows.length;
    const totalCols = this.ctx.columns.length;
    if (totalCols === 0) return;

    const focused = this.ctx.selection.getFocusedCell();
    if (!focused) {
      this.focusFallbackCell();
      return;
    }

    let newRow = focused.row + deltaRow;
    let newCol = focused.col + deltaCol;

    if (newCol >= totalCols) {
      newCol = 0;
      newRow++;
    } else if (newCol < 0) {
      newCol = totalCols - 1;
      newRow--;
    }

    if (newRow >= totalRows) {
      void this.ctx.actions.onAddRow().then(() => {
        this.ctx.selection.focusCell(totalRows, 0);
        this.ctx.applySelection();
      });
      return;
    }

    this.ctx.selection.focusCell(Math.max(0, newRow), newCol);
    this.ctx.applySelection();
  }

  private focusFallbackCell(): void {
    const state = this.ctx.selection.current;

    if (state.kind === "row") {
      this.ctx.selection.focusCell(state.row, 0);
    } else if (state.kind === "column") {
      this.ctx.selection.focusCell(0, state.col);
    } else {
      this.ctx.selection.focusCell(0, 0);
    }

    this.ctx.applySelection();
  }

  private triggerFocusedCellAction(): void {
    const focused = this.ctx.selection.getFocusedCell();
    if (!focused) return;

    const column = this.ctx.columns[focused.col];
    const row = this.ctx.tableData.rows[focused.row];
    if (!column || !row) return;

    const rawValue = row.cells[focused.col] || "";
    const td = this.findCellElement(focused.row, focused.col);
    if (!td) return;

    switch (column.type) {
      case "checkbox":
        void this.ctx.actions.onCellUpdate(
          focused.row,
          focused.col,
          isCellChecked(rawValue) ? "[ ]" : "[x]"
        );
        return;
      case "select":
        this.cells.openSingleSelectPopover(td, row, column, focused.col, rawValue);
        return;
      case "multi-select":
        this.cells.openTagSelectModal(row, column, focused.col, rawValue);
        return;
      case "date":
        this.cells.openDatePicker(td, focused.row, focused.col, rawValue);
        return;
      default:
        this.cells.startInlineEditing(td, focused.row, focused.col, rawValue);
    }
  }
}
