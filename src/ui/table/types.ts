import { App } from "obsidian";
import {
  ColumnAlignment,
  ColumnType,
  DatabaseViewType,
  DateFormatOption,
  MarkdownTableData,
  PluginSettings,
  SortRule,
  TableColumn,
  TableFilterState,
  TagColor,
} from "../../types";
import { DisposableRegistry } from "../../utils/lifecycle";
import { SelectionModel } from "./selection";

export interface TableViewActions {
  onCellUpdate(rowIndex: number, colIndex: number, newValue: string): Promise<void>;
  onAddRow(atIndex?: number, prefilledCells?: string[]): Promise<void>;
  onDuplicateRow(rowIndex: number): Promise<void>;
  onDeleteRow(rowIndex: number): Promise<void>;
  onReorderRows(fromIndex: number, toIndex: number): Promise<void>;
  onAddColumn(
    name: string,
    type: ColumnType,
    atIndex?: number,
    dateFormat?: DateFormatOption
  ): Promise<void>;
  onRenameColumn(colIndex: number, newName: string): Promise<void>;
  onDeleteColumn(colIndex: number): Promise<void>;
  onColumnTypeChange(
    colIndex: number,
    newType: ColumnType,
    dateFormat?: DateFormatOption
  ): Promise<void>;
  onColumnDateFormatChange(colIndex: number, newDateFormat: DateFormatOption): Promise<void>;
  onColumnAlignmentChange(colIndex: number, alignment: ColumnAlignment): Promise<void>;
  onReorderColumns(fromIndex: number, toIndex: number): Promise<void>;
  onFilterChange(state: TableFilterState): void;
  onSortChange(sortRules: SortRule[]): void;
  onTagColorChange(tagName: string, color: TagColor): Promise<void>;
}

export type BoardViewActions = Pick<
  TableViewActions,
  "onCellUpdate" | "onAddRow" | "onDeleteRow" | "onReorderRows" | "onTagColorChange"
>;

export interface TableViewOptions {
  app: App;
  sourcePath: string;
  tableData: MarkdownTableData;
  columns: TableColumn[];
  filterState: TableFilterState;
  settings: PluginSettings;
  actions: TableViewActions;
}

export interface TableViewContext {
  readonly app: App;
  readonly sourcePath: string;
  readonly actions: TableViewActions;
  readonly selection: SelectionModel;
  readonly registry: DisposableRegistry;
  readonly containerEl: HTMLElement;
  readonly tableData: MarkdownTableData;
  readonly columns: TableColumn[];
  readonly filterState: TableFilterState;
  readonly settings: PluginSettings;
  isRowNumbersVisible(): boolean;
  getVisibleColumns(): TableColumn[];
  render(): void;
  renderRows(): void;
  switchView(view: DatabaseViewType): void;
  clearFocus(): void;
  applySelection(): void;
}
