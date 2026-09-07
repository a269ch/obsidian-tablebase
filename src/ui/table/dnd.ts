import { MarkdownTableRow, TableColumn } from "../../types";
import { appendIcon } from "../../utils/dom";
import { Disposable, DisposableRegistry } from "../../utils/lifecycle";
import { ICON_GRIP } from "../icons";
import { closeAllFloatingPopovers } from "../popover";
import { TableMenus } from "./menus";
import { TableViewContext } from "./types";

const ROW_MIME_TYPE = "application/x-obsidian-table-row";
const HANDLE_HIDE_DELAY_MS = 150;
const HANDLE_HEIGHT = 24;
const MIN_COLUMN_WIDTH = 60;

const DROP_TARGET_CLASSES = [
  "is-row-drop-target-top",
  "is-row-drop-target-bottom",
  "is-row-drop-target",
];

export class RowDragController implements Disposable {
  private ctx: TableViewContext;
  private menus: TableMenus;
  private handleEl: HTMLElement;
  private gripEl: HTMLElement;
  private hoveredRowIndex: number | null = null;
  private hideTimer: Disposable | null = null;
  private draggedRowIndex: number | null = null;
  private isDragging = false;
  private tbodyEl: HTMLElement | null = null;

  constructor(ctx: TableViewContext, menus: TableMenus) {
    this.ctx = ctx;
    this.menus = menus;

    this.handleEl = createDiv({ cls: "ms-floating-row-handle" });

    this.gripEl = this.handleEl.createDiv({
      cls: "ms-row-action-btn ms-row-action-grip",
      attr: { title: "Drag to reorder row, click for options" },
    });
    appendIcon(this.gripEl, ICON_GRIP);
    this.gripEl.setAttribute("draggable", "true");

    this.bindHandleEvents();

    this.ctx.registry.add({
      dispose: () => {
        this.clearHideTimer();
        this.endRowDrag();
      },
    });
  }

  public get element(): HTMLElement {
    return this.handleEl;
  }

  public setBody(tbody: HTMLElement): void {
    this.tbodyEl = tbody;
  }

  public dispose(): void {
    this.clearHideTimer();
    this.endRowDrag();
    this.handleEl.remove();
  }

  private clearHideTimer(): void {
    this.hideTimer?.dispose();
    this.hideTimer = null;
  }

  private scheduleHide(): void {
    this.clearHideTimer();
    this.hideTimer = this.ctx.registry.timeout(() => {
      this.hideTimer = null;
      if (this.handleEl.matches(":hover")) return;
      this.handleEl.classList.remove("is-visible");
      this.hoveredRowIndex = null;
    }, HANDLE_HIDE_DELAY_MS);
  }

  private bindHandleEvents(): void {
    const registry = this.ctx.registry;

    registry.listen(this.handleEl, "mouseenter", () => this.clearHideTimer());
    registry.listen(this.handleEl, "mouseleave", () => this.scheduleHide());

    registry.listen(this.ctx.containerEl, "mouseleave", (e: MouseEvent) => {
      const related = e.relatedTarget as Node | null;
      if (related && this.handleEl.contains(related)) return;
      this.scheduleHide();
    });

    registry.listen(this.gripEl, "click", (e: MouseEvent) => {
      if (this.isDragging) return;
      e.stopPropagation();
      this.openRowMenu();
    });

    registry.listen(this.gripEl, "contextmenu", (e: MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (this.hoveredRowIndex === null) return;
      closeAllFloatingPopovers();
      this.focusHoveredRow(this.hoveredRowIndex);
      this.menus.openRowContextMenu(this.gripEl, this.hoveredRowIndex);
    });

    registry.listen(this.gripEl, "dragstart", (e: DragEvent) => {
      if (this.hoveredRowIndex === null) return;
      this.startRowDrag(e, this.hoveredRowIndex);
    });

    registry.listen(this.gripEl, "dragend", () => {
      this.endRowDrag();
    });
  }

  public get isDraggingRow(): boolean {
    return this.isDragging;
  }

  private addRowEl: HTMLElement | null = null;

  private startRowDrag(e: DragEvent, rowIndex: number): void {
    this.draggedRowIndex = rowIndex;
    this.isDragging = true;

    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", `${rowIndex}`);
      e.dataTransfer.setData(ROW_MIME_TYPE, `${rowIndex}`);
    }

    this.tbodyEl
      ?.querySelector(`tr[data-row-index="${rowIndex}"]`)
      ?.classList.add("is-dragging-row");

    document.addEventListener("dragover", this.onDocDragOver);
    document.addEventListener("drop", this.onDocDrop);
  }

  private endRowDrag(): void {
    document.removeEventListener("dragover", this.onDocDragOver);
    document.removeEventListener("drop", this.onDocDrop);
    this.tbodyEl
      ?.querySelectorAll(".is-dragging-row")
      .forEach((el) => el.classList.remove("is-dragging-row"));
    this.draggedRowIndex = null;
    this.ctx.registry.timeout(() => {
      this.isDragging = false;
    }, 50);
    this.clearDropTargetClasses();
  }

  private clearDropTargetClasses(): void {
    this.ctx.containerEl
      .querySelectorAll(`.${DROP_TARGET_CLASSES.join(", .")}`)
      .forEach((el) => el.classList.remove(...DROP_TARGET_CLASSES));
  }

  private onDocDragOver = (e: DragEvent): void => {
    if (this.draggedRowIndex === null || !this.tbodyEl) return;
    e.preventDefault();
    if (e.dataTransfer) {
      e.dataTransfer.dropEffect = "move";
    }

    const rows = Array.from(
      this.tbodyEl.querySelectorAll<HTMLTableRowElement>("tr.ms-db-tr:not(.ms-db-add-row-tr)")
    );
    if (rows.length === 0) return;

    const mouseY = e.clientY;
    let targetRow: HTMLTableRowElement | null = null;
    let isTopHalf = true;

    for (const tr of rows) {
      const rect = tr.getBoundingClientRect();
      if (mouseY >= rect.top && mouseY <= rect.bottom) {
        targetRow = tr;
        isTopHalf = mouseY < rect.top + rect.height / 2;
        break;
      }
    }

    if (!targetRow) {
      const firstRect = rows[0].getBoundingClientRect();
      const lastRect = rows[rows.length - 1].getBoundingClientRect();
      if (mouseY < firstRect.top) {
        targetRow = rows[0];
        isTopHalf = true;
      } else if (mouseY > lastRect.bottom) {
        this.clearDropTargetClasses();
        if (this.addRowEl && this.draggedRowIndex < this.ctx.tableData.rows.length - 1) {
          this.addRowEl.classList.add("is-row-drop-target-top");
        } else if (this.draggedRowIndex < this.ctx.tableData.rows.length - 1) {
          rows[rows.length - 1].classList.add("is-row-drop-target-bottom");
        }
        return;
      }
    }

    if (!targetRow) return;

    const targetRowIndexStr = targetRow.dataset.rowIndex;
    if (!targetRowIndexStr) return;
    const targetRowIndex = parseInt(targetRowIndexStr, 10);
    if (isNaN(targetRowIndex) || targetRowIndex === this.draggedRowIndex) {
      this.clearDropTargetClasses();
      return;
    }

    this.clearDropTargetClasses();
    if (this.draggedRowIndex === targetRowIndex - 1) {
      targetRow.classList.add("is-row-drop-target-bottom");
    } else if (this.draggedRowIndex === targetRowIndex + 1) {
      targetRow.classList.add("is-row-drop-target-top");
    } else {
      targetRow.classList.toggle("is-row-drop-target-top", isTopHalf);
      targetRow.classList.toggle("is-row-drop-target-bottom", !isTopHalf);
    }
  };

  private onDocDrop = (e: DragEvent): void => {
    void this.handleDocDrop(e);
  };

  private handleDocDrop = async (e: DragEvent): Promise<void> => {
    if (this.draggedRowIndex === null || !this.tbodyEl) return;
    e.preventDefault();
    e.stopPropagation();

    const fromIndex = this.draggedRowIndex;
    const mouseY = e.clientY;
    const rows = Array.from(
      this.tbodyEl.querySelectorAll<HTMLTableRowElement>("tr.ms-db-tr:not(.ms-db-add-row-tr)")
    );

    let targetRowIndex: number | null = null;
    let isTopHalf = true;

    for (const tr of rows) {
      const rect = tr.getBoundingClientRect();
      if (mouseY >= rect.top && mouseY <= rect.bottom) {
        const idx = parseInt(tr.dataset.rowIndex ?? "", 10);
        if (!isNaN(idx)) {
          targetRowIndex = idx;
          isTopHalf = mouseY < rect.top + rect.height / 2;
        }
        break;
      }
    }

    if (targetRowIndex === null && rows.length > 0) {
      const firstRect = rows[0].getBoundingClientRect();
      const lastRect = rows[rows.length - 1].getBoundingClientRect();
      if (mouseY < firstRect.top) {
        targetRowIndex = 0;
        isTopHalf = true;
      } else if (mouseY > lastRect.bottom && fromIndex < this.ctx.tableData.rows.length - 1) {
        this.endRowDrag();
        await this.menus.moveRow(fromIndex, this.ctx.tableData.rows.length - 1);
        return;
      }
    }

    this.endRowDrag();

    if (targetRowIndex !== null && targetRowIndex !== fromIndex) {
      let toIndex = this.computeDropTargetIndex(fromIndex, targetRowIndex, isTopHalf);
      toIndex = Math.max(0, Math.min(toIndex, this.ctx.tableData.rows.length - 1));
      if (toIndex === fromIndex) toIndex = targetRowIndex;
      await this.menus.moveRow(fromIndex, toIndex);
    }
  };

  private focusHoveredRow(rowIndex: number): void {
    this.ctx.selection.focusRow(rowIndex);
    this.ctx.applySelection();
  }

  private openRowMenu(): void {
    if (this.hoveredRowIndex === null) return;

    const isFocused = this.ctx.selection.isRowFocused(this.hoveredRowIndex);
    const hasOpenMenu = Boolean(document.querySelector(".ms-col-header-menu"));

    if (isFocused && hasOpenMenu) {
      closeAllFloatingPopovers();
      this.ctx.clearFocus();
      return;
    }

    closeAllFloatingPopovers();
    this.focusHoveredRow(this.hoveredRowIndex);
    this.menus.openRowContextMenu(this.gripEl, this.hoveredRowIndex);
  }

  public attachRow(tr: HTMLElement, row: MarkdownTableRow): void {
    tr.addEventListener("mouseenter", () => {
      this.clearHideTimer();
      this.hoveredRowIndex = row.rowIndex;

      const rowRect = tr.getBoundingClientRect();
      const containerRect = this.ctx.containerEl.getBoundingClientRect();
      const top = rowRect.top - containerRect.top + (rowRect.height - HANDLE_HEIGHT) / 2;
      this.handleEl.setCssStyles({ top: `${top}px` });
      this.handleEl.classList.add("is-visible");
    });

    tr.addEventListener("mouseleave", (e) => {
      const related = e.relatedTarget as Node | null;
      if (related && this.handleEl.contains(related)) return;
      this.scheduleHide();
    });

    tr.addEventListener("dragover", (e) => {
      if (this.draggedRowIndex === null) return;
      e.preventDefault();
      if (e.dataTransfer) {
        e.dataTransfer.dropEffect = "move";
      }

      if (this.draggedRowIndex === row.rowIndex) {
        tr.classList.remove("is-row-drop-target-top", "is-row-drop-target-bottom");
        return;
      }

      if (this.draggedRowIndex === row.rowIndex - 1) {
        tr.classList.remove("is-row-drop-target-top");
        tr.classList.add("is-row-drop-target-bottom");
      } else if (this.draggedRowIndex === row.rowIndex + 1) {
        tr.classList.add("is-row-drop-target-top");
        tr.classList.remove("is-row-drop-target-bottom");
      } else {
        const isTopHalf = this.isPointerInTopHalf(e, tr);
        tr.classList.toggle("is-row-drop-target-top", isTopHalf);
        tr.classList.toggle("is-row-drop-target-bottom", !isTopHalf);
      }
    });

    tr.addEventListener("dragleave", (e) => {
      const rect = tr.getBoundingClientRect();
      if (
        e.clientX >= rect.left &&
        e.clientX <= rect.right &&
        e.clientY >= rect.top &&
        e.clientY <= rect.bottom
      ) {
        return;
      }
      tr.classList.remove("is-row-drop-target-top", "is-row-drop-target-bottom");
    });

    tr.addEventListener("drop", (e) => {
      e.preventDefault();
      e.stopPropagation();
      tr.classList.remove("is-row-drop-target-top", "is-row-drop-target-bottom");
      void this.handleRowDrop(e, tr, row.rowIndex);
    });
  }

  public attachAddRowDropTarget(addRowTr: HTMLElement, totalRowCount: number): void {
    this.addRowEl = addRowTr;
    addRowTr.addEventListener("dragover", (e) => {
      if (this.draggedRowIndex === null || this.draggedRowIndex >= totalRowCount - 1) return;
      e.preventDefault();
      if (e.dataTransfer) {
        e.dataTransfer.dropEffect = "move";
      }
      addRowTr.classList.add("is-row-drop-target-top");
    });

    addRowTr.addEventListener("dragleave", () => {
      addRowTr.classList.remove("is-row-drop-target-top");
    });

    addRowTr.addEventListener("drop", (e) => {
      e.preventDefault();
      e.stopPropagation();
      addRowTr.classList.remove("is-row-drop-target-top");
      const transferred =
        e.dataTransfer?.getData(ROW_MIME_TYPE) || e.dataTransfer?.getData("text/plain") || "";
      const fromIndex = parseInt(transferred || `${this.draggedRowIndex ?? ""}`, 10);
      if (isNaN(fromIndex) || fromIndex >= totalRowCount - 1) return;
      this.endRowDrag();
      void this.menus.moveRow(fromIndex, totalRowCount - 1);
    });
  }

  private isPointerInTopHalf(e: DragEvent, tr: HTMLElement): boolean {
    const rect = tr.getBoundingClientRect();
    return e.clientY < rect.top + rect.height / 2;
  }

  private computeDropTargetIndex(
    fromIndex: number,
    targetRowIndex: number,
    isTopHalf: boolean
  ): number {
    if (fromIndex === targetRowIndex) return fromIndex;

    if (fromIndex < targetRowIndex) {
      if (targetRowIndex === fromIndex + 1) {
        return targetRowIndex;
      }
      return isTopHalf ? targetRowIndex - 1 : targetRowIndex;
    }

    if (targetRowIndex === fromIndex - 1) {
      return targetRowIndex;
    }
    return isTopHalf ? targetRowIndex : targetRowIndex + 1;
  }

  private async handleRowDrop(
    e: DragEvent,
    tr: HTMLElement,
    targetRowIndex: number
  ): Promise<void> {
    const transferred =
      e.dataTransfer?.getData(ROW_MIME_TYPE) || e.dataTransfer?.getData("text/plain") || "";
    const fromIndex = parseInt(transferred || `${this.draggedRowIndex ?? ""}`, 10);
    if (isNaN(fromIndex) || fromIndex === targetRowIndex) return;

    const isTopHalf = this.isPointerInTopHalf(e, tr);
    let toIndex = this.computeDropTargetIndex(fromIndex, targetRowIndex, isTopHalf);

    toIndex = Math.max(0, Math.min(toIndex, this.ctx.tableData.rows.length - 1));
    if (toIndex === fromIndex) {
      toIndex = targetRowIndex;
    }
    if (toIndex === fromIndex) return;

    await this.menus.moveRow(fromIndex, toIndex);
  }
}

export class ColumnDragController {
  private ctx: TableViewContext;
  private draggedColumnIndex: number | null = null;
  private suppressClickUntilDragEnds = false;

  constructor(ctx: TableViewContext) {
    this.ctx = ctx;
  }

  public get isDragging(): boolean {
    return this.suppressClickUntilDragEnds;
  }

  public attachHeader(th: HTMLElement, columnIndex: number, headerRow: HTMLElement): void {
    th.setAttribute("draggable", "true");

    th.addEventListener("dragstart", (e) => {
      this.draggedColumnIndex = columnIndex;
      this.suppressClickUntilDragEnds = true;
      if (e.dataTransfer) {
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/col", `${columnIndex}`);
        e.dataTransfer.setData("text/plain", `${columnIndex}`);
      }
      th.classList.add("is-dragging-col");
    });

    th.addEventListener("dragend", () => {
      th.classList.remove("is-dragging-col");
      this.draggedColumnIndex = null;
      this.ctx.registry.timeout(() => {
        this.suppressClickUntilDragEnds = false;
      }, 100);
      headerRow
        .querySelectorAll(".is-col-drop-target")
        .forEach((el) => el.classList.remove("is-col-drop-target"));
    });

    th.addEventListener("dragover", (e) => {
      if (this.draggedColumnIndex === null || this.draggedColumnIndex === columnIndex) return;
      e.preventDefault();
      if (e.dataTransfer) {
        e.dataTransfer.dropEffect = "move";
      }
      th.classList.add("is-col-drop-target");
    });

    th.addEventListener("dragleave", () => {
      th.classList.remove("is-col-drop-target");
    });

    th.addEventListener("drop", (e) => {
      th.classList.remove("is-col-drop-target");
      if (this.draggedColumnIndex === null || this.draggedColumnIndex === columnIndex) return;
      e.preventDefault();
      const fromIndex = this.draggedColumnIndex;
      this.draggedColumnIndex = null;
      void this.ctx.actions.onReorderColumns(fromIndex, columnIndex);
    });
  }
}

export function bindColumnResizer(
  registry: DisposableRegistry,
  resizer: HTMLElement,
  th: HTMLElement,
  column: TableColumn
): void {
  let startX = 0;
  let startWidth = 0;
  let currentWidth = 0;
  const dragRegistry = registry.add(new DisposableRegistry());

  const stopResize = (): void => {
    if (currentWidth > 0) {
      column.width = currentWidth;
    }
    dragRegistry.disposeAll();
  };

  resizer.addEventListener("mousedown", (e) => {
    e.stopPropagation();
    e.preventDefault();

    startX = e.clientX;
    startWidth = th.offsetWidth;
    currentWidth = startWidth;
    dragRegistry.disposeAll();

    dragRegistry.listen(document, "mousemove", (moveEvent: MouseEvent) => {
      currentWidth = Math.max(MIN_COLUMN_WIDTH, startWidth + (moveEvent.clientX - startX));
      th.setCssStyles({
        width: `${currentWidth}px`,
        minWidth: `${currentWidth}px`,
        maxWidth: `${currentWidth}px`,
      });
    });

    dragRegistry.listen(document, "mouseup", stopResize);
  });
}
