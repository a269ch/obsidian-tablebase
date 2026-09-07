import { formatDateByOption, parseAnyDate } from "../../core/date-utils";
import { isCellChecked } from "../../core/sort-engine";
import { parseCellTags } from "../../core/tag-parser";
import { ColumnAlignment, MarkdownTableRow, TableColumn } from "../../types";
import { appendIcon } from "../../utils/dom";
import { attachStrictNumericInputHandlers, sanitizeNumericCellValue } from "../../utils/input";
import { ICON_TYPE_DATE } from "../icons";
import { DatePickerPopover } from "../modals/date-picker-popover";
import { SingleSelectPopover } from "../modals/single-select-popover";
import { TagSelectModal } from "../modals/tag-select-modal";
import { closeAllFloatingPopovers } from "../popover";
import { createTagBadge } from "../tag-badge";
import { TableViewContext } from "./types";

export function isNumericCell(val: string): boolean {
  const trimmed = val.trim();
  if (!trimmed || trimmed === "-") return false;
  return /^[+-]?\$?\d+([.,]\d+)?%?$/.test(trimmed);
}

export function resolveColumnAlignment(col: TableColumn): ColumnAlignment {
  if (col.type === "checkbox") return "center";
  if (col.align) return col.align;
  if (col.type === "number") return "right";
  return "left";
}

export class CellRenderer {
  private ctx: TableViewContext;
  private editingCell: { row: number; col: number } | null = null;
  public onTabCommit?: (shiftKey: boolean) => void;

  constructor(ctx: TableViewContext) {
    this.ctx = ctx;
  }

  public get isEditing(): boolean {
    return this.editingCell !== null;
  }

  public render(
    td: HTMLElement,
    row: MarkdownTableRow,
    col: TableColumn,
    colIndex: number
  ): void {
    const rawValue = row.cells[colIndex] || "";

    switch (col.type) {
      case "checkbox":
        this.renderCheckbox(td, row, colIndex, rawValue);
        break;
      case "date":
        this.renderDate(td, row, col, colIndex, rawValue);
        break;
      case "select":
        this.renderSingleSelect(td, row, col, colIndex, rawValue);
        break;
      case "multi-select":
        this.renderMultiSelect(td, row, col, colIndex, rawValue);
        break;
      default:
        this.renderText(td, row, col, colIndex, rawValue);
        break;
    }
  }

  private focusCell(row: number, col: number): void {
    closeAllFloatingPopovers();
    this.ctx.selection.focusCell(row, col);
    this.ctx.applySelection();
  }

  private renderCheckbox(
    td: HTMLElement,
    row: MarkdownTableRow,
    colIndex: number,
    rawValue: string
  ): void {
    const wrapper = td.createDiv({ cls: "ms-cell-checkbox-wrapper" });
    const checkbox = wrapper.createEl("input", {
      type: "checkbox",
      cls: "ms-notion-checkbox",
    });
    checkbox.checked = isCellChecked(rawValue);

    checkbox.addEventListener("change", (e) => {
      this.focusCell(row.rowIndex, colIndex);
      const newValue = (e.target as HTMLInputElement).checked ? "[x]" : "[ ]";
      void this.ctx.actions.onCellUpdate(row.rowIndex, colIndex, newValue);
    });

    td.addEventListener("click", () => this.focusCell(row.rowIndex, colIndex));
  }

  private renderDate(
    td: HTMLElement,
    row: MarkdownTableRow,
    col: TableColumn,
    colIndex: number,
    rawValue: string
  ): void {
    const wrapper = td.createDiv({ cls: "ms-cell-date-wrapper" });

    if (rawValue.trim()) {
      appendIcon(wrapper.createSpan({ cls: "ms-date-icon" }), ICON_TYPE_DATE);
      const targetFormat =
        col.dateFormat ?? this.ctx.settings.dateFormat ?? "YYYY-MM-DD";
      const parsedDate = parseAnyDate(rawValue, targetFormat);
      const displayText = parsedDate
        ? formatDateByOption(parsedDate, targetFormat)
        : rawValue;
      wrapper.createSpan({ cls: "ms-date-text", text: displayText });
    } else {
      wrapper.createSpan({ cls: "ms-cell-empty-placeholder", text: "Empty" });
    }

    td.addEventListener("click", () => {
      this.focusCell(row.rowIndex, colIndex);
      this.openDatePicker(td, row.rowIndex, colIndex, rawValue);
    });
  }

  private renderSingleSelect(
    td: HTMLElement,
    row: MarkdownTableRow,
    col: TableColumn,
    colIndex: number,
    rawValue: string
  ): void {
    const tags = parseCellTags(rawValue, this.ctx.settings.customTagColors);
    const container = td.createDiv({ cls: "ms-cell-badges-container is-single-select" });

    if (tags.length === 0) {
      container.createSpan({ cls: "ms-cell-empty-placeholder", text: "Empty" });
    } else {
      container.appendChild(
        createTagBadge({
          tag: tags[0],
          clickable: true,
          onClick: () => {
            this.focusCell(row.rowIndex, colIndex);
            this.openSingleSelectPopover(td, row, col, colIndex, rawValue);
          },
        })
      );
    }

    td.addEventListener("click", () => {
      this.focusCell(row.rowIndex, colIndex);
      this.openSingleSelectPopover(td, row, col, colIndex, rawValue);
    });
  }

  private renderMultiSelect(
    td: HTMLElement,
    row: MarkdownTableRow,
    col: TableColumn,
    colIndex: number,
    rawValue: string
  ): void {
    const tags = parseCellTags(rawValue, this.ctx.settings.customTagColors);
    const container = td.createDiv({ cls: "ms-cell-badges-container" });

    if (tags.length === 0) {
      container.createSpan({ cls: "ms-cell-empty-placeholder", text: "Empty" });
    } else {
      for (const tag of tags) {
        container.appendChild(
          createTagBadge({
            tag,
            clickable: true,
            onClick: () => {
              this.focusCell(row.rowIndex, colIndex);
              this.openTagSelectModal(row, col, colIndex, rawValue);
            },
          })
        );
      }
    }

    td.addEventListener("click", () => {
      this.focusCell(row.rowIndex, colIndex);
      this.openTagSelectModal(row, col, colIndex, rawValue);
    });
  }

  private renderText(
    td: HTMLElement,
    row: MarkdownTableRow,
    col: TableColumn,
    colIndex: number,
    rawValue: string
  ): void {
    const isNumber = col.type === "number" || isNumericCell(rawValue);
    const wrapper = td.createDiv({
      cls: `ms-cell-text-wrapper ${isNumber ? "is-number" : ""}`,
    });
    wrapper.textContent = rawValue;

    td.addEventListener("click", () => this.focusCell(row.rowIndex, colIndex));
    td.addEventListener("dblclick", () => {
      this.startInlineEditing(td, row.rowIndex, colIndex, rawValue);
    });
  }

  public openDatePicker(
    anchor: HTMLElement,
    rowIndex: number,
    colIndex: number,
    currentValue: string
  ): void {
    const col = this.ctx.columns[colIndex];
    new DatePickerPopover({
      app: this.ctx.app,
      anchorEl: anchor,
      currentDate: currentValue,
      dateFormat: col?.dateFormat ?? this.ctx.settings.dateFormat ?? "YYYY-MM-DD",
      onSelectDate: async (newDate) => {
        await this.ctx.actions.onCellUpdate(rowIndex, colIndex, newDate);
        this.ctx.render();
      },
    }).open();
  }

  public openSingleSelectPopover(
    anchor: HTMLElement,
    row: MarkdownTableRow,
    col: TableColumn,
    colIndex: number,
    currentValue: string
  ): void {
    new SingleSelectPopover({
      app: this.ctx.app,
      anchorEl: anchor,
      columnName: col.name,
      currentValue,
      allAvailableTags: col.uniqueTags ?? [],
      settings: this.ctx.settings,
      onTagColorChange: async (tagName, color) => {
        this.ctx.settings.customTagColors[tagName.toLowerCase()] = color;
        await this.ctx.actions.onTagColorChange(tagName, color);
        this.ctx.render();
      },
      onSelect: async (selectedTag) => {
        await this.ctx.actions.onCellUpdate(row.rowIndex, colIndex, selectedTag);
        this.ctx.render();
      },
    }).open();
  }

  public openTagSelectModal(
    row: MarkdownTableRow,
    col: TableColumn,
    colIndex: number,
    currentValue: string
  ): void {
    new TagSelectModal({
      app: this.ctx.app,
      settings: this.ctx.settings,
      columnName: col.name,
      currentValue,
      allAvailableTags: col.uniqueTags ?? [],
      onTagColorChange: (tagName, color) => {
        this.ctx.settings.customTagColors[tagName.toLowerCase()] = color;
        void this.ctx.actions.onTagColorChange(tagName, color);
        this.ctx.render();
      },
      onSave: (formattedText) => {
        void this.ctx.actions.onCellUpdate(row.rowIndex, colIndex, formattedText).then(() => {
          this.ctx.render();
        });
      },
    }).open();
  }

  public startInlineEditing(
    td: HTMLElement,
    rowIndex: number,
    colIndex: number,
    currentValue: string,
    initialChar?: string
  ): void {
    this.editingCell = { row: rowIndex, col: colIndex };
    td.empty();
    td.classList.add("is-editing");

    const col = this.ctx.columns[colIndex];
    const isNumber = col?.type === "number" || isNumericCell(currentValue);
    const alignment = col ? resolveColumnAlignment(col) : (isNumber ? "right" : "left");

    const input = td.createEl("input", {
      type: "text",
      cls: `ms-inline-cell-input is-align-${alignment} ${isNumber ? "is-number" : ""}`,
      value: initialChar ?? currentValue,
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

    let settled = false;

    const commit = async (): Promise<void> => {
      if (settled) return;
      settled = true;

      const rawValue = input.value.trim();
      const newValue = isNumber ? sanitizeNumericCellValue(rawValue) : rawValue;

      this.editingCell = null;
      td.classList.remove("is-editing");
      await this.ctx.actions.onCellUpdate(rowIndex, colIndex, newValue);
      this.ctx.render();
    };

    const cancel = (): void => {
      if (settled) return;
      settled = true;
      this.editingCell = null;
      td.classList.remove("is-editing");
      this.ctx.render();
    };

    input.addEventListener("blur", () => {
      void commit();
    });

    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        void commit();
      } else if (e.key === "Escape") {
        e.preventDefault();
        cancel();
      } else if (e.key === "Tab") {
        e.preventDefault();
        const { shiftKey } = e;
        void commit().then(() => this.onTabCommit?.(shiftKey));
      }
    });
  }
}
