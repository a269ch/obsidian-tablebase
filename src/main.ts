import { MarkdownPostProcessorContext, Plugin, TFile } from "obsidian";
import {
  parseMarkdownTables,
  serializeMarkdownTable,
} from "./core/markdown-parser";
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
} from "./core/table-mutator";
import { TableStateManager } from "./core/table-state";
import { TablePostProcessor } from "./extensions/post-processor";
import {
  DEFAULT_SETTINGS,
  DateFormatOption,
  MarkdownTableData,
  PluginSettings,
} from "./types";
import { TableBaseSettingTab } from "./ui/settings-tab";
import { NotionTableView } from "./ui/table-view";

export default class TableBasePlugin extends Plugin {
  settings: PluginSettings = DEFAULT_SETTINGS;
  stateManager: TableStateManager = new TableStateManager();
  postProcessor!: TablePostProcessor;

  async onload(): Promise<void> {
    await this.loadSettings();

    this.stateManager = new TableStateManager();
    this.postProcessor = new TablePostProcessor(
      this.app,
      this.settings,
      this.stateManager
    );

    this.registerMarkdownPostProcessor((el, ctx) => {
      this.postProcessor.process(el, ctx);
    });

    this.registerMarkdownCodeBlockProcessor(
      "tablebase",
      (source: string, el: HTMLElement, ctx: MarkdownPostProcessorContext) => {
        this.processTableCodeBlock(source, el, ctx);
      }
    );

    this.registerMarkdownCodeBlockProcessor(
      "table",
      (source: string, el: HTMLElement, ctx: MarkdownPostProcessorContext) => {
        this.processTableCodeBlock(source, el, ctx);
      }
    );

    this.registerMarkdownCodeBlockProcessor(
      "notion-table",
      (source: string, el: HTMLElement, ctx: MarkdownPostProcessorContext) => {
        this.processTableCodeBlock(source, el, ctx);
      }
    );

    this.addSettingTab(new TableBaseSettingTab(this.app, this));
  }

  onunload(): void {
    document
      .querySelectorAll(".ms-col-header-menu, .ms-date-picker-popover, .ms-select-popover")
      .forEach((el) => el.remove());
  }

  async loadSettings(): Promise<void> {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
    if (this.postProcessor) {
      this.postProcessor.updateSettings(this.settings);
    }
  }

  private processTableCodeBlock(
    source: string,
    el: HTMLElement,
    ctx: MarkdownPostProcessorContext
  ): void {
    const tables = parseMarkdownTables(source);
    if (tables.length === 0) {
      el.createDiv({ text: "Empty table block" });
      return;
    }

    const tableData = tables[0];
    const columns = this.stateManager.analyzeColumns(tableData, this.settings);
    const filterState = this.stateManager.getOrCreateFilterState(tableData.id);

    let currentBlockSource = source;
    const syncTable = async () => {
      await this.syncCodeBlockToDoc(ctx.sourcePath, tableData, currentBlockSource);
      currentBlockSource = serializeMarkdownTable(tableData);
    };

    const notionView = new NotionTableView({
      app: this.app,
      tableData,
      columns,
      filterState,
      settings: this.settings,
      onCellUpdate: async (rIdx, cIdx, newVal) => {
        applyCellUpdate(tableData, rIdx, cIdx, newVal);
        await syncTable();
      },
      onAddRow: async (atIndex?: number, prefilledCells?: string[]) => {
        applyAddRow(tableData, columns.length, atIndex, prefilledCells);
        await syncTable();
        notionView.updateData(tableData, columns);
      },
      onDuplicateRow: async (rowIndex: number) => {
        const duplicated = applyDuplicateRow(tableData, rowIndex);
        if (!duplicated) return;
        await syncTable();
        notionView.updateData(tableData, columns);
      },
      onDeleteRow: async (rowIndex: number) => {
        applyDeleteRow(tableData, rowIndex);
        await syncTable();
        notionView.updateData(tableData, columns);
      },
      onAddColumn: async (name: string, type, atIndex?: number, dateFormat?: DateFormatOption) => {
        applyAddColumn(tableData, columns, name, type, atIndex, dateFormat);
        await syncTable();
        notionView.updateData(tableData, columns);
      },
      onRenameColumn: async (colIndex: number, newName: string) => {
        applyRenameColumn(tableData, columns, colIndex, newName);
        await syncTable();
        notionView.updateData(tableData, columns);
      },
      onDeleteColumn: async (colIndex: number) => {
        applyDeleteColumn(tableData, columns, colIndex);
        await syncTable();
        notionView.updateData(tableData, columns);
      },
      onColumnTypeChange: async (colIndex: number, newType, dateFormat?: DateFormatOption) => {
        applyChangeColumnType(tableData, columns, colIndex, newType, dateFormat);
        await syncTable();
        notionView.updateData(tableData, columns);
      },
      onColumnDateFormatChange: async (colIndex: number, newDateFormat: DateFormatOption) => {
        applyChangeColumnDateFormat(tableData, columns, colIndex, newDateFormat);
        await syncTable();
        notionView.updateData(tableData, columns);
      },
      onReorderRows: async (fromIdx, toIdx) => {
        applyReorderRows(tableData, fromIdx, toIdx);
        await syncTable();
        notionView.updateData(tableData, columns);
      },
      onReorderColumns: async (fromIdx, toIdx) => {
        applyReorderColumns(tableData, columns, fromIdx, toIdx);
        await syncTable();
        notionView.updateData(tableData, columns);
      },
      onFilterChange: (newState) => {
        this.stateManager.setFilterState(tableData.id, newState);
      },
      onSortChange: (sortRules) => {
        filterState.sortRules = sortRules;
        this.stateManager.setFilterState(tableData.id, filterState);
        notionView.render();
      },
    });

    el.appendChild(notionView.getElement());
  }

  private async syncCodeBlockToDoc(
    sourcePath: string,
    tableData: MarkdownTableData,
    initialSource?: string
  ): Promise<void> {
    if (!sourcePath) return;
    const file = this.app.vault.getAbstractFileByPath(sourcePath);
    if (!(file instanceof TFile)) return;

    const newMarkdown = serializeMarkdownTable(tableData);
    const replacement = `\`\`\`table\n${newMarkdown}\n\`\`\``;

    const transform = (content: string): string => {
      if (initialSource) {
        const escaped = initialSource.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const exactBlockRegex = new RegExp("```(?:table|notion-table)[\\s\\S]*?" + escaped + "[\\s\\S]*?```");
        if (exactBlockRegex.test(content)) {
          return content.replace(exactBlockRegex, replacement);
        }
      }

      const firstTableBlockRegex = /```(?:table|notion-table)[\s\S]*?```/;
      return content.replace(firstTableBlockRegex, replacement);
    };

    try {
      await this.app.vault.process(file, transform);
    } catch {
      const content = await this.app.vault.read(file);
      const updated = transform(content);
      await this.app.vault.modify(file, updated);
    }
  }
}
