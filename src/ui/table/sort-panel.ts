import { SortDirection, SortRule, TableColumn } from "../../types";
import { appendIcon, appendIconLabel } from "../../utils/dom";
import { ICON_CROSS, ICON_PLUS } from "../icons";
import { TableViewContext } from "./types";

function createSortRule(column: TableColumn | undefined): SortRule {
  return {
    column: column ? column.name : "",
    columnIndex: column ? column.index : 0,
    direction: "asc",
  };
}

export class SortPanel {
  private ctx: TableViewContext;

  constructor(ctx: TableViewContext) {
    this.ctx = ctx;
  }

  public render(container: HTMLElement): void {
    const { filterState } = this.ctx;
    const panel = container.createDiv({ cls: "ms-table-toolbar-wrapper ms-sort-panel" });
    const rulesList = panel.createDiv({ cls: "ms-rules-list" });

    if (!filterState.sortRules || filterState.sortRules.length === 0) {
      this.renderEmptyState(rulesList);
      return;
    }

    filterState.sortRules.forEach((rule, index) => {
      this.renderRuleRow(rulesList, rule, index);
    });

    this.renderFooter(panel);
  }

  private commit(): void {
    this.ctx.actions.onSortChange(this.ctx.filterState.sortRules);
    this.ctx.render();
  }

  private renderEmptyState(rulesList: HTMLElement): void {
    const emptyRow = rulesList.createDiv({ cls: "ms-filter-empty-row" });
    emptyRow.createSpan({ cls: "ms-empty-text", text: "No sorts applied." });

    const addBtn = emptyRow.createEl("button", {
      cls: "ms-add-filter-btn",
      text: "+ Add sort",
    });
    addBtn.addEventListener("click", () => {
      this.ctx.filterState.sortRules = [createSortRule(this.ctx.columns[0])];
      this.commit();
    });
  }

  private renderRuleRow(rulesList: HTMLElement, rule: SortRule, index: number): void {
    const { filterState, columns } = this.ctx;
    const row = rulesList.createDiv({ cls: "ms-filter-rule-row ms-sort-rule-row" });

    const prefixWrap = row.createDiv({ cls: "ms-rule-prefix-wrap" });
    prefixWrap.createSpan({
      cls: "ms-rule-prefix-label",
      text: index === 0 ? "Sort by" : "Then by",
    });

    const colSelect = row.createEl("select", { cls: "ms-rule-col-select" });
    for (const col of columns) {
      const option = colSelect.createEl("option", {
        value: `${col.index}`,
        text: col.name,
      });
      option.selected = col.index === rule.columnIndex;
    }
    colSelect.addEventListener("change", (e) => {
      const selected = parseInt((e.target as HTMLSelectElement).value, 10);
      rule.columnIndex = selected;
      rule.column = columns[selected]?.name ?? "";
      this.commit();
    });

    const dirSelect = row.createEl("select", { cls: "ms-rule-op-select" });
    dirSelect.createEl("option", { value: "asc", text: "Ascending" });
    dirSelect.createEl("option", { value: "desc", text: "Descending" });
    dirSelect.value = rule.direction;
    dirSelect.addEventListener("change", (e) => {
      rule.direction = (e.target as HTMLSelectElement).value as SortDirection;
      this.commit();
    });

    const deleteBtn = row.createEl("button", {
      cls: "ms-delete-rule-btn",
      attr: { title: "Remove sort rule" },
    });
    appendIcon(deleteBtn, ICON_CROSS);
    deleteBtn.addEventListener("click", () => {
      filterState.sortRules.splice(index, 1);
      this.commit();
    });
  }

  private renderFooter(panel: HTMLElement): void {
    const footer = panel.createDiv({ cls: "ms-panel-footer" });

    const addBtn = footer.createEl("button", { cls: "ms-add-filter-btn" });
    appendIconLabel(addBtn, ICON_PLUS, "Add sort");
    addBtn.addEventListener("click", () => {
      this.ctx.filterState.sortRules.push(createSortRule(this.ctx.columns[0]));
      this.commit();
    });

    const clearBtn = footer.createEl("button", {
      cls: "ms-clear-filters-btn",
      text: "Clear all sorts",
    });
    clearBtn.addEventListener("click", () => {
      this.ctx.filterState.sortRules = [];
      this.commit();
    });
  }
}
