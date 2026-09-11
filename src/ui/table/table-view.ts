import { App } from "obsidian";
import {
  DatabaseViewType,
  MarkdownTableData,
  PluginSettings,
  TableColumn,
  TableFilterState,
} from "../../types";
import { formatDateByOption, parseAnyDate } from "../../core/date-utils";
import { DATE_KEYWORDS, TYPE_ANNOTATION_REGEX } from "../../core/table-mutator";
import { Disposable, DisposableRegistry } from "../../utils/lifecycle";
import { KanbanView } from "../kanban-view";
import { AddColumnModal } from "../modals/add-column-modal";
import { CellRenderer } from "./cells";
import { RowDragController } from "./dnd";
import { FilterPanel } from "./filter-panel";
import { TableGrid } from "./grid";
import { KeyboardController } from "./keyboard";
import { TableMenus } from "./menus";
import { SelectionModel } from "./selection";
import { SortPanel } from "./sort-panel";
import { TableToolbar } from "./toolbar";
import { TableViewActions, TableViewContext, TableViewOptions } from "./types";

export class NotionTableView implements Disposable, TableViewContext {
  public readonly app: App;
  public readonly sourcePath: string;
  public readonly actions: TableViewActions;
  public readonly selection = new SelectionModel();
  public readonly registry = new DisposableRegistry();
  public readonly containerEl: HTMLElement;

  private options: TableViewOptions;
  private cells: CellRenderer;
  private menus: TableMenus;
  private rowDrag: RowDragController;
  private grid: TableGrid;
  private toolbar: TableToolbar;
  private filterPanel: FilterPanel;
  private sortPanel: SortPanel;
  private keyboard: KeyboardController;
  private keyboardBound = false;
  private disposed = false;

  constructor(options: TableViewOptions) {
    this.options = options;
    this.app = options.app;
    this.sourcePath = options.sourcePath;
    this.actions = options.actions;

    this.options.filterState.viewType ??= "table";
    this.options.filterState.hiddenColumnIndices ??= [];

    this.containerEl = createDiv({ cls: "ms-notion-database-container" });
    this.containerEl.tabIndex = 0;

    const openAddColumnModal = (atIndex?: number): void => this.openAddColumnModal(atIndex);

    this.cells = new CellRenderer(this);
    this.menus = new TableMenus(this, openAddColumnModal);
    this.rowDrag = new RowDragController(this, this.menus);
    this.grid = new TableGrid(this, this.menus, this.cells, this.rowDrag, openAddColumnModal);
    this.toolbar = new TableToolbar(this, this.menus);
    this.filterPanel = new FilterPanel(this);
    this.sortPanel = new SortPanel(this);
    this.keyboard = new KeyboardController(this, this.cells);

    this.cells.onTabCommit = (shiftKey) => this.keyboard.moveFocus(0, shiftKey ? -1 : 1);
  }

  public get tableData(): MarkdownTableData {
    return this.options.tableData;
  }

  public get columns(): TableColumn[] {
    return this.options.columns;
  }

  public get filterState(): TableFilterState {
    return this.options.filterState;
  }

  public get settings(): PluginSettings {
    return this.options.settings;
  }

  public isRowNumbersVisible(): boolean {
    return this.filterState.showRowNumbers ?? Boolean(this.settings.showRowNumbers);
  }

  public getVisibleColumns(): TableColumn[] {
    const hidden = this.filterState.hiddenColumnIndices ?? [];
    return this.columns.filter((col) => !hidden.includes(col.index));
  }

  public getElement(): HTMLElement {
    this.render();
    if (!this.keyboardBound) {
      this.keyboard.bind();
      this.keyboardBound = true;
    }
    return this.containerEl;
  }

  public updateData(tableData: MarkdownTableData, columns: TableColumn[]): void {
    this.options.tableData = tableData;
    this.options.columns = columns;
    this.render();
  }

  public updateSettings(settings: PluginSettings): void {
    this.options.settings = settings;
    this.options.columns = this.options.columns.map((col) => {
      const rawHeader = this.tableData.headers[col.index] || "";
      const isDateCol =
        col.type === "date" ||
        (DATE_KEYWORDS.test(col.name) && !TYPE_ANNOTATION_REGEX.test(rawHeader));
      if (isDateCol && settings.dateFormat) {
        const oldFormat = col.dateFormat;
        const newFormat = settings.dateFormat;
        if (oldFormat && oldFormat !== newFormat) {
          for (const row of this.tableData.rows) {
            const cell = (row.cells[col.index] || "").trim();
            if (cell) {
              const parsed = parseAnyDate(cell, oldFormat);
              if (parsed) {
                row.cells[col.index] = formatDateByOption(parsed, newFormat);
              }
            }
          }
        }
        return { ...col, type: "date", dateFormat: newFormat };
      }
      return col;
    });
    this.render();
  }

  public switchView(view: DatabaseViewType): void {
    this.filterState.viewType = view;
    this.actions.onFilterChange(this.filterState);
    this.render();
  }

  public clearFocus(): void {
    this.selection.clear();
    this.applySelection();
    this.grid.tableElement?.classList.remove("is-add-col-active");
  }

  public applySelection(): void {
    this.selection.applyTo(this.containerEl);
  }

  public renderRows(): void {
    this.grid.renderBody();
  }

  public render(): void {
    if (this.disposed) return;

    this.menus.closeActivePopover();
    this.containerEl.empty();

    if (this.filterState.viewType === "board") {
      this.renderBoard();
      return;
    }

    this.toolbar.render(this.containerEl);

    if (this.filterState.isSortOpen) {
      this.sortPanel.render(this.containerEl);
    }
    if (this.filterState.isFilterOpen) {
      this.filterPanel.render(this.containerEl);
    }

    this.containerEl.appendChild(this.rowDrag.element);
    this.grid.render(this.containerEl);
  }

  private renderBoard(): void {
    const kanban = new KanbanView({
      app: this.app,
      sourcePath: this.sourcePath,
      tableData: this.tableData,
      columns: this.columns,
      filterState: this.filterState,
      settings: this.settings,
      actions: this.actions,
      onSwitchView: (view) => this.switchView(view),
    });
    this.containerEl.appendChild(kanban.getElement());
  }

  private openAddColumnModal(atIndex?: number): void {
    const tableEl = this.grid.tableElement;
    if (tableEl && atIndex === undefined) {
      this.clearFocus();
      tableEl.classList.add("is-add-col-active");
    }

    new AddColumnModal({
      app: this.app,
      initialDateFormat: this.settings.dateFormat,
      onSave: (name, type, dateFormat) => {
        void this.actions.onAddColumn(
          name,
          type,
          atIndex,
          dateFormat ?? this.settings.dateFormat
        );
      },
      onClose: () => {
        tableEl?.classList.remove("is-add-col-active");
      },
    }).open();
  }

  public dispose(): void {
    if (this.disposed) return;
    this.disposed = true;

    this.rowDrag.dispose();
    this.menus.closeActivePopover();
    this.registry.dispose();
    this.containerEl.empty();
    this.containerEl.remove();
  }
}
