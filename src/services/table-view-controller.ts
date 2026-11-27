import { App, Notice } from "obsidian";
import {
  addColumnToDocument,
  addRowToDocument,
  changeColumnAlignmentInDocument,
  deleteColumnFromDocument,
  deleteRowFromDocument,
  findTargetTable,
  mutateTableInDocument,
  parseMarkdownTables,
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
  applyChangeColumnCalculation,
  applyChangeColumnDateFormat,
  applyChangeColumnType,
  applyDeleteColumn,
  applyDeleteRow,
  applyDuplicateRow,
  applyRenameColumn,
  applyReorderColumns,
  applyReorderRows,
} from "../core/table-mutator";
import {
  buildStableTableId,
  findDocumentTableIdentities,
  isStableTableId,
} from "../core/table-id";
import { TableStateManager } from "../core/table-state";
import {
  CalculationType,
  ColumnAlignment,
  MarkdownTableData,
  MarkdownTableRow,
  PluginSettings,
  SortRule,
  TableColumn,
  TableFilterState,
} from "../types";
import { NotionTableView } from "../ui/table/table-view";
import { TableViewActions } from "../ui/table/types";
import { SettingsService } from "./settings-service";
import { CodeBlockRewrite, TableSyncService } from "./table-sync-service";

export interface CodeBlockViewParams {
  sourcePath: string;
  tableData: MarkdownTableData;
  initialSource: string;
  getLineStart?: () => number | undefined;
  legacyTableId?: string;
  resolveIdOnMount?: boolean;
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
  | {
      kind: "column-header";
      colIndex: number;
      headerText: string;
      alignment?: string;
    }
  | { kind: "column-alignment"; colIndex: number; alignment: ColumnAlignment }
  | { kind: "delete-column"; colIndex: number }
  | { kind: "reorder-rows"; fromIndex: number; toIndex: number }
  | { kind: "reorder-columns"; fromIndex: number; toIndex: number };

type PersistOperation = (
  operation: TableOperation,
  previousHeaders: string[],
  onRewrite?: CodeBlockRewrite
) => Promise<boolean>;

interface TableIdChange {
  from: string;
  to?: string;
}

export class TableViewController {
  private app: App;
  private settingsService: SettingsService;
  private stateManager: TableStateManager;
  private syncService: TableSyncService;
  private editorScroll: Map<string, { top: number; left: number }> = new Map();
  private editorScrollObservers: Map<string, MutationObserver> = new Map();
  private pendingCommits = new Map<string, Promise<void>>();
  private viewsByPath = new Map<string, Set<NotionTableView>>();
  private rebindHandlers = new WeakMap<
    NotionTableView,
    (newTableId: string, refresh?: boolean, replacement?: MarkdownTableData) => void
  >();

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
    const legacyId = params.legacyTableId ?? (!isStableTableId(tableData.id) ? tableData.id : undefined);
    if (!isStableTableId(tableData.id)) {
      tableData.id = buildStableTableId({
        sourcePath,
        headers: tableData.headers,
        occurrence: 0,
      });
    }
    let currentSource = params.initialSource;
    const persist: PersistOperation = async (_operation, _previousHeaders, onRewrite) => {
      const written = serializeMarkdownTable(tableData);
      const args = [sourcePath, tableData, currentSource, params.getLineStart?.()] as const;
      const saved = onRewrite
        ? await this.syncService.syncCodeBlock(...args, onRewrite)
        : await this.syncService.syncCodeBlock(...args);
      if (saved) {
        currentSource = written;
      } else {
        new Notice("TableBase: could not find this table in the note, so the change was not saved.");
      }
      return saved;
    };

    return this.createView(tableData, persist, sourcePath, {
      legacyId,
      resolveIdOnMount: params.resolveIdOnMount,
      updateBlockSource: (source) => { currentSource = source; },
    });
  }

  public createInlineTableView(params: InlineTableViewParams): NotionTableView {
    const { sourcePath, tableData, startLine, tableIndex } = params;
    if (!isStableTableId(tableData.id)) {
      tableData.id = buildStableTableId({
        sourcePath,
        headers: tableData.headers,
        occurrence: tableIndex,
      });
    }

    const persist: PersistOperation = (operation, previousHeaders, onRewrite) => {
      const transform = createDocumentTransform(
        operation,
        previousHeaders,
        tableData,
        startLine,
        tableIndex
      );
      return this.syncService.syncInlineTable(sourcePath, onRewrite ? (content) => {
        const target = findTargetTable(parseMarkdownTables(content), startLine, previousHeaders, tableIndex);
        const next = transform(content);
        if (target) onRewrite(content, next, target.startLine);
        return next;
      } : transform);
    };

    const legacyId = `tbl_${sourcePath || "doc"}_${tableIndex}`;
    return this.createView(tableData, persist, sourcePath, { legacyId });
  }

  public rebindTableId(view: NotionTableView, newTableId: string): void {
    if (!newTableId) return;
    const handler = this.rebindHandlers.get(view);
    handler?.(newTableId);
  }

  private prepareColumns(
    tableData: MarkdownTableData,
    settings: PluginSettings,
    onSyncGroupOrders?: (patch: Partial<PluginSettings>) => Promise<void>
  ): TableColumn[] {
    const columns = this.stateManager.analyzeColumns(tableData, settings);
    const savedGroupOrders = settings.tableBoardGroupOrders?.[tableData.id] ?? {};
    const tableGroupOrders: Record<string, string[]> = { ...savedGroupOrders };

    for (const column of columns) {
      if (column.type !== "select" && column.type !== "multi-select") continue;

      const currentNames = (column.uniqueTags ?? []).map((tag) => tag.name);
      const savedNames = tableGroupOrders[String(column.index)] ?? [];
      const orderedNames = [
        ...savedNames,
        ...currentNames.filter((name) => !savedNames.includes(name)),
      ];
      tableGroupOrders[String(column.index)] = orderedNames;
      const tagsByName = new Map((column.uniqueTags ?? []).map((tag) => [tag.name, tag]));
      column.uniqueTags = orderedNames.flatMap((name) => {
        return [
          tagsByName.get(name) ?? {
            id: name.toLowerCase(),
            name,
            color: "gray" as const,
          },
        ];
      });
    }

    if (JSON.stringify(savedGroupOrders) !== JSON.stringify(tableGroupOrders)) {
      void onSyncGroupOrders?.({
        tableBoardGroupOrders: {
          ...(settings.tableBoardGroupOrders ?? {}),
          [tableData.id]: tableGroupOrders,
        },
      });
    }

    return columns;
  }

  private prepareFilterState(
    tableId: string,
    colCount: number,
    settings: PluginSettings
  ): TableFilterState {
    const filterState = this.stateManager.getOrCreateFilterState(tableId);
    filterState.sortRules ??= [];

    if (filterState.sortRules.length === 0) {
      const savedRules = settings.tableSortRules?.[tableId];
      if (savedRules && savedRules.length > 0) {
        const validRules = savedRules
          .filter((rule) => rule.columnIndex >= 0 && rule.columnIndex < colCount)
          .map((rule) => ({ ...rule }));
        if (validRules.length > 0) {
          filterState.sortRules = validRules;
          this.stateManager.setFilterState(tableId, filterState);
        }
      }
    }

    return filterState;
  }

  private readTableSettings(
    tableId: string,
    legacyId: string | undefined,
    updateSettings: (patch: Partial<PluginSettings>) => Promise<void>
  ): PluginSettings {
    const settings = this.settingsService.getSettings();
    if (!legacyId?.startsWith("tbl_")) return settings;

    const patch: Partial<PluginSettings> = {};
    for (const key of ["tableColumnWidths", "tableBoardGroupOrders"] as const) {
      const values = settings[key];
      if (values?.[legacyId] !== undefined && values[tableId] === undefined) {
        // Legacy IDs could be shared. Keep them available to other tables using that key.
        Object.assign(patch, { [key]: { ...values, [tableId]: values[legacyId] } });
      }
    }

    if (Object.keys(patch).length > 0) {
      void updateSettings(patch);
    }
    return this.settingsService.getSettings();
  }

  private createView(
    tableData: MarkdownTableData,
    persist: PersistOperation,
    sourcePath: string,
    binding: {
      legacyId?: string;
      resolveIdOnMount?: boolean;
      updateBlockSource?: (source: string) => void;
    }
  ): NotionTableView {
    const { legacyId, updateBlockSource } = binding;
    let { resolveIdOnMount } = binding;
    const silentSnapshots = new WeakSet<PluginSettings>();

    const updateSettingsSilently = async (patch: Partial<PluginSettings>): Promise<void> => {
      const savePromise = this.settingsService.updateSettings(patch);
      silentSnapshots.add(this.settingsService.getSettings());
      await savePromise;
    };

    const settings = this.readTableSettings(
      tableData.id, resolveIdOnMount ? undefined : legacyId, updateSettingsSilently
    );
    let columns = this.prepareColumns(
      tableData, settings, resolveIdOnMount ? undefined : updateSettingsSilently
    );
    let filterState = this.prepareFilterState(tableData.id, columns.length, settings);

    let view: NotionTableView | null = null;

    const persistChange = async (
      mutate: () => TableOperation | null,
      options: { refresh?: boolean; columnEdit?: boolean }
    ): Promise<void> => {
      this.captureEditorScroll(sourcePath);
      this.watchEditorScroll(sourcePath);
      const previousHeaders = [...tableData.headers];
      const previousColumns = options.columnEdit ? [...columns] : [];
      const previousSettings = this.settingsService.getSettings();
      const previousViews = options.columnEdit
        ? new Map(Array.from(this.viewsByPath.get(sourcePath) ?? [], (openView) => [openView, openView.tableData.id]))
        : undefined;
      const backup = options.columnEdit ? {
        columns: columns.map((column) => ({ ...column })),
        data: copyTableData(tableData),
      } : undefined;
      const operation = mutate();
      if (!operation) return;

      let changes: ReturnType<typeof findTableIdChanges>;
      const saved = await persist(operation, previousHeaders, options.columnEdit ? (before, after, line) => {
        changes = findTableIdChanges(sourcePath, before, after, line, Boolean(updateBlockSource), tableData.id);
      } : undefined);
      if (backup && saved === false) {
        Object.assign(tableData, backup.data);
        columns = backup.columns;
      } else if (saved && changes) {
        const indices = new Map(columns.map((column) => [column, column.index]));
        const newIndices = previousColumns.map((column) => indices.get(column));
        const newId = changes.edited.to;
        if (newId) tableData.id = newId;
        this.stateManager.rekeyFilterStates(new Map(changes.moves.map(({ from, to }) => [from, to])));
        if (newId) {
          updateColumnState(filterState, newIndices, columns);
          filterState.tableId = newId;
          this.stateManager.setFilterState(newId, filterState);
        }
        const patch = migrateTableSettings(
          previousSettings, this.settingsService.getSettings(), changes, newIndices, columns
        );
        const savedSettings = Object.keys(patch).length ? updateSettingsSilently(patch) : undefined;
        const moved = new Map(changes.moves.map(({ from, to }) => [from, to]));
        const destinations = new Set(moved.values());
        if (newId) destinations.add(newId);
        for (const openView of this.viewsByPath.get(sourcePath) ?? []) {
          if (openView === view) continue;
          const oldId = previousViews?.get(openView);
          if (oldId === changes.edited.from && newId) {
            this.rebindHandlers.get(openView)?.(newId, true, tableData);
          } else if (oldId) {
            const destination = moved.get(oldId);
            if (destination) this.rebindTableId(openView, destination);
          } else if (!oldId && destinations.has(openView.tableData.id)) {
            this.rebindHandlers.get(openView)?.(openView.tableData.id, true);
          }
        }
        view?.syncSettings(this.settingsService.getSettings());
        view?.rebindState(tableData, columns, filterState);
        await savedSettings;
      }
      this.restoreEditorScroll(sourcePath);
      if (typeof window !== "undefined") {
        let frames = 0;
        const restoreForSeveralFrames = (): void => {
          this.restoreEditorScroll(sourcePath);
          if (++frames < 12) {
            window.requestAnimationFrame(restoreForSeveralFrames);
          } else {
            this.stopWatchingEditorScroll(sourcePath);
          }
        };
        window.requestAnimationFrame(restoreForSeveralFrames);
      }

      if (options.refresh !== false && !(saved && changes)) {
        view?.updateData(tableData, columns);
      }
    };

    // Keep each note's write and settings migration in the same queue.
    const commit = (
      mutate: () => TableOperation | null,
      options: { refresh?: boolean; columnEdit?: boolean } = {}
    ): Promise<void> => {
      const pending = this.pendingCommits.get(sourcePath);
      const run = () => persistChange(mutate, options);
      const save = pending ? pending.then(run, run) : run();
      this.pendingCommits.set(sourcePath, save);
      const cleanup = () => {
        if (this.pendingCommits.get(sourcePath) === save) this.pendingCommits.delete(sourcePath);
      };
      void save.then(cleanup, cleanup);
      return save;
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
          const { index: colIndex } = applyAddColumn(
            tableData, columns, name, type, atIndex, effectiveDateFormat
          );
          return { kind: "add-column", headerText: headerAt(colIndex), atIndex: colIndex };
        }, { columnEdit: true }),

      onRenameColumn: (colIndex, newName) =>
        commit(() => {
          applyRenameColumn(tableData, columns, colIndex, newName);
          return { kind: "rename-column", colIndex, headerText: headerAt(colIndex) };
        }, { columnEdit: true }),

      onDeleteColumn: (colIndex) =>
        commit(() => {
          applyDeleteColumn(tableData, columns, colIndex);
          return { kind: "delete-column", colIndex };
        }, { columnEdit: true }),

      onColumnTypeChange: (colIndex, newType, dateFormat) =>
        commit(() => {
          const effectiveDateFormat =
            dateFormat ?? this.settingsService.getSettings().dateFormat;
          applyChangeColumnType(tableData, columns, colIndex, newType, effectiveDateFormat);
          return {
            kind: "column-header",
            colIndex,
            headerText: headerAt(colIndex),
            alignment: tableData.alignments?.[colIndex],
          };
        }),

      onColumnCalculationChange: (colIndex: number, calculation: CalculationType) =>
        commit(() => {
          applyChangeColumnCalculation(tableData, columns, colIndex, calculation);
          return { kind: "column-header", colIndex, headerText: headerAt(colIndex) };
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
        }, { columnEdit: true }),

      onFilterChange: (newState) => {
        filterState = newState;
        this.stateManager.setFilterState(tableData.id, newState);
      },

      onSortChange: (sortRules: SortRule[]) => {
        filterState.sortRules = sortRules;
        this.stateManager.setFilterState(tableData.id, filterState);
        view?.render();
        const latestSettings = this.settingsService.getSettings();
        const nextSortRules = { ...(latestSettings.tableSortRules ?? {}) };
        if (sortRules.length > 0) {
          nextSortRules[tableData.id] = sortRules.map((rule) => ({ ...rule }));
        } else {
          delete nextSortRules[tableData.id];
        }
        void updateSettingsSilently({ tableSortRules: nextSortRules });
      },

      onTagColorChange: async (tagName, color) => {
        await this.settingsService.setTagColor(tagName, color);
      },

      onColumnResize: async (widths) => {
        const settings = this.settingsService.getSettings();
        const tableColumnWidths = {
          ...settings.tableColumnWidths,
          [tableData.id]: {
            ...(settings.tableColumnWidths?.[tableData.id] ?? {}),
            ...widths,
          },
        };
        await this.settingsService.updateSettings({ tableColumnWidths });
      },

      onWideModeChange: async (isWide) => {
        const currentSettings = this.settingsService.getSettings();
        const tableWideModes = { ...(currentSettings.tableWideModes ?? {}) };
        if (isWide) {
          tableWideModes[tableData.id] = true;
        } else {
          delete tableWideModes[tableData.id];
        }
        await this.settingsService.updateSettings({ tableWideModes });
      },

      onBoardViewChange: async (isVisible) => {
        const currentSettings = this.settingsService.getSettings();
        const defaultVisible = currentSettings.showBoardView ?? true;
        const tableBoardViews = { ...(currentSettings.tableBoardViews ?? {}) };
        if (isVisible === defaultVisible) {
          delete tableBoardViews[tableData.id];
        } else {
          tableBoardViews[tableData.id] = isVisible;
        }
        await this.settingsService.updateSettings({ tableBoardViews });
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

    this.rebindHandlers.set(view, (newTableId: string, refresh = false, replacement) => {
      if (!view || (tableData.id === newTableId && !resolveIdOnMount && !refresh)) return;
      const latestSettings = this.readTableSettings(
        newTableId, resolveIdOnMount ? legacyId : undefined, updateSettingsSilently
      );
      resolveIdOnMount = false;
      if (replacement) {
        Object.assign(tableData, copyTableData(replacement));
        updateBlockSource?.(serializeMarkdownTable(tableData));
      }
      tableData.id = newTableId;
      columns = this.prepareColumns(tableData, latestSettings, updateSettingsSilently);
      filterState = this.prepareFilterState(newTableId, columns.length, latestSettings);
      view.syncSettings(latestSettings);
      view.rebindState(tableData, columns, filterState);
    });

    const unsubscribe = this.settingsService.subscribe((updatedSettings) => {
      if (silentSnapshots.has(updatedSettings)) {
        view?.syncSettings(updatedSettings);
        return;
      }
      view?.updateSettings(updatedSettings);
    });
    view.registry.addFn(unsubscribe);
    const openViews = this.viewsByPath.get(sourcePath) ?? new Set<NotionTableView>();
    this.viewsByPath.set(sourcePath, openViews);
    const registeredView = view;
    openViews.add(registeredView);
    view.registry.addFn(() => {
      openViews.delete(registeredView);
      if (openViews.size === 0) this.viewsByPath.delete(sourcePath);
    });

    return view;
  }

  private captureEditorScroll(sourcePath: string): void {
    if (typeof document === "undefined") return;
    const scroller = document.querySelector<HTMLElement>(
      ".workspace-leaf.mod-active .cm-scroller"
    );
    if (scroller) {
      this.editorScroll.set(sourcePath, {
        top: scroller.scrollTop,
        left: scroller.scrollLeft,
      });
    }
  }

  private watchEditorScroll(sourcePath: string): void {
    if (typeof document === "undefined" || typeof MutationObserver === "undefined") return;
    this.stopWatchingEditorScroll(sourcePath);
    const observer = new MutationObserver(() => this.restoreEditorScroll(sourcePath));
    observer.observe(document.body, { childList: true, subtree: true });
    this.editorScrollObservers.set(sourcePath, observer);
  }

  private stopWatchingEditorScroll(sourcePath: string): void {
    const observer = this.editorScrollObservers.get(sourcePath);
    observer?.disconnect();
    this.editorScrollObservers.delete(sourcePath);
  }

  private restoreEditorScroll(sourcePath: string): void {
    const position = this.editorScroll.get(sourcePath);
    if (!position || typeof document === "undefined") return;
    const scroller = document.querySelector<HTMLElement>(
      ".workspace-leaf.mod-active .cm-scroller"
    );
    if (!scroller) return;
    scroller.scrollTop = position.top;
    scroller.scrollLeft = position.left;
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

    case "column-header":
      // A type switch also implies a new alignment, and renameColumnInDocument
      // would only carry the header across.
      return (content) =>
        mutateTableInDocument(
          content,
          startLine,
          (target) => {
            const { colIndex, headerText, alignment } = operation;
            if (colIndex < 0 || colIndex >= target.headers.length) return false;
            target.headers[colIndex] = headerText;
            if (alignment) {
              while (target.alignments.length < target.headers.length) {
                target.alignments.push("---");
              }
              target.alignments[colIndex] = alignment;
            }
            return true;
          },
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

function copyTableData(table: MarkdownTableData): MarkdownTableData {
  return {
    ...table,
    headers: [...table.headers],
    alignments: [...table.alignments],
    rows: table.rows.map((row) => ({ ...row, cells: [...row.cells] })),
  };
}

function findTableIdChanges(
  sourcePath: string,
  before: string,
  after: string,
  line: number,
  isCodeBlock: boolean,
  viewId: string
): { edited: TableIdChange; moves: TableIdChange[] } | undefined {
  const oldTables = findDocumentTableIdentities(before, sourcePath);
  const newTables = findDocumentTableIdentities(after, sourcePath);
  const oldTable = oldTables.find((table) => table.sortLine === line && table.isCodeBlock === isCodeBlock);
  if (!oldTable) return;

  // Only the edited table's span can change. Keep matching its neighbors by line.
  const lineDelta = after.split("\n").length - before.split("\n").length;
  const byLine = new Map(newTables.map((table) => [table.sortLine, table]));
  const edited: TableIdChange = { from: oldTable.id, to: byLine.get(line)?.id };
  if (viewId !== oldTable.id && !oldTables.some((table) => table.id === viewId)) {
    edited.from = viewId;
  }
  const moves = oldTables.map((table) => table === oldTable ? edited : {
    from: table.id,
    to: byLine.get(table.sortLine + (table.sortLine > line ? lineDelta : 0))?.id,
  }).filter(({ from, to }) => from !== to);
  return { edited, moves };
}

type ColumnIndices = (number | undefined)[];

function remapRules<T extends { columnIndex: number; column: string }>(
  rules: T[],
  indices: ColumnIndices,
  columns: TableColumn[]
): T[] {
  return rules.flatMap((rule) => {
    const index = indices[rule.columnIndex];
    return index === undefined ? [] : [{ ...rule, columnIndex: index, column: columns[index].name }];
  });
}

function remapColumnValues<T>(values: Record<string, T>, indices: ColumnIndices): Record<string, T> {
  return Object.fromEntries(Object.entries(values).flatMap(([oldIndex, value]) => {
    const index = indices[Number(oldIndex)];
    return index === undefined ? [] : [[String(index), value]];
  }));
}

function updateColumnState(
  state: TableFilterState,
  indices: ColumnIndices,
  columns: TableColumn[]
): void {
  state.sortRules = remapRules(state.sortRules, indices, columns);
  state.rules = remapRules(state.rules, indices, columns);
  state.hiddenColumnIndices = state.hiddenColumnIndices?.flatMap((index) => indices[index] ?? []);
  if (state.groupByColumnIndex !== undefined) {
    state.groupByColumnIndex = indices[state.groupByColumnIndex];
  }
  if (state.selection?.col !== undefined) {
    const col = indices[state.selection.col];
    state.selection = col === undefined ? undefined : { ...state.selection, col };
  }
}

function migrateTableSettings(
  previous: PluginSettings,
  latest: PluginSettings,
  changes: { edited: TableIdChange; moves: TableIdChange[] },
  indices: ColumnIndices,
  columns: TableColumn[]
): Partial<PluginSettings> {
  const patch: Partial<PluginSettings> = {};
  const keys = [
    "tableColumnWidths", "tableBoardGroupOrders", "tableSortRules", "tableWideModes", "tableBoardViews",
  ] as const;
  const { edited, moves } = changes;
  const transfers = edited.from === edited.to ? [...moves, edited] : moves;

  for (const key of keys) {
    const next: Record<string, unknown> = { ...latest[key] };
    // Read all sources from the snapshot, then assign their destinations. An
    // occurrence that shifts into a vacated key must never inherit its value.
    for (const { from } of transfers) delete next[from];
    for (const { from, to } of transfers) {
      if (!to) continue;
      delete next[to];
      if (from !== edited.from) {
        const value = previous[key]?.[from];
        if (value !== undefined) next[to] = value;
      } else if (key === "tableColumnWidths" || key === "tableBoardGroupOrders") {
        const value = previous[key]?.[from] as Record<string, unknown> | undefined;
        if (value !== undefined) next[to] = remapColumnValues(value, indices);
      } else if (key === "tableSortRules") {
        const rules = previous[key]?.[from];
        if (rules !== undefined) next[to] = remapRules(rules, indices, columns);
      } else {
        const value = previous[key]?.[from];
        if (value !== undefined) next[to] = value;
      }
    }
    if (JSON.stringify(next) !== JSON.stringify(latest[key] ?? {})) {
      Object.assign(patch, { [key]: next });
    }
  }
  return patch;
}
