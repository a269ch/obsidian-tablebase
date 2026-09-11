import { App } from "obsidian";
import {
  addColumnToDocument,
  addRowToDocument,
  changeColumnAlignmentInDocument,
  deleteColumnFromDocument,
  deleteRowFromDocument,
  mutateTableInDocument,
  renameColumnInDocument,
  reorderColumnInDocument,
  reorderRowInDocument,
  serializeMarkdownTable,
  updateCellInDocument,
} from "../core/markdown-parser";
import {
  applyAddColumn,
  applyAddRow,
  applyCellUpdate,
  applyChangeColumnAlignment,
  applyChangeColumnDateFormat,
  applyChangeColumnType,
  applyDeleteColumn,
  applyDeleteRow,
  applyDuplicateRow,
  applyRenameColumn,
  applyReorderColumns,
  applyReorderRows,
} from "../core/table-mutator";
import { TableStateManager } from "../core/table-state";
import {
  ColumnAlignment,
  MarkdownTableData,
  MarkdownTableRow,
  SortRule,
} from "../types";
import { NotionTableView } from "../ui/table/table-view";
import { TableViewActions } from "../ui/table/types";
import { SettingsService } from "./settings-service";
import { TableSyncService } from "./table-sync-service";

export interface CodeBlockViewParams {
  sourcePath: string;
  tableData: MarkdownTableData;
  initialSource: string;
}

export interface InlineTableViewParams {
  sourcePath: string;
  tableData: MarkdownTableData;
  startLine: number;
  tableIndex: number;
}

export type TableOperation =
  | { kind: "cell"; rowIndex: number; colIndex: number; value: string }
  | { kind: "add-row"; cells: string[]; atIndex: number }
  | { kind: "delete-row"; rowIndex: number }
  | { kind: "add-column"; headerText: string; atIndex?: number }
  | { kind: "rename-column"; colIndex: number; headerText: string }
  | { kind: "column-date-format"; colIndex: number; headerText: string }
  | { kind: "column-alignment"; colIndex: number; alignment: ColumnAlignment }
  | { kind: "delete-column"; colIndex: number }
  | { kind: "reorder-rows"; fromIndex: number; toIndex: number }
  | { kind: "reorder-columns"; fromIndex: number; toIndex: number };

type PersistOperation = (
  operation: TableOperation,
  previousHeaders: string[]
) => Promise<void>;

export class TableViewController {
  private app: App;
  private settingsService: SettingsService;
  private stateManager: TableStateManager;
  private syncService: TableSyncService;

  constructor(
    app: App,
    settingsService: SettingsService,
    stateManager: TableStateManager,
    syncService: TableSyncService
  ) {
    this.app = app;
    this.settingsService = settingsService;
    this.stateManager = stateManager;
    this.syncService = syncService;
  }

  public createCodeBlockView(params: CodeBlockViewParams): NotionTableView {
    const { sourcePath, tableData } = params;
    let currentSource = params.initialSource;

    const persist: PersistOperation = async () => {
      await this.syncService.syncCodeBlock(sourcePath, tableData, currentSource);
      currentSource = serializeMarkdownTable(tableData);
    };

    return this.createView(tableData, persist, sourcePath);
  }

  public createInlineTableView(params: InlineTableViewParams): NotionTableView {
    const { sourcePath, tableData, startLine, tableIndex } = params;

    const persist: PersistOperation = async (operation, previousHeaders) => {
      const transform = createDocumentTransform(
        operation,
        previousHeaders,
        tableData,
        startLine,
        tableIndex
      );
      await this.syncService.syncInlineTable(sourcePath, transform);
    };

    return this.createView(tableData, persist, sourcePath);
  }

  private createView(
    tableData: MarkdownTableData,
    persist: PersistOperation,
    sourcePath: string
  ): NotionTableView {
    const settings = this.settingsService.getSettings();
    const columns = this.stateManager.analyzeColumns(tableData, settings);
    const filterState = this.stateManager.getOrCreateFilterState(tableData.id);
    filterState.sortRules ??= [];

    let view: NotionTableView | null = null;

    const commit = async (
      mutate: () => TableOperation | null,
      options: { refresh?: boolean } = {}
    ): Promise<void> => {
      const previousHeaders = [...tableData.headers];
      const operation = mutate();
      if (!operation) return;

      await persist(operation, previousHeaders);

      if (options.refresh !== false) {
        view?.updateData(tableData, columns);
      }
    };

    const headerAt = (colIndex: number): string => tableData.headers[colIndex] ?? "";

    const actions: TableViewActions = {
      onCellUpdate: (rowIndex, colIndex, value) =>
        commit(
          () => {
            applyCellUpdate(tableData, rowIndex, colIndex, value);
            return { kind: "cell", rowIndex, colIndex, value };
          },
          { refresh: false }
        ),

      onAddRow: (atIndex, prefilledCells) =>
        commit(() => {
          const newRow = applyAddRow(tableData, columns.length, atIndex, prefilledCells);
          return { kind: "add-row", cells: newRow.cells, atIndex: newRow.rowIndex };
        }),

      onDuplicateRow: (rowIndex) =>
        commit(() => {
          const duplicated = applyDuplicateRow(tableData, rowIndex);
          if (!duplicated) return null;
          return {
            kind: "add-row",
            cells: duplicated.cells,
            atIndex: duplicated.rowIndex,
          };
        }),

      onDeleteRow: (rowIndex) =>
        commit(() => {
          applyDeleteRow(tableData, rowIndex);
          return { kind: "delete-row", rowIndex };
        }),

      onAddColumn: (name, type, atIndex, dateFormat) =>
        commit(() => {
          const effectiveDateFormat =
            dateFormat ?? this.settingsService.getSettings().dateFormat;
          applyAddColumn(tableData, columns, name, type, atIndex, effectiveDateFormat);
          const colIndex = atIndex ?? tableData.headers.length - 1;
          return { kind: "add-column", headerText: headerAt(colIndex), atIndex };
        }),

      onRenameColumn: (colIndex, newName) =>
        commit(() => {
          applyRenameColumn(tableData, columns, colIndex, newName);
          return { kind: "rename-column", colIndex, headerText: headerAt(colIndex) };
        }),

      onDeleteColumn: (colIndex) =>
        commit(() => {
          applyDeleteColumn(tableData, columns, colIndex);
          return { kind: "delete-column", colIndex };
        }),

      onColumnTypeChange: (colIndex, newType, dateFormat) =>
        commit(() => {
          const effectiveDateFormat =
            dateFormat ?? this.settingsService.getSettings().dateFormat;
          applyChangeColumnType(tableData, columns, colIndex, newType, effectiveDateFormat);
          return { kind: "rename-column", colIndex, headerText: headerAt(colIndex) };
        }),

      onColumnDateFormatChange: (colIndex, newDateFormat) =>
        commit(() => {
          applyChangeColumnDateFormat(tableData, columns, colIndex, newDateFormat);
          return {
            kind: "column-date-format",
            colIndex,
            headerText: headerAt(colIndex),
          };
        }),

      onColumnAlignmentChange: (colIndex, alignment) =>
        commit(() => {
          applyChangeColumnAlignment(tableData, columns, colIndex, alignment);
          return { kind: "column-alignment", colIndex, alignment };
        }),

      onReorderRows: (fromIndex, toIndex) =>
        commit(() => {
          applyReorderRows(tableData, fromIndex, toIndex);
          return { kind: "reorder-rows", fromIndex, toIndex };
        }),

      onReorderColumns: (fromIndex, toIndex) =>
        commit(() => {
          applyReorderColumns(tableData, columns, fromIndex, toIndex);
          return { kind: "reorder-columns", fromIndex, toIndex };
        }),

      onFilterChange: (newState) => {
        this.stateManager.setFilterState(tableData.id, newState);
      },

      onSortChange: (sortRules: SortRule[]) => {
        filterState.sortRules = sortRules;
        this.stateManager.setFilterState(tableData.id, filterState);
        view?.render();
      },

      onTagColorChange: async (tagName, color) => {
        await this.settingsService.setTagColor(tagName, color);
      },
    };

    view = new NotionTableView({
      app: this.app,
      sourcePath,
      tableData,
      columns,
      filterState,
      settings,
      actions,
    });

    const unsubscribe = this.settingsService.subscribe((updatedSettings) => {
      view?.updateSettings(updatedSettings);
    });
    view.registry.addFn(unsubscribe);

    return view;
  }
}

function createDocumentTransform(
  operation: TableOperation,
  previousHeaders: string[],
  tableData: MarkdownTableData,
  startLine: number,
  tableIndex: number
): (content: string) => string {
  switch (operation.kind) {
    case "cell":
      return (content) =>
        updateCellInDocument(
          content,
          startLine,
          operation.rowIndex,
          operation.colIndex,
          operation.value,
          previousHeaders,
          tableIndex
        );

    case "add-row":
      return (content) =>
        addRowToDocument(
          content,
          startLine,
          operation.cells,
          previousHeaders,
          tableIndex,
          operation.atIndex
        );

    case "delete-row":
      return (content) =>
        deleteRowFromDocument(
          content,
          startLine,
          operation.rowIndex,
          previousHeaders,
          tableIndex
        );

    case "add-column":
      return (content) =>
        addColumnToDocument(
          content,
          startLine,
          operation.headerText,
          operation.atIndex,
          previousHeaders,
          tableIndex
        );

    case "rename-column":
      return (content) =>
        renameColumnInDocument(
          content,
          startLine,
          operation.colIndex,
          operation.headerText,
          previousHeaders,
          tableIndex
        );

    case "column-date-format":
      return (content) =>
        mutateTableInDocument(
          content,
          startLine,
          (target) => {
            const { colIndex, headerText } = operation;
            if (colIndex < 0 || colIndex >= target.headers.length) return false;
            target.headers[colIndex] = headerText;
            target.rows.forEach((row: MarkdownTableRow, rowIdx: number) => {
              const source = tableData.rows[rowIdx];
              if (source) {
                row.cells[colIndex] = source.cells[colIndex];
              }
            });
            return true;
          },
          previousHeaders,
          tableIndex
        );

    case "column-alignment":
      return (content) =>
        changeColumnAlignmentInDocument(
          content,
          startLine,
          operation.colIndex,
          operation.alignment,
          previousHeaders,
          tableIndex
        );

    case "delete-column":
      return (content) =>
        deleteColumnFromDocument(
          content,
          startLine,
          operation.colIndex,
          previousHeaders,
          tableIndex
        );

    case "reorder-rows":
      return (content) =>
        reorderRowInDocument(
          content,
          startLine,
          operation.fromIndex,
          operation.toIndex,
          previousHeaders,
          tableIndex
        );

    case "reorder-columns":
      return (content) =>
        reorderColumnInDocument(
          content,
          startLine,
          operation.fromIndex,
          operation.toIndex,
          previousHeaders,
          tableIndex
        );
  }
}
