import { MarkdownPostProcessorContext } from "obsidian";
import { parseMarkdownTables, TABLE_CODE_BLOCK_LANGUAGES } from "../core/markdown-parser";
import { buildStableTableId, findTableOccurrenceInDocument } from "../core/table-id";
import { TableViewController } from "../services/table-view-controller";
import { TableViewRegistry } from "../services/table-view-registry";
import { isPrintMode } from "./print-mode";
import { TableRenderChild } from "./table-render-child";

export { TABLE_CODE_BLOCK_LANGUAGES };

export class TableCodeBlockProcessor {
  private viewController: TableViewController;
  private registry: TableViewRegistry;

  constructor(viewController: TableViewController, registry: TableViewRegistry) {
    this.viewController = viewController;
    this.registry = registry;
  }

  public process(
    source: string,
    el: HTMLElement,
    ctx: MarkdownPostProcessorContext
  ): void {
    if (isPrintMode(el)) {
      return;
    }

    const tables = parseMarkdownTables(source);
    if (tables.length === 0) {
      el.createDiv({ cls: "ms-empty-codeblock", text: "Empty table block" });
      return;
    }

    const resolveTableId = (): string | undefined => {
      const info = ctx.getSectionInfo?.(el);
      if (!info) return undefined;
      const occurrence = info.text
        ? findTableOccurrenceInDocument(info.text, {
            startLine: info.lineStart,
            isCodeBlock: true,
          })
        : 0;
      return buildStableTableId({
        sourcePath: ctx.sourcePath,
        headers: tables[0].headers,
        occurrence,
      });
    };

    const resolvedAtProcess = resolveTableId();
    if (resolvedAtProcess) {
      tables[0].id = resolvedAtProcess;
    }

    const view = this.viewController.createCodeBlockView({
      sourcePath: ctx.sourcePath,
      tableData: tables[0],
      initialSource: source,
      getLineStart: () => ctx.getSectionInfo?.(el)?.lineStart,
    });

    const viewEl = view.getElement();
    el.appendChild(viewEl);
    ctx.addChild(
      new TableRenderChild(viewEl, view, this.registry, () => {
        if (resolvedAtProcess) return;
        const mountedId = resolveTableId();
        if (mountedId && mountedId !== tables[0].id) {
          this.viewController.rebindTableId?.(view, mountedId);
        }
      })
    );
  }
}
