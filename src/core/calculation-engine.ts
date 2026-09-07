import { CalculationType, ColumnType, MarkdownTableRow } from "../types";
import { parseCellTags } from "./tag-parser";
import { isCellChecked, parseCellNumber } from "./sort-engine";

export interface CalculationResult {
  label: string;
  value: string;
}

export function isCellFilled(cell: string): boolean {
  const trimmed = cell.trim();
  return Boolean(trimmed && trimmed !== "-");
}

export function extractNumbers(cells: string[]): number[] {
  const nums: number[] = [];
  for (const cell of cells) {
    const num = parseCellNumber(cell);
    if (!isNaN(num)) nums.push(num);
  }
  return nums;
}

export function calculateColumnSummary(
  rows: MarkdownTableRow[],
  columnIndex: number,
  calculation: CalculationType,
  columnType: ColumnType
): CalculationResult | null {
  if (calculation === "none" || !calculation) {
    return null;
  }

  const cells = rows.map((r) => r.cells[columnIndex] || "");
  const total = cells.length;

  switch (calculation) {
    case "count_all":
      return { label: "Count", value: `${total}` };

    case "count_values":
    case "count_not_empty": {
      const count = cells.filter(isCellFilled).length;
      return { label: calculation === "count_values" ? "Values" : "Not empty", value: `${count}` };
    }

    case "count_unique": {
      const set = new Set<string>();
      for (const cell of cells) {
        if (columnType === "multi-select" || columnType === "select") {
          const tags = parseCellTags(cell);
          for (const t of tags) set.add(t.id);
        } else {
          const trimmed = cell.trim().toLowerCase();
          if (trimmed && trimmed !== "-") set.add(trimmed);
        }
      }
      return { label: "Unique", value: `${set.size}` };
    }

    case "count_empty": {
      const emptyCount = cells.filter((c) => !isCellFilled(c)).length;
      return { label: "Empty", value: `${emptyCount}` };
    }

    case "sum": {
      const nums = extractNumbers(cells);
      const sum = nums.reduce((acc, val) => acc + val, 0);
      return { label: "Sum", value: `${Math.round(sum * 100) / 100}` };
    }

    case "average": {
      const nums = extractNumbers(cells);
      if (nums.length === 0) return { label: "Average", value: "0" };
      const sum = nums.reduce((acc, val) => acc + val, 0);
      const avg = sum / nums.length;
      return { label: "Average", value: `${Math.round(avg * 100) / 100}` };
    }

    case "min": {
      const nums = extractNumbers(cells);
      if (nums.length === 0) return { label: "Min", value: "-" };
      return { label: "Min", value: `${Math.min(...nums)}` };
    }

    case "max": {
      const nums = extractNumbers(cells);
      if (nums.length === 0) return { label: "Max", value: "-" };
      return { label: "Max", value: `${Math.max(...nums)}` };
    }

    case "count_checked": {
      const checked = cells.filter(isCellChecked).length;
      return { label: "Checked", value: `${checked}` };
    }

    case "count_unchecked": {
      const unchecked = cells.filter((c) => !isCellChecked(c)).length;
      return { label: "Unchecked", value: `${unchecked}` };
    }

    case "percent_checked": {
      if (total === 0) return { label: "Checked", value: "0%" };
      const checked = cells.filter(isCellChecked).length;
      const pct = Math.round((checked / total) * 100);
      return { label: "Checked", value: `${pct}%` };
    }

    case "percent_unchecked": {
      if (total === 0) return { label: "Unchecked", value: "0%" };
      const unchecked = cells.filter((c) => !isCellChecked(c)).length;
      const pct = Math.round((unchecked / total) * 100);
      return { label: "Unchecked", value: `${pct}%` };
    }

    default:
      return null;
  }
}

export interface CalculationOption {
  value: CalculationType;
  label: string;
}

export function getCalculationOptionsForColumnType(type: ColumnType): CalculationOption[] {
  if (type === "number") {
    return [
      { value: "none", label: "None" },
      { value: "sum", label: "Sum" },
      { value: "average", label: "Average" },
      { value: "min", label: "Min" },
      { value: "max", label: "Max" },
      { value: "count_all", label: "Count all" },
    ];
  }
  if (type === "checkbox") {
    return [
      { value: "none", label: "None" },
      { value: "count_checked", label: "Count checked" },
      { value: "count_unchecked", label: "Count unchecked" },
      { value: "percent_checked", label: "Percent checked" },
      { value: "percent_unchecked", label: "Percent unchecked" },
    ];
  }
  return [
    { value: "none", label: "None" },
    { value: "count_all", label: "Count all" },
    { value: "count_values", label: "Count values" },
    { value: "count_unique", label: "Count unique" },
    { value: "count_empty", label: "Count empty" },
    { value: "count_not_empty", label: "Count not empty" },
  ];
}
