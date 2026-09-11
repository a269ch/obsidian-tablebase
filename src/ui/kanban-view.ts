import { App } from "obsidian";
import { resolveTagColor } from "../core/color-palette";
import { formatDateByOption, parseAnyDate } from "../core/date-utils";
import { evaluateFilterStateOnRow } from "../core/filter-engine";
import { isCellChecked } from "../core/sort-engine";
import { parseCellTags } from "../core/tag-parser";
import {
  DatabaseViewType,
  MarkdownTableData,
  MarkdownTableRow,
  PluginSettings,
  TableColumn,
  TableFilterState,
} from "../types";
import { appendIcon, appendIconLabel } from "../utils/dom";
import { attachStrictNumericInputHandlers, sanitizeNumericCellValue } from "../utils/input";
import { renderTextWithLinks } from "../utils/link-renderer";
import {
  ICON_CHECK_SQUARE,
  ICON_DUPLICATE,
  ICON_EDIT,
  ICON_PLUS,
  ICON_SQUARE,
  ICON_TRASH,
  ICON_TYPE_DATE,
  ICON_TYPE_SELECT,
  ICON_VIEW_BOARD,
  ICON_VIEW_TABLE,
} from "./icons";
import { DatePickerPopover } from "./modals/date-picker-popover";
import { SingleSelectPopover } from "./modals/single-select-popover";
import { TagSelectModal } from "./modals/tag-select-modal";
import { mountFloatingPopover } from "./popover";
import { createTagBadge } from "./tag-badge";
import { BoardViewActions } from "./table/types";

export interface KanbanViewOptions {
  app: App;
  sourcePath: string;
  tableData: MarkdownTableData;
  columns: TableColumn[];
  filterState: TableFilterState;
  settings: PluginSettings;
  actions: BoardViewActions;
  onSwitchView: (view: DatabaseViewType) => void;
}

const NO_STATUS_KEY = "__NO_STATUS__";
const CHECKED_GROUP = "[x]";
const UNCHECKED_GROUP = "[ ]";

export class KanbanView {
  private options: KanbanViewOptions;
  private containerEl: HTMLElement;
  private groupByColIndex: number;

  constructor(options: KanbanViewOptions) {
    this.options = options;
    this.containerEl = createDiv({ cls: "ms-kanban-container" });
    this.groupByColIndex = this.resolveInitialGroupByColumn();
  }

  private resolveInitialGroupByColumn(): number {
    const { filterState, columns } = this.options;
    const saved = filterState?.groupByColumnIndex;

    if (typeof saved === "number" && saved < columns.length) {
      return saved;
    }

    const selectColumnIdx = columns.findIndex(
      (col) => col.type === "select" || col.type === "multi-select"
    );
    if (selectColumnIdx !== -1) return selectColumnIdx;

    return columns.length > 1 ? 1 : 0;
  }

  public getElement(): HTMLElement {
    this.render();
    return this.containerEl;
  }

  public render(): void {
    this.containerEl.empty();
    this.renderToolbar();

    const groupByCol = this.options.columns[this.groupByColIndex] ?? this.options.columns[0];
    const isCheckboxGroup = groupByCol?.type === "checkbox";
    const groups = this.groupRows(groupByCol);
    const boardWrapper = this.containerEl.createDiv({ cls: "ms-kanban-board-wrapper" });

    groups.forEach((rows, groupName) => {
      this.renderColumn(boardWrapper, groupName, rows, groupByCol, isCheckboxGroup);
    });
  }

  private renderToolbar(): void {
    const topbar = this.containerEl.createDiv({ cls: "ms-db-top-bar" });
    const leftHeader = topbar.createDiv({ cls: "ms-db-header-left" });

    const tableBtn = leftHeader.createEl("button", { cls: "ms-db-view-tab-btn" });
    appendIconLabel(tableBtn, ICON_VIEW_TABLE, "Table");
    tableBtn.addEventListener("click", () => this.options.onSwitchView("table"));

    const boardBtn = leftHeader.createEl("button", {
      cls: "ms-db-view-tab-btn is-active",
    });
    appendIconLabel(boardBtn, ICON_VIEW_BOARD, "Board");
    boardBtn.addEventListener("click", () => this.options.onSwitchView("board"));

    leftHeader.createDiv({ cls: "ms-topbar-divider" });

    const groupByWrapper = leftHeader.createDiv({ cls: "ms-group-by-wrapper" });
    groupByWrapper.createSpan({ text: "Group by:" });
    const groupSelect = groupByWrapper.createEl("select", { cls: "ms-group-select" });

    for (const col of this.options.columns) {
      if (col.index === 0) continue;
      const option = groupSelect.createEl("option", {
        value: `${col.index}`,
        text: col.name,
      });
      option.selected = col.index === this.groupByColIndex;
    }

    groupSelect.addEventListener("change", (e) => {
      this.groupByColIndex = parseInt((e.target as HTMLSelectElement).value, 10);
      if (this.options.filterState) {
        this.options.filterState.groupByColumnIndex = this.groupByColIndex;
      }
      this.render();
    });
  }

  private getVisibleRows(): MarkdownTableRow[] {
    const { tableData, filterState, columns } = this.options;
    if (!filterState) return tableData.rows;
    return tableData.rows.filter((row) =>
      evaluateFilterStateOnRow(row, filterState, columns)
    );
  }

  private groupRows(groupByCol: TableColumn | undefined): Map<string, MarkdownTableRow[]> {
    const visibleRows = this.getVisibleRows();
    const groups = new Map<string, MarkdownTableRow[]>();

    if (groupByCol?.type === "checkbox") {
      groups.set(UNCHECKED_GROUP, []);
      groups.set(CHECKED_GROUP, []);

      for (const row of visibleRows) {
        const cellValue = (row.cells[this.groupByColIndex] || "").trim();
        const key = isCellChecked(cellValue) ? CHECKED_GROUP : UNCHECKED_GROUP;
        groups.get(key)?.push(row);
      }
      return groups;
    }

    const noStatusRows: MarkdownTableRow[] = [];
    const tagGroups = new Map<string, MarkdownTableRow[]>();

    for (const tag of groupByCol?.uniqueTags ?? []) {
      tagGroups.set(tag.name, []);
    }

    for (const row of visibleRows) {
      const cellValue = (row.cells[this.groupByColIndex] || "").trim();
      if (!cellValue) {
        noStatusRows.push(row);
        continue;
      }

      const tags = parseCellTags(cellValue, this.options.settings.customTagColors);
      // Strips surrounding wikilink brackets when the cell yields no parseable tags
      const key =
        tags.length > 0 ? tags[0].name : cellValue.replace(/^\[\[|\]\]$/g, "").trim();

      if (!tagGroups.has(key)) {
        tagGroups.set(key, []);
      }
      tagGroups.get(key)?.push(row);
    }

    if (noStatusRows.length > 0 || tagGroups.size === 0) {
      groups.set(NO_STATUS_KEY, noStatusRows);
    }
    tagGroups.forEach((rows, name) => groups.set(name, rows));

    return groups;
  }

  private renderColumn(
    boardWrapper: HTMLElement,
    groupName: string,
    rows: MarkdownTableRow[],
    groupByCol: TableColumn | undefined,
    isCheckboxGroup: boolean
  ): void {
    const isNoStatus = groupName === NO_STATUS_KEY;
    const colEl = boardWrapper.createDiv({ cls: "ms-kanban-column" });
    colEl.dataset.groupName = groupName;

    const colHeader = colEl.createDiv({ cls: "ms-kanban-column-header" });
    const colTitle = colHeader.createDiv({ cls: "ms-kanban-column-title" });

    if (isCheckboxGroup) {
      const isDone = groupName === CHECKED_GROUP;
      const badge = colTitle.createSpan({
        cls: `ms-kanban-prop-badge is-checkbox ${isDone ? "is-checked" : ""}`,
      });
      appendIcon(badge, isDone ? ICON_CHECK_SQUARE : ICON_SQUARE);
      badge.createSpan({ text: isDone ? "Done" : "Todo" });
    } else if (!isNoStatus) {
      colTitle.appendChild(
        createTagBadge({
          tag: {
            id: groupName,
            name: groupName,
            color: resolveTagColor(groupName, this.options.settings.customTagColors),
          },
          clickable: false,
        })
      );
    } else {
      colTitle.createSpan({
        cls: "ms-kanban-no-status-title",
        text: `No ${groupByCol ? groupByCol.name : "Status"}`,
      });
    }

    colTitle.createSpan({ cls: "ms-kanban-count-pill", text: `${rows.length}` });

    const targetValue = isCheckboxGroup ? groupName : isNoStatus ? "" : groupName;
    const cardsList = colEl.createDiv({ cls: "ms-kanban-cards-list" });

    cardsList.addEventListener("dragover", (e) => {
      e.preventDefault();
      cardsList.classList.add("is-drag-over");
    });

    cardsList.addEventListener("dragleave", () => {
      cardsList.classList.remove("is-drag-over");
    });

    cardsList.addEventListener("drop", (e) => {
      e.preventDefault();
      cardsList.classList.remove("is-drag-over");

      const rowIndex = parseInt(e.dataTransfer?.getData("text/plain") ?? "", 10);
      if (isNaN(rowIndex)) return;

      void this.options.actions.onCellUpdate(rowIndex, this.groupByColIndex, targetValue).then(() => {
        this.render();
      });
    });

    for (const row of rows) {
      this.renderCard(cardsList, row, targetValue);
    }

    const addBtn = colEl.createEl("button", { cls: "ms-kanban-bottom-add-btn" });
    appendIconLabel(addBtn, ICON_PLUS, "New");
    addBtn.addEventListener("click", () => {
      const prefilled = new Array<string>(this.options.columns.length).fill("");
      if (isCheckboxGroup || !isNoStatus) {
        prefilled[this.groupByColIndex] = groupName;
      }
      void this.options.actions.onAddRow(undefined, prefilled);
    });
  }

  private renderCard(
    cardsList: HTMLElement,
    row: MarkdownTableRow,
    targetValue: string
  ): void {
    const card = cardsList.createDiv({ cls: "ms-kanban-card" });
    card.setAttribute("draggable", "true");

    card.addEventListener("dragstart", (e) => {
      e.dataTransfer?.setData("text/plain", `${row.rowIndex}`);
      card.classList.add("is-dragging");
    });

    card.addEventListener("dragend", () => {
      card.classList.remove("is-dragging");
      this.containerEl
        .querySelectorAll(".is-card-drop-target")
        .forEach((el) => el.classList.remove("is-card-drop-target"));
    });

    card.addEventListener("dragover", (e) => {
      e.preventDefault();
      e.stopPropagation();
      card.classList.add("is-card-drop-target");
    });

    card.addEventListener("dragleave", (e) => {
      e.stopPropagation();
      card.classList.remove("is-card-drop-target");
    });

    card.addEventListener("drop", (e) => {
      e.preventDefault();
      e.stopPropagation();
      card.classList.remove("is-card-drop-target");

      const fromIndex = parseInt(e.dataTransfer?.getData("text/plain") ?? "", 10);
      if (isNaN(fromIndex)) return;

      void (async () => {
        await this.options.actions.onCellUpdate(fromIndex, this.groupByColIndex, targetValue);
        if (fromIndex !== row.rowIndex) {
          await this.options.actions.onReorderRows(fromIndex, row.rowIndex);
        }
        this.render();
      })();
    });

    const titleEl = card.createDiv({
      cls: "ms-kanban-card-title",
    });
    renderTextWithLinks(titleEl, row.cells[0] || "Untitled", {
      onExternalClick: (url, e) => {
        e.stopPropagation();
        if (typeof window !== "undefined" && url) {
          window.open(url, "_blank");
        }
      },
      onInternalClick: (path, e) => {
        e.stopPropagation();
        if (path && this.options.app?.workspace) {
          void this.options.app.workspace.openLinkText?.(path, this.options.sourcePath || "", false);
        }
      },
    });

    titleEl.addEventListener("dblclick", (e) => {
      e.stopPropagation();
      this.startTitleEdit(titleEl, row);
    });

    card.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.openCardMenu(card, titleEl, row);
    });

    this.renderCardProperties(card.createDiv({ cls: "ms-kanban-card-properties" }), row);
  }

  private startTitleEdit(titleEl: HTMLElement, row: MarkdownTableRow): void {
    titleEl.empty();

    const input = titleEl.createEl("input", {
      type: "text",
      cls: "ms-inline-cell-input",
      value: row.cells[0] || "",
    });
    input.focus();
    input.select();

    let settled = false;
    const commit = async (): Promise<void> => {
      if (settled) return;
      settled = true;
      await this.options.actions.onCellUpdate(row.rowIndex, 0, input.value);
      this.render();
    };

    input.addEventListener("blur", () => void commit());
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        void commit();
      } else if (e.key === "Escape") {
        settled = true;
        this.render();
      }
    });
  }

  private openCardMenu(
    card: HTMLElement,
    titleEl: HTMLElement,
    row: MarkdownTableRow
  ): void {
    const menu = createDiv({ cls: "ms-col-header-menu" });

    const editItem = menu.createDiv({ cls: "ms-menu-item" });
    appendIconLabel(editItem, ICON_EDIT, "Edit title");
    editItem.addEventListener("click", () => {
      menu.remove();
      this.startTitleEdit(titleEl, row);
    });

    const duplicateItem = menu.createDiv({ cls: "ms-menu-item" });
    appendIconLabel(duplicateItem, ICON_DUPLICATE, "Duplicate card");
    duplicateItem.addEventListener("click", () => {
      void this.options.actions.onAddRow(row.rowIndex + 1, [...row.cells]);
      menu.remove();
    });

    const deleteItem = menu.createDiv({ cls: "ms-menu-item is-danger" });
    appendIconLabel(deleteItem, ICON_TRASH, "Delete card");
    deleteItem.addEventListener("click", () => {
      menu.remove();
      void this.options.actions.onDeleteRow(row.rowIndex);
    });

    mountFloatingPopover({ anchorEl: card, popoverEl: menu, offsetTop: 2 });
  }

  private renderCardProperties(propsEl: HTMLElement, row: MarkdownTableRow): void {
    const { columns, filterState } = this.options;

    columns.forEach((col, colIndex) => {
      if (colIndex === 0 || colIndex === this.groupByColIndex) return;
      if (filterState?.hiddenColumnIndices?.includes(colIndex)) return;

      const cellValue = (row.cells[colIndex] || "").trim();

      switch (col.type) {
        case "multi-select":
          this.renderMultiSelectProperty(propsEl, row, col, colIndex, cellValue);
          return;
        case "select":
          this.renderSelectProperty(propsEl, row, col, colIndex, cellValue);
          return;
        case "date":
          this.renderDateProperty(propsEl, row, col, colIndex, cellValue);
          return;
        case "checkbox":
          this.renderCheckboxProperty(propsEl, row, col, colIndex, cellValue);
          return;
        default:
          if (cellValue) {
            this.renderTextProperty(propsEl, row, col, colIndex, cellValue);
          }
      }
    });
  }

  private renderMultiSelectProperty(
    propsEl: HTMLElement,
    row: MarkdownTableRow,
    col: TableColumn,
    colIndex: number,
    cellValue: string
  ): void {
    const tags = parseCellTags(cellValue, this.options.settings.customTagColors);

    if (tags.length === 0) {
      const emptyBadge = propsEl.createSpan({
        cls: "ms-kanban-prop-badge",
        text: `+ ${col.name}`,
      });
      emptyBadge.addEventListener("click", (e) => {
        e.stopPropagation();
        this.openMultiSelectModal(row.rowIndex, colIndex, col, cellValue);
      });
      return;
    }

    for (const tag of tags) {
      propsEl.appendChild(
        createTagBadge({
          tag,
          clickable: true,
          onClick: (_tag, e) => {
            e.stopPropagation();
            this.openMultiSelectModal(row.rowIndex, colIndex, col, cellValue);
          },
        })
      );
    }
  }

  private renderSelectProperty(
    propsEl: HTMLElement,
    row: MarkdownTableRow,
    col: TableColumn,
    colIndex: number,
    cellValue: string
  ): void {
    const parsed = parseCellTags(cellValue, this.options.settings.customTagColors);
    const tag = parsed[0];

    if (tag) {
      const badge = createTagBadge({
        tag,
        clickable: true,
        onClick: (_tag, e) => {
          e.stopPropagation();
          this.openSingleSelectPopover(badge, row.rowIndex, colIndex, col, cellValue);
        },
      });
      propsEl.appendChild(badge);
      return;
    }

    const badge = propsEl.createSpan({ cls: "ms-kanban-prop-badge" });
    appendIconLabel(badge, ICON_TYPE_SELECT, col.name);
    badge.addEventListener("click", (e) => {
      e.stopPropagation();
      this.openSingleSelectPopover(badge, row.rowIndex, colIndex, col, cellValue);
    });
  }

  private renderDateProperty(
    propsEl: HTMLElement,
    row: MarkdownTableRow,
    col: TableColumn,
    colIndex: number,
    cellValue: string
  ): void {
    const badge = propsEl.createSpan({ cls: "ms-kanban-prop-badge is-date" });
    const targetFormat =
      col.dateFormat ?? this.options.settings.dateFormat ?? "YYYY-MM-DD";
    const parsedDate = parseAnyDate(cellValue, targetFormat);
    const displayText = parsedDate
      ? formatDateByOption(parsedDate, targetFormat)
      : cellValue || col.name;
    appendIconLabel(badge, ICON_TYPE_DATE, displayText);
    badge.addEventListener("click", (e) => {
      e.stopPropagation();
      this.openDatePickerPopover(badge, row.rowIndex, colIndex, cellValue);
    });
  }

  private renderCheckboxProperty(
    propsEl: HTMLElement,
    row: MarkdownTableRow,
    col: TableColumn,
    colIndex: number,
    cellValue: string
  ): void {
    const isDone = isCellChecked(cellValue);
    const badge = propsEl.createSpan({
      cls: `ms-kanban-prop-badge is-checkbox ${isDone ? "is-checked" : ""}`,
    });
    appendIcon(badge, isDone ? ICON_CHECK_SQUARE : ICON_SQUARE);
    badge.createSpan({ text: col.name });

    badge.addEventListener("click", (e) => {
      e.stopPropagation();
      void this.options.actions
        .onCellUpdate(row.rowIndex, colIndex, isDone ? "[ ]" : "[x]")
        .then(() => {
          this.render();
        });
    });
  }

  private renderTextProperty(
    propsEl: HTMLElement,
    row: MarkdownTableRow,
    col: TableColumn,
    colIndex: number,
    cellValue: string
  ): void {
    const isNumber = col.type === "number";
    const badge = propsEl.createSpan({
      cls: "ms-kanban-prop-badge",
      text: `${isNumber ? "#" : ""} ${cellValue}`,
    });
    badge.setAttribute("title", col.name);

    badge.addEventListener("click", (e) => {
      e.stopPropagation();
      badge.empty();

      const input = badge.createEl("input", {
        type: "text",
        cls: `ms-inline-cell-input ${isNumber ? "is-number" : ""}`,
        value: cellValue,
      });
      input.setAttribute("autocomplete", "off");
      input.setAttribute("spellcheck", "false");

      if (isNumber) {
        attachStrictNumericInputHandlers(input);
      }
      input.focus();
      input.select();

      let settled = false;
      const commit = async (): Promise<void> => {
        if (settled) return;
        settled = true;
        const raw = input.value.trim();
        const newValue = isNumber ? sanitizeNumericCellValue(raw) : raw;
        await this.options.actions.onCellUpdate(row.rowIndex, colIndex, newValue);
        this.render();
      };

      input.addEventListener("blur", () => void commit());
      input.addEventListener("keydown", (ke) => {
        if (ke.key === "Enter") {
          ke.preventDefault();
          void commit();
        } else if (ke.key === "Escape") {
          settled = true;
          this.render();
        }
      });
    });
  }

  private openSingleSelectPopover(
    anchor: HTMLElement,
    rowIndex: number,
    colIndex: number,
    column: TableColumn,
    currentValue: string
  ): void {
    new SingleSelectPopover({
      app: this.options.app,
      anchorEl: anchor,
      columnName: column.name,
      currentValue,
      allAvailableTags: column.uniqueTags ?? [],
      settings: this.options.settings,
      onTagColorChange: async (tagName, color) => {
        this.options.settings.customTagColors[tagName.toLowerCase()] = color;
        await this.options.actions.onTagColorChange(tagName, color);
        this.render();
      },
      onSelect: async (selectedTag) => {
        await this.options.actions.onCellUpdate(rowIndex, colIndex, selectedTag);
        this.render();
      },
    }).open();
  }

  private openMultiSelectModal(
    rowIndex: number,
    colIndex: number,
    column: TableColumn,
    currentValue: string
  ): void {
    new TagSelectModal({
      app: this.options.app,
      settings: this.options.settings,
      columnName: column.name,
      currentValue,
      allAvailableTags: column.uniqueTags ?? [],
      onTagColorChange: (tagName, color) => {
        this.options.settings.customTagColors[tagName.toLowerCase()] = color;
        void this.options.actions.onTagColorChange(tagName, color);
        this.render();
      },
      onSave: (newValue) => {
        void this.options.actions.onCellUpdate(rowIndex, colIndex, newValue).then(() => {
          this.render();
        });
      },
    }).open();
  }

  private openDatePickerPopover(
    anchor: HTMLElement,
    rowIndex: number,
    colIndex: number,
    currentDate: string
  ): void {
    const col = this.options.columns[colIndex];
    new DatePickerPopover({
      app: this.options.app,
      anchorEl: anchor,
      currentDate,
      dateFormat: col?.dateFormat ?? this.options.settings.dateFormat ?? "YYYY-MM-DD",
      onSelectDate: async (newDate) => {
        await this.options.actions.onCellUpdate(rowIndex, colIndex, newDate);
        this.render();
      },
    }).open();
  }
}
