import {
  ColumnType,
  FilterOperator,
  FilterRule,
  MarkdownTableRow,
  TableColumn,
  TableFilterState,
} from "../types";
import { parseCellTags } from "./tag-parser";

/**
 * Normalizes string for case-insensitive and trimmed comparison.
 */
export function normalize(str: string): string {
  return (str || "").trim().toLowerCase();
}

/**
 * Parses and normalizes filter input into an array of non-empty strings.
 */
export function parseFilterValues(filterValue: string | string[]): string[] {
  if (Array.isArray(filterValue)) {
    return filterValue.map(normalize).filter((v) => v.length > 0);
  }
  if (typeof filterValue === "string") {
    const rawItems = filterValue.includes(",") ? filterValue.split(",") : [filterValue];
    return rawItems.map(normalize).filter((v) => v.length > 0);
  }
  return [];
}

/**
 * Evaluates a single filter rule against a cell value.
 */
export function evaluateRuleOnCell(
  cellValue: string,
  columnType: ColumnType,
  operator: FilterOperator,
  filterValue: string | string[]
): boolean {
  const normCell = normalize(cellValue);
  const tags = columnType === "multi-select" ? parseCellTags(cellValue) : [];
  const tagNamesLower = tags.map((t) => normalize(t.name));
  const filterList = parseFilterValues(filterValue);
  const singleFilterVal = filterList.length > 0 ? filterList[0] : "";

  switch (operator) {
    case "is_one_of": {
      if (filterList.length === 0) return true;
      if (columnType === "multi-select" || columnType === "select") {
        return filterList.some((f) => tagNamesLower.includes(f) || normCell === f || normCell.includes(f));
      }
      return filterList.some((f) => normCell === f || normCell.includes(f));
    }

    case "is_not_one_of": {
      if (filterList.length === 0) return true;
      if (columnType === "multi-select" || columnType === "select") {
        return !filterList.some((f) => tagNamesLower.includes(f) || normCell === f || normCell.includes(f));
      }
      return !filterList.some((f) => normCell === f || normCell.includes(f));
    }

    case "contains":
    case "contains_any": {
      if (filterList.length === 0) return true;
      if (columnType === "multi-select") {
        return filterList.some((f) => tagNamesLower.includes(f));
      }
      return filterList.some((f) => normCell.includes(f));
    }

    case "does_not_contain":
    case "does_not_contain_any": {
      if (filterList.length === 0) return true;
      if (columnType === "multi-select") {
        return !filterList.some((f) => tagNamesLower.includes(f));
      }
      return !filterList.some((f) => normCell.includes(f));
    }

    case "is_empty": {
      if (columnType === "multi-select") {
        return tags.length === 0;
      }
      return normCell === "" || normCell === "-" || normCell === "n/a";
    }

    case "is_not_empty": {
      if (columnType === "multi-select") {
        return tags.length > 0;
      }
      return normCell !== "" && normCell !== "-" && normCell !== "n/a";
    }

    case "contains_all": {
      if (filterList.length === 0) return true;
      if (columnType === "multi-select") {
        return filterList.every((f) => tagNamesLower.includes(f));
      }
      return filterList.every((f) => normCell.includes(f));
    }

    case "equals": {
      if (columnType === "multi-select") {
        if (filterList.length === 0) return true;
        return tagNamesLower.length === 1 && tagNamesLower[0] === singleFilterVal;
      }
      return normCell === singleFilterVal;
    }

    case "not_equals": {
      if (columnType === "multi-select") {
        if (filterList.length === 0) return true;
        return tagNamesLower.length !== 1 || tagNamesLower[0] !== singleFilterVal;
      }
      return normCell !== singleFilterVal;
    }

    case "starts_with": {
      return normCell.startsWith(singleFilterVal);
    }

    case "ends_with": {
      return normCell.endsWith(singleFilterVal);
    }

    default:
      return true;
  }
}

/**
 * Evaluates a single rule against a table row.
 */
export function evaluateRuleOnRow(
  row: MarkdownTableRow,
  rule: FilterRule,
  columns: TableColumn[]
): boolean {
  if (!rule.enabled) return true;

  const colIdx = rule.columnIndex;
  if (colIdx < 0 || colIdx >= row.cells.length) {
    return true;
  }

  const column = columns[colIdx];
  const colType = column ? column.type : "text";
  const cellValue = row.cells[colIdx] || "";

  return evaluateRuleOnCell(cellValue, colType, rule.operator, rule.value);
}

/**
 * Evaluates the full TableFilterState on a table row.
 */
export function evaluateFilterStateOnRow(
  row: MarkdownTableRow,
  filterState: TableFilterState,
  columns: TableColumn[]
): boolean {
  if (filterState.searchQuery && filterState.searchQuery.trim()) {
    const query = normalize(filterState.searchQuery);
    const rowMatchesSearch = row.cells.some((cell) =>
      normalize(cell).includes(query)
    );
    if (!rowMatchesSearch) {
      return false;
    }
  }

  const activeRules = filterState.rules.filter((r) => r.enabled);
  if (activeRules.length === 0) {
    return true;
  }

  if (filterState.conjunction === "AND") {
    return activeRules.every((rule) =>
      evaluateRuleOnRow(row, rule, columns)
    );
  } else {
    return activeRules.some((rule) =>
      evaluateRuleOnRow(row, rule, columns)
    );
  }
}

/**
 * Filters rows based on the filter state.
 */
export function filterTableRows(
  rows: MarkdownTableRow[],
  filterState: TableFilterState,
  columns: TableColumn[]
): { matchedRows: MarkdownTableRow[]; matchedIndices: Set<number> } {
  const matchedRows: MarkdownTableRow[] = [];
  const matchedIndices = new Set<number>();

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (evaluateFilterStateOnRow(row, filterState, columns)) {
      matchedRows.push(row);
      matchedIndices.add(i);
    }
  }

  return { matchedRows, matchedIndices };
}

export interface FilterOperatorDefinition {
  value: FilterOperator;
  label: string;
}

/**
 * Returns available filter operators and UI labels for a specific column type.
 */
export function getFilterOperatorsForColumnType(colType: ColumnType): FilterOperatorDefinition[] {
  if (colType === "multi-select" || colType === "select") {
    return [
      { value: "is_one_of", label: "is one of" },
      { value: "is_not_one_of", label: "is not one of" },
      { value: "contains", label: "contains" },
      { value: "does_not_contain", label: "does not contain" },
      { value: "contains_all", label: "contains all of" },
      { value: "is_empty", label: "is empty" },
      { value: "is_not_empty", label: "is not empty" },
    ];
  }
  if (colType === "checkbox") {
    return [
      { value: "equals", label: "is checked" },
      { value: "not_equals", label: "is not checked" },
    ];
  }
  return [
    { value: "is_one_of", label: "is one of" },
    { value: "is_not_one_of", label: "is not one of" },
    { value: "contains", label: "contains" },
    { value: "does_not_contain", label: "does not contain" },
    { value: "equals", label: "equals" },
    { value: "is_empty", label: "is empty" },
    { value: "is_not_empty", label: "is not empty" },
  ];
}
