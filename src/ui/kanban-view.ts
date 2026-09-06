import { App } from "obsidian";
import { evaluateFilterStateOnRow } from "../core/filter-engine";
import { parseCellTags } from "../core/tag-parser";
import { isCellChecked } from "../core/sort-engine";
import {
  MarkdownTableData,
  MarkdownTableRow,
  PluginSettings,
  TableColumn,
  TableFilterState,
} from "../types";
import { createTagBadge } from "./tag-badge";
import { mountFloatingPopover } from "./popover-utils";
import { attachStrictNumericInputHandlers, sanitizeNumericCellValue } from "./input-utils";
import { DatePickerPopover } from "./date-picker-modal";
import { SingleSelectPopover } from "./single-select-popover";
import { TagSelectModal } from "./tag-select-modal";
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

export interface KanbanViewOptions {
  app: App;
  tableData: MarkdownTableData;
  columns: TableColumn[];
  filterState: TableFilterState;
  settings: PluginSettings;
  onCellUpdate: (rowIndex: number, colIndex: number, newValue: string) => Promise<void>;
  onAddRow: (atIndex?: number, prefilledCells?: string[]) => Promise<void>;
  onDeleteRow: (rowIndex: number) => Promise<void>;
  onReorderRows?: (fromIndex: number, toIndex: number) => Promise<void>;
  onSwitchView: (view: "table" | "board") => void;
}

export class KanbanView {
  private options: KanbanViewOptions;
  private containerEl: HTMLElement;
  private groupByColIndex: number = 1;

  constructor(options: KanbanViewOptions) {
    this.options = options;
    this.containerEl = document.createElement("div");
    this.containerEl.className = "ms-kanban-container";

    // Auto-detect group-by column (prefer select/multi-select column, fallback to col 1)
    const selectColIdx = options.columns.findIndex(
      (c) => c.type === "select" || c.type === "multi-select"
    );
    if (selectColIdx !== -1) {
      this.groupByColIndex = selectColIdx;
    } else if (options.columns.length > 1) {
      this.groupByColIndex = 1;
    }
  }

  public getElement(): HTMLElement {
    this.render();
    return this.containerEl;
  }

  public render(): void {
    this.containerEl.empty();

    const { tableData, columns, filterState, settings } = this.options;
    const groupByCol = columns[this.groupByColIndex] || columns[0];

    // 1. Kanban Header Toolbar
    const topbar = this.containerEl.createDiv({ cls: "ms-db-top-bar" });

    // Left Header: View Switcher & Group By
    const leftHeader = topbar.createDiv({ cls: "ms-db-header-left" });

    const tableBtn = leftHeader.createEl("button", {
      cls: "ms-db-view-tab-btn",
    });
    tableBtn.innerHTML = `${ICON_VIEW_TABLE}<span>Table</span>`;
    tableBtn.addEventListener("click", () => this.options.onSwitchView("table"));

    const boardBtn = leftHeader.createEl("button", {
      cls: "ms-db-view-tab-btn is-active",
    });
    boardBtn.innerHTML = `${ICON_VIEW_BOARD}<span>Board</span>`;
    boardBtn.addEventListener("click", () => this.options.onSwitchView("board"));

    leftHeader.createDiv({ cls: "ms-topbar-divider" });

    // Group By Selector
    const groupByGroup = leftHeader.createDiv({ cls: "ms-group-by-wrapper" });
    groupByGroup.createSpan({ text: "Group by:" });
    const groupSelect = groupByGroup.createEl("select", { cls: "ms-group-select" });

    columns.forEach((col) => {
      const opt = groupSelect.createEl("option", {
        value: `${col.index}`,
        text: col.name,
      });
      if (col.index === this.groupByColIndex) {
        opt.selected = true;
      }
    });

    groupSelect.addEventListener("change", (e) => {
      this.groupByColIndex = parseInt((e.target as HTMLSelectElement).value, 10);
      this.render();
    });

    // 2. Filter Rows
    let visibleRows = tableData.rows;
    if (filterState) {
      visibleRows = tableData.rows.filter((r) =>
        evaluateFilterStateOnRow(r, filterState, columns)
      );
    }

    // 3. Group rows into Kanban columns
    const groupMap = new Map<string, MarkdownTableRow[]>();

    // Initialize groups from unique tags if select/multi-select
    if (groupByCol && groupByCol.uniqueTags && groupByCol.uniqueTags.length > 0) {
      groupByCol.uniqueTags.forEach((t) => groupMap.set(t.name, []));
    }

    // Also populate "No Status" / "No [Group]"
    const noStatusLabel = `No ${groupByCol ? groupByCol.name : "Status"}`;
    groupMap.set(noStatusLabel, []);

    visibleRows.forEach((row) => {
      const cellVal = (row.cells[this.groupByColIndex] || "").trim();
      if (!cellVal) {
        groupMap.get(noStatusLabel)!.push(row);
      } else {
        const tags = parseCellTags(cellVal, settings.customTagColors);
        if (tags.length === 0) {
          const rawTag = cellVal.replace(/^\[\[|\]\]$/g, "").trim();
          if (!groupMap.has(rawTag)) groupMap.set(rawTag, []);
          groupMap.get(rawTag)!.push(row);
        } else {
          const firstTagName = tags[0].name;
          if (!groupMap.has(firstTagName)) groupMap.set(firstTagName, []);
          groupMap.get(firstTagName)!.push(row);
        }
      }
    });

    if (groupMap.size === 0) {
      groupMap.set(noStatusLabel, []);
    }

    // 4. Board Columns Container
    const boardWrapper = this.containerEl.createDiv({ cls: "ms-kanban-board-wrapper" });

    groupMap.forEach((rows, groupName) => {
      const colEl = boardWrapper.createDiv({ cls: "ms-kanban-column" });
      colEl.dataset.groupName = groupName;

      // Column Header
      const colHeader = colEl.createDiv({ cls: "ms-kanban-column-header" });
      const colTitle = colHeader.createDiv({ cls: "ms-kanban-column-title" });

      const isNoStatus = groupName.startsWith("No ");
      if (!isNoStatus) {
        const dummyTag = {
          id: groupName,
          name: groupName,
          color: settings.customTagColors[groupName.toLowerCase()] || "default",
        };
        colTitle.appendChild(createTagBadge({ tag: dummyTag, clickable: false }));
      } else {
        colTitle.createSpan({ cls: "ms-kanban-no-status-title", text: groupName });
      }

      colTitle.createSpan({ cls: "ms-kanban-count-pill", text: `${rows.length}` });

      // Cards List (Drop target)
      const cardsList = colEl.createDiv({ cls: "ms-kanban-cards-list" });

      cardsList.addEventListener("dragover", (e) => {
        e.preventDefault();
        cardsList.classList.add("is-drag-over");
      });

      cardsList.addEventListener("dragleave", () => {
        cardsList.classList.remove("is-drag-over");
      });

      cardsList.addEventListener("drop", async (e) => {
        e.preventDefault();
        cardsList.classList.remove("is-drag-over");
        const rowIndexStr = e.dataTransfer?.getData("text/plain");
        if (rowIndexStr !== undefined) {
          const rowIndex = parseInt(rowIndexStr, 10);
          const newStatusVal = isNoStatus ? "" : groupName;
          await this.options.onCellUpdate(rowIndex, this.groupByColIndex, newStatusVal);
          this.render();
        }
      });

      // Render Cards
      rows.forEach((row) => {
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

        card.addEventListener("drop", async (e) => {
          e.preventDefault();
          e.stopPropagation();
          card.classList.remove("is-card-drop-target");
          const fromIdxStr = e.dataTransfer?.getData("text/plain");
          if (fromIdxStr !== undefined) {
            const fromIdx = parseInt(fromIdxStr, 10);
            const toIdx = row.rowIndex;
            if (!isNaN(fromIdx)) {
              const newStatusVal = isNoStatus ? "" : groupName;
              await this.options.onCellUpdate(fromIdx, this.groupByColIndex, newStatusVal);
              if (fromIdx !== toIdx && this.options.onReorderRows) {
                await this.options.onReorderRows(fromIdx, toIdx);
              }
              this.render();
            }
          }
        });

        // Title Element
        const titleText = row.cells[0] || "Untitled";
        const titleEl = card.createDiv({ cls: "ms-kanban-card-title", text: titleText });

        const startTitleEdit = () => {
          const currentText = row.cells[0] || "";
          titleEl.empty();
          const input = titleEl.createEl("input", {
            type: "text",
            cls: "ms-inline-cell-input",
            value: currentText,
          });
          input.focus();
          input.select();
          const commit = async () => {
            const newVal = input.value;
            await this.options.onCellUpdate(row.rowIndex, 0, newVal);
            this.render();
          };
          input.addEventListener("blur", commit);
          input.addEventListener("keydown", (ke) => {
            if (ke.key === "Enter") {
              ke.preventDefault();
              commit();
            } else if (ke.key === "Escape") {
              this.render();
            }
          });
        };

        titleEl.addEventListener("dblclick", (e) => {
          e.stopPropagation();
          startTitleEdit();
        });

        // Context Menu on Card
        card.addEventListener("contextmenu", (e) => {
          e.preventDefault();
          e.stopPropagation();

          const menu = document.createElement("div");
          menu.className = "ms-col-header-menu";

          const editItem = menu.createDiv({ cls: "ms-menu-item" });
          editItem.innerHTML = `${ICON_EDIT}<span>Edit title</span>`;
          editItem.addEventListener("click", () => {
            menu.remove();
            startTitleEdit();
          });

          const dupItem = menu.createDiv({ cls: "ms-menu-item" });
          dupItem.innerHTML = `${ICON_DUPLICATE}<span>Duplicate card</span>`;
          dupItem.addEventListener("click", () => {
            const prefilled = [...row.cells];
            this.options.onAddRow(row.rowIndex + 1, prefilled);
            menu.remove();
          });

          const delItem = menu.createDiv({ cls: "ms-menu-item is-danger" });
          delItem.innerHTML = `${ICON_TRASH}<span>Delete card</span>`;
          delItem.addEventListener("click", async () => {
            await this.options.onDeleteRow(row.rowIndex);
            menu.remove();
          });

          mountFloatingPopover({
            anchorEl: card,
            popoverEl: menu,
            offsetTop: 2,
          });
        });

        // Other Properties Badges (Clickable & Interactive!)
        const propsEl = card.createDiv({ cls: "ms-kanban-card-properties" });

        columns.forEach((c, cIdx) => {
          if (cIdx === 0 || cIdx === this.groupByColIndex) return;
          const cellVal = (row.cells[cIdx] || "").trim();

          if (c.type === "multi-select") {
            const tags = parseCellTags(cellVal, settings.customTagColors);
            if (tags.length === 0) {
              const emptyBadge = propsEl.createSpan({ cls: "ms-kanban-prop-badge", text: `+ ${c.name}` });
              emptyBadge.addEventListener("click", (e) => {
                e.stopPropagation();
                this.openMultiSelectModal(row.rowIndex, cIdx, c, cellVal);
              });
            } else {
              tags.forEach((t) => {
                const badge = createTagBadge({
                  tag: t,
                  clickable: true,
                  onClick: (_tag, e) => {
                    e.stopPropagation();
                    this.openMultiSelectModal(row.rowIndex, cIdx, c, cellVal);
                  },
                });
                propsEl.appendChild(badge);
              });
            }
          } else if (c.type === "select") {
            const parsed = parseCellTags(cellVal, settings.customTagColors);
            const tagObj = parsed[0];
            const badge = tagObj
              ? createTagBadge({
                  tag: tagObj,
                  clickable: true,
                  onClick: (_tag, e) => {
                    e.stopPropagation();
                    this.openSingleSelectPopover(badge, row.rowIndex, cIdx, c, cellVal);
                  },
                })
              : propsEl.createSpan({ cls: "ms-kanban-prop-badge" });

            if (!tagObj) {
              badge.innerHTML = `${ICON_TYPE_SELECT} <span>${c.name}</span>`;
              badge.addEventListener("click", (e) => {
                e.stopPropagation();
                this.openSingleSelectPopover(badge, row.rowIndex, cIdx, c, cellVal);
              });
            }
            propsEl.appendChild(badge);
          } else if (c.type === "date") {
            const dateBadge = propsEl.createSpan({
              cls: "ms-kanban-prop-badge is-date",
            });
            dateBadge.innerHTML = `${ICON_TYPE_DATE} <span>${cellVal || c.name}</span>`;
            dateBadge.addEventListener("click", (e) => {
              e.stopPropagation();
              this.openDatePickerPopover(dateBadge, row.rowIndex, cIdx, cellVal);
            });
          } else if (c.type === "checkbox") {
            const isDone = cellVal === "[x]" || cellVal === "[X]" || isCellChecked(cellVal);
            const chkBadge = propsEl.createSpan({
              cls: "ms-kanban-prop-badge is-checkbox",
            });
            chkBadge.innerHTML = isDone
              ? `${ICON_CHECK_SQUARE} <span>Done</span>`
              : `${ICON_SQUARE} <span>Todo</span>`;
            chkBadge.addEventListener("click", async (e) => {
              e.stopPropagation();
          const newVal = isDone ? "[ ]" : "[x]";
              await this.options.onCellUpdate(row.rowIndex, cIdx, newVal);
              this.render();
            });
          } else if (cellVal) {
            // Text or Number
            const isNum = c.type === "number";
            const textBadge = propsEl.createEl("span", {
              cls: "ms-kanban-prop-badge",
              text: `${isNum ? "#" : ""} ${cellVal}`,
            });
            textBadge.addEventListener("click", (e) => {
              e.stopPropagation();
              textBadge.empty();
              const input = textBadge.createEl("input", {
                type: "text",
                cls: `ms-inline-cell-input ${isNum ? "is-number" : ""}`,
                value: cellVal,
              });
              input.setAttribute("autocomplete", "off");
              input.setAttribute("spellcheck", "false");
              if (isNum) {
                attachStrictNumericInputHandlers(input);
              }
              input.focus();
              input.select();
              const saveText = async () => {
                let newVal = input.value.trim();
                if (isNum) {
                  newVal = sanitizeNumericCellValue(newVal);
                }
                await this.options.onCellUpdate(row.rowIndex, cIdx, newVal);
                this.render();
              };
              input.addEventListener("blur", saveText);
              input.addEventListener("keydown", (ke) => {
                if (ke.key === "Enter") {
                  ke.preventDefault();
                  saveText();
                } else if (ke.key === "Escape") {
                  this.render();
                }
              });
            });
          }
        });
      });

      // Bottom + New Card Button in column
      const colBottomAdd = colEl.createEl("button", {
        cls: "ms-kanban-bottom-add-btn",
      });
      colBottomAdd.innerHTML = `${ICON_PLUS}<span>New</span>`;
      colBottomAdd.addEventListener("click", () => {
        const prefilled = new Array(columns.length).fill("");
        if (!isNoStatus) {
          prefilled[this.groupByColIndex] = groupName;
        }
        this.options.onAddRow(undefined, prefilled);
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
    const popover = new SingleSelectPopover({
      app: this.options.app,
      anchorEl: anchor,
      columnName: column.name,
      currentValue,
      allAvailableTags: column.uniqueTags || [],
      settings: this.options.settings,
      onSelect: async (selectedTag) => {
        await this.options.onCellUpdate(rowIndex, colIndex, selectedTag);
        this.render();
      },
    });
    popover.open();
  }

  private openMultiSelectModal(
    rowIndex: number,
    colIndex: number,
    column: TableColumn,
    currentValue: string
  ): void {
    const modal = new TagSelectModal({
      app: this.options.app,
      settings: this.options.settings,
      columnName: column.name,
      currentValue,
      allAvailableTags: column.uniqueTags || [],
      onSave: async (newValue) => {
        await this.options.onCellUpdate(rowIndex, colIndex, newValue);
        this.render();
      },
    });
    modal.open();
  }

  private openDatePickerPopover(
    anchor: HTMLElement,
    rowIndex: number,
    colIndex: number,
    currentDate: string
  ): void {
    const col = this.options.columns[colIndex];
    const popover = new DatePickerPopover({
      app: this.options.app,
      anchorEl: anchor,
      currentDate,
      dateFormat: col?.dateFormat || this.options.settings.dateFormat || "YYYY-MM-DD",
      onSelectDate: async (newDate) => {
        await this.options.onCellUpdate(rowIndex, colIndex, newDate);
        this.render();
      },
    });
    popover.open();
  }
}
