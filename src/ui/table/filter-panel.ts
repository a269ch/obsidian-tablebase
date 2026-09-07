import { getFilterOperatorsForColumnType } from "../../core/filter-engine";
import { Conjunction, FilterOperator, FilterRule, TableColumn } from "../../types";
import { appendIcon, appendIconLabel } from "../../utils/dom";
import { ICON_CROSS, ICON_PLUS } from "../icons";
import { TableViewContext } from "./types";

const VALUELESS_OPERATORS = new Set<FilterOperator>(["is_empty", "is_not_empty"]);
const MULTI_VALUE_OPERATORS = new Set<FilterOperator>(["is_one_of", "is_not_one_of"]);

function createFilterRule(column: TableColumn | undefined, conjunction: Conjunction): FilterRule {
  return {
    id: `rule_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    column: column ? column.name : "",
    columnIndex: column ? column.index : 0,
    operator: "contains",
    value: "",
    enabled: true,
    conjunction,
  };
}

export class FilterPanel {
  private ctx: TableViewContext;
  private activeRuleId: string | null = null;
  private activeCursorPos: number | null = null;

  constructor(ctx: TableViewContext) {
    this.ctx = ctx;
  }

  public render(container: HTMLElement): void {
    const { filterState } = this.ctx;
    const panel = container.createDiv({
      cls: "ms-table-toolbar-wrapper ms-filter-panel",
    });
    const rulesList = panel.createDiv({ cls: "ms-rules-list" });

    if (!filterState.rules || filterState.rules.length === 0) {
      this.renderEmptyState(rulesList);
      return;
    }

    filterState.rules.forEach((rule, index) => {
      this.renderRuleRow(rulesList, rule, index);
    });

    this.renderFooter(panel);
  }

  private addRule(): void {
    const { filterState, columns } = this.ctx;
    filterState.rules.push(
      createFilterRule(columns[0], filterState.conjunction || "AND")
    );
    this.commit();
  }

  private commit(): void {
    this.ctx.actions.onFilterChange(this.ctx.filterState);
    this.ctx.render();
  }

  private renderEmptyState(rulesList: HTMLElement): void {
    const emptyRow = rulesList.createDiv({ cls: "ms-filter-empty-row" });
    emptyRow.createSpan({ cls: "ms-empty-text", text: "No filter rules applied." });

    const addBtn = emptyRow.createEl("button", { cls: "ms-add-filter-btn" });
    appendIconLabel(addBtn, ICON_PLUS, "Add filter rule");
    addBtn.addEventListener("click", () => this.addRule());
  }

  private renderRuleRow(rulesList: HTMLElement, rule: FilterRule, index: number): void {
    const { filterState, columns } = this.ctx;
    const row = rulesList.createDiv({ cls: "ms-filter-rule-row" });
    const prefixWrap = row.createDiv({ cls: "ms-rule-prefix-wrap" });

    if (index === 0) {
      prefixWrap.createSpan({ cls: "ms-rule-prefix-label", text: "Where" });
    } else {
      const conjSelect = prefixWrap.createEl("select", { cls: "ms-conjunction-select" });
      conjSelect.createEl("option", { value: "AND", text: "And" });
      conjSelect.createEl("option", { value: "OR", text: "Or" });
      conjSelect.value = rule.conjunction || filterState.conjunction || "AND";
      conjSelect.addEventListener("change", (e) => {
        rule.conjunction = (e.target as HTMLSelectElement).value as Conjunction;
        this.commit();
      });
    }

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

    const column = columns[rule.columnIndex];
    const opSelect = row.createEl("select", { cls: "ms-rule-op-select" });
    for (const operator of getFilterOperatorsForColumnType(column ? column.type : "text")) {
      const option = opSelect.createEl("option", {
        value: operator.value,
        text: operator.label,
      });
      option.selected = operator.value === rule.operator;
    }
    opSelect.addEventListener("change", (e) => {
      rule.operator = (e.target as HTMLSelectElement).value as FilterOperator;
      this.commit();
    });

    if (!VALUELESS_OPERATORS.has(rule.operator)) {
      this.renderValueInput(row, rule);
    }

    const deleteBtn = row.createEl("button", {
      cls: "ms-delete-rule-btn",
      attr: { title: "Remove filter rule" },
    });
    appendIcon(deleteBtn, ICON_CROSS);
    deleteBtn.addEventListener("click", () => {
      filterState.rules.splice(index, 1);
      this.commit();
    });
  }

  private renderValueInput(row: HTMLElement, rule: FilterRule): void {
    const isMultiValue = MULTI_VALUE_OPERATORS.has(rule.operator);
    const input = row.createEl("input", {
      type: "text",
      cls: "ms-rule-text-input",
      placeholder: isMultiValue ? "Tags (e.g. Done, In Progress)..." : "Value...",
      value: Array.isArray(rule.value) ? rule.value.join(", ") : rule.value,
    });

    if (this.activeRuleId === rule.id) {
      input.focus();
      if (this.activeCursorPos !== null) {
        const position = Math.min(this.activeCursorPos, input.value.length);
        input.setSelectionRange(position, position);
      }
    }

    input.addEventListener("input", (e) => {
      const target = e.target as HTMLInputElement;
      this.activeRuleId = rule.id;
      this.activeCursorPos = target.selectionStart;
      rule.value = target.value;
      this.ctx.actions.onFilterChange(this.ctx.filterState);
      this.ctx.renderRows();
    });

    input.addEventListener("blur", () => {
      if (this.activeRuleId !== rule.id) return;
      this.activeRuleId = null;
      this.activeCursorPos = null;
    });
  }

  private renderFooter(panel: HTMLElement): void {
    const footer = panel.createDiv({ cls: "ms-panel-footer" });

    const addBtn = footer.createEl("button", { cls: "ms-add-filter-btn" });
    appendIconLabel(addBtn, ICON_PLUS, "Add filter rule");
    addBtn.addEventListener("click", () => this.addRule());

    const clearBtn = footer.createEl("button", {
      cls: "ms-clear-filters-btn",
      text: "Clear all filters",
    });
    clearBtn.addEventListener("click", () => {
      this.ctx.filterState.rules = [];
      this.commit();
    });
  }
}
