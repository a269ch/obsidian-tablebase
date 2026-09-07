import { MarkdownPostProcessorContext } from "obsidian";
import { TableViewController } from "../services/table-view-controller";
import { TableViewRegistry } from "../services/table-view-registry";
import { MarkdownTableData, MarkdownTableRow } from "../types";
import { TableRenderChild } from "./table-render-child";

const SKIP_CONTAINER_CLASSES = ["ms-notion-database-container", "ms-kanban-container"];

export class TablePostProcessor {
  private viewController: TableViewController;
  private registry: TableViewRegistry;

  constructor(viewController: TableViewController, registry: TableViewRegistry) {
    this.viewController = viewController;
    this.registry = registry;
  }

  public process(el: HTMLElement, ctx: MarkdownPostProcessorContext): void {
    if (SKIP_CONTAINER_CLASSES.some((cls) => el.classList.contains(cls))) {
      return;
    }

    const tables = el.querySelectorAll("table");
    tables.forEach((tableEl, tableIndex) => {
      this.enhanceTable(tableEl, ctx, tableIndex);
    });
  }

  private shouldSkip(tableEl: HTMLTableElement): boolean {
    if (tableEl.dataset.msEnhanced === "true") return true;
    if (tableEl.classList.contains("ms-db-grid-table")) return true;
    if (SKIP_CONTAINER_CLASSES.some((cls) => tableEl.closest(`.${cls}`))) return true;
    return Boolean(
      tableEl.previousElementSibling?.classList.contains("ms-notion-database-container")
    );
  }

  private enhanceTable(
    tableEl: HTMLTableElement,
    ctx: MarkdownPostProcessorContext,
    tableIndex: number
  ): void {
    if (this.shouldSkip(tableEl)) return;

    const headers = Array.from(tableEl.querySelectorAll("thead th")).map(
      (th) => th.textContent?.trim() ?? ""
    );
    if (headers.length === 0) return;

    tableEl.dataset.msEnhanced = "true";

    const rows: MarkdownTableRow[] = Array.from(
      tableEl.querySelectorAll<HTMLTableRowElement>("tbody tr")
    ).map((tr, rowIndex) => ({
      rowIndex,
      rawLine: "",
      cells: Array.from(tr.querySelectorAll("td")).map(
        (td) => td.textContent?.trim() ?? ""
      ),
    }));

    const sectionInfo = ctx.getSectionInfo?.(tableEl) ?? null;
    const startLine = sectionInfo ? sectionInfo.lineStart : -1;
    const endLine = sectionInfo ? sectionInfo.lineEnd : -1;

    const tableData: MarkdownTableData = {
      id: `tbl_${ctx.sourcePath || "doc"}_${startLine}_${tableIndex}`,
      headers: [...headers],
      alignments: new Array<string>(headers.length).fill("---"),
      rows,
      startLine,
      endLine,
      rawMarkdown: "",
    };

    const view = this.viewController.createInlineTableView({
      sourcePath: ctx.sourcePath,
      tableData,
      startLine,
      tableIndex,
    });

    const viewEl = view.getElement();
    tableEl.addClass("ms-table-hidden");
    tableEl.setCssStyles({ display: "none" });
    tableEl.parentNode?.insertBefore(viewEl, tableEl);

    const parentEl = viewEl.parentElement;
    if (parentEl) {
      parentEl.addClass("ms-enhanced-table-wrapper");
    }

    ctx.addChild(new TableRenderChild(viewEl, view, this.registry));
  }
}
