import { App, MarkdownPostProcessorContext, TFile } from "obsidian";
import {
  addColumnToDocument,
  addRowToDocument,
  deleteColumnFromDocument,
  deleteRowFromDocument,
  mutateTableInDocument,
  renameColumnInDocument,
  reorderColumnInDocument,
  reorderRowInDocument,
  updateCellInDocument,
} from "../core/markdown-parser";
import {
  applyAddColumn,
  applyAddRow,
  applyCellUpdate,
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
  ColumnType,
  DateFormatOption,
  MarkdownTableData,
  MarkdownTableRow,
  PluginSettings,
  SortRule,
} from "../types";
import { NotionTableView } from "../ui/table-view";

export class TablePostProcessor {
  private app: App;
  private settings: PluginSettings;
  private stateManager: TableStateManager;

  constructor(
    app: App,
    settings: PluginSettings,
    stateManager: TableStateManager
  ) {
    this.app = app;
    this.settings = settings;
    this.stateManager = stateManager;
  }

  public updateSettings(newSettings: PluginSettings): void {
    this.settings = newSettings;
  }

  public process = (
    el: HTMLElement,
    ctx: MarkdownPostProcessorContext
  ): void => {
    const tables = el.querySelectorAll("table");
    if (!tables || tables.length === 0) return;

    tables.forEach((tableEl, tableIndex) => {
      this.enhanceTable(tableEl as HTMLTableElement, ctx, tableIndex);
    });
  };

  private enhanceTable(
    tableEl: HTMLTableElement,
    ctx: MarkdownPostProcessorContext,
    tableIndex: number
  ): void {
    if (tableEl.dataset.msEnhanced === "true") {
      return;
    }
    tableEl.dataset.msEnhanced = "true";

    const headerCells = Array.from(tableEl.querySelectorAll("thead th"));
    const headers = headerCells.map((th) => th.textContent?.trim() || "");
    if (headers.length === 0) return;

    const trElements = Array.from(tableEl.querySelectorAll<HTMLTableRowElement>("tbody tr"));
    const rows: MarkdownTableRow[] = trElements.map((tr, rIdx) => {
      const tdCells = Array.from(tr.querySelectorAll("td"));
      return {
        rowIndex: rIdx,
        rawLine: "",
        cells: tdCells.map((td) => td.textContent?.trim() || ""),
      };
    });

    const docSection = ctx.getSectionInfo
      ? ctx.getSectionInfo(tableEl)
      : null;
    const startLine = docSection ? docSection.lineStart : -1;
    const endLine = docSection ? docSection.lineEnd : -1;

    const tableId = `tbl_${ctx.sourcePath || "doc"}_${startLine}_${tableIndex}`;

    const tableData: MarkdownTableData = {
      id: tableId,
      headers: [...headers],
      alignments: new Array(headers.length).fill("---"),
      rows,
      startLine,
      endLine,
      rawMarkdown: "",
    };

    const columns = this.stateManager.analyzeColumns(
      tableData,
      this.settings
    );

    const filterState = this.stateManager.getOrCreateFilterState(tableId);
    if (!filterState.sortRules) {
      filterState.sortRules = [];
    }

    tableEl.style.display = "none";

    const notionView = new NotionTableView({
      app: this.app,
      tableData,
      columns,
      filterState,
      settings: this.settings,
      onCellUpdate: async (rIdx, cIdx, newVal) => {
        const prevHeaders = [...tableData.headers];
        applyCellUpdate(tableData, rIdx, cIdx, newVal);
        await this.modifyFile(ctx.sourcePath, (content) =>
          updateCellInDocument(content, startLine, rIdx, cIdx, newVal, prevHeaders, tableIndex)
        );
      },
      onAddRow: async (atIndex?: number, prefilledCells?: string[]) => {
        const prevHeaders = [...tableData.headers];
        const newRow = applyAddRow(tableData, columns.length, atIndex, prefilledCells);
        await this.modifyFile(ctx.sourcePath, (content) =>
          addRowToDocument(content, startLine, newRow.cells, prevHeaders, tableIndex)
        );
        notionView.updateData(tableData, columns);
      },
      onDuplicateRow: async (rowIndex: number) => {
        const prevHeaders = [...tableData.headers];
        const duplicated = applyDuplicateRow(tableData, rowIndex);
        if (!duplicated) return;
        await this.modifyFile(ctx.sourcePath, (content) =>
          addRowToDocument(content, startLine, duplicated.cells, prevHeaders, tableIndex)
        );
        notionView.updateData(tableData, columns);
      },
      onDeleteRow: async (rIdx) => {
        const prevHeaders = [...tableData.headers];
        applyDeleteRow(tableData, rIdx);
        await this.modifyFile(ctx.sourcePath, (content) =>
          deleteRowFromDocument(content, startLine, rIdx, prevHeaders, tableIndex)
        );
        notionView.updateData(tableData, columns);
      },
      onAddColumn: async (name, type, atIndex?: number, dateFormat?: DateFormatOption) => {
        const prevHeaders = [...tableData.headers];
        applyAddColumn(tableData, columns, name, type, atIndex, dateFormat);
        const colIdx = atIndex !== undefined ? atIndex : tableData.headers.length - 1;
        const headerText = tableData.headers[colIdx];
        await this.modifyFile(ctx.sourcePath, (content) =>
          addColumnToDocument(content, startLine, headerText, atIndex, prevHeaders, tableIndex)
        );
        notionView.updateData(tableData, columns);
      },
      onRenameColumn: async (cIdx, newName) => {
        const prevHeaders = [...tableData.headers];
        applyRenameColumn(tableData, columns, cIdx, newName);
        const headerText = tableData.headers[cIdx];
        await this.modifyFile(ctx.sourcePath, (content) =>
          renameColumnInDocument(content, startLine, cIdx, headerText, prevHeaders, tableIndex)
        );
        notionView.updateData(tableData, columns);
      },
      onColumnTypeChange: async (cIdx: number, newType: ColumnType, dateFormat?: DateFormatOption) => {
        const prevHeaders = [...tableData.headers];
        applyChangeColumnType(tableData, columns, cIdx, newType, dateFormat);
        const headerText = tableData.headers[cIdx];
        await this.modifyFile(ctx.sourcePath, (content) =>
          renameColumnInDocument(content, startLine, cIdx, headerText, prevHeaders, tableIndex)
        );
        notionView.updateData(tableData, columns);
      },
      onColumnDateFormatChange: async (cIdx: number, newDateFormat: DateFormatOption) => {
        const prevHeaders = [...tableData.headers];
        applyChangeColumnDateFormat(tableData, columns, cIdx, newDateFormat);
        const headerText = tableData.headers[cIdx];
        await this.modifyFile(ctx.sourcePath, (content) =>
          mutateTableInDocument(
            content,
            startLine,
            (target) => {
              if (cIdx >= 0 && cIdx < target.headers.length) {
                target.headers[cIdx] = headerText;
                for (let r = 0; r < target.rows.length; r++) {
                  if (tableData.rows[r]) {
                    target.rows[r].cells[cIdx] = tableData.rows[r].cells[cIdx];
                  }
                }
              }
            },
            prevHeaders,
            tableIndex
          )
        );
        notionView.updateData(tableData, columns);
      },
      onDeleteColumn: async (cIdx) => {
        const prevHeaders = [...tableData.headers];
        applyDeleteColumn(tableData, columns, cIdx);
        await this.modifyFile(ctx.sourcePath, (content) =>
          deleteColumnFromDocument(content, startLine, cIdx, prevHeaders, tableIndex)
        );
        notionView.updateData(tableData, columns);
      },
      onReorderRows: async (fromIdx, toIdx) => {
        const prevHeaders = [...tableData.headers];
        applyReorderRows(tableData, fromIdx, toIdx);
        await this.modifyFile(ctx.sourcePath, (content) =>
          reorderRowInDocument(content, startLine, fromIdx, toIdx, prevHeaders, tableIndex)
        );
        notionView.updateData(tableData, columns);
      },
      onReorderColumns: async (fromIdx, toIdx) => {
        const prevHeaders = [...tableData.headers];
        applyReorderColumns(tableData, columns, fromIdx, toIdx);
        await this.modifyFile(ctx.sourcePath, (content) =>
          reorderColumnInDocument(content, startLine, fromIdx, toIdx, prevHeaders, tableIndex)
        );
        notionView.updateData(tableData, columns);
      },
      onFilterChange: (newState) => {
        this.stateManager.setFilterState(tableId, newState);
      },
      onSortChange: (sortRules: SortRule[]) => {
        filterState.sortRules = sortRules;
        this.stateManager.setFilterState(tableId, filterState);
        notionView.render();
      },
    });

    tableEl.parentNode?.insertBefore(notionView.getElement(), tableEl);
  }

  private async modifyFile(
    filePath: string,
    transform: (content: string) => string
  ): Promise<void> {
    if (!filePath) return;

    const file = this.app.vault.getAbstractFileByPath(filePath);
    if (!(file instanceof TFile)) return;

    try {
      await this.app.vault.process(file, transform);
    } catch {
      const content = await this.app.vault.read(file);
      const updated = transform(content);
      await this.app.vault.modify(file, updated);
    }
  }
}
