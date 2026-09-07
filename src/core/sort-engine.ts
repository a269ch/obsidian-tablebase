import { MarkdownTableRow, SortDirection, SortRule, TableColumn } from "../types";
import { parseCellTags } from "./tag-parser";
import { compareDateStrings } from "./date-utils";

const CHECKED_VALUES = new Set<string>([
  "[x]",
  "x",
  "true",
  "yes",
  "1",
  "✓",
  "✔",
]);

// Currency symbols and percent signs stripped before numeric parsing
const CURRENCY_AND_PERCENT = /[$€£¥₽%]/g;
// Matches whitespace characters
const WHITESPACE = /\s+/g;
// Everything except digits, decimal point and minus sign
const NON_NUMERIC = /[^\d.-]/g;

export function isCellChecked(cell: string): boolean {
  return CHECKED_VALUES.has((cell || "").trim().toLowerCase());
}

export function parseCellNumber(cell: string): number {
  if (!cell) return NaN;
  let s = cell.trim().replace(CURRENCY_AND_PERCENT, "").replace(WHITESPACE, "");

  if (s.includes(",") && !s.includes(".")) {
    s = s.replace(",", ".");
  } else if (s.includes(",") && s.includes(".")) {
    if (s.indexOf(",") < s.indexOf(".")) {
      s = s.replace(/,/g, "");
    } else {
      s = s.replace(/\./g, "").replace(",", ".");
    }
  }

  return parseFloat(s.replace(NON_NUMERIC, ""));
}

function isEmptyCell(value: string): boolean {
  const trimmed = value.trim();
  return trimmed === "" || trimmed === "-";
}

function compareByType(
  valA: string,
  valB: string,
  columnType: TableColumn["type"]
): number {
  switch (columnType) {
    case "number": {
      const numA = parseCellNumber(valA);
      const numB = parseCellNumber(valB);
      if (isNaN(numA) && isNaN(numB)) return 0;
      if (isNaN(numA)) return 1;
      if (isNaN(numB)) return -1;
      return numA - numB;
    }

    case "checkbox": {
      return (isCellChecked(valA) ? 1 : 0) - (isCellChecked(valB) ? 1 : 0);
    }

    case "multi-select": {
      const tagsA = parseCellTags(valA);
      const tagsB = parseCellTags(valB);
      const nameA = tagsA.length > 0 ? tagsA[0].name.toLowerCase() : "";
      const nameB = tagsB.length > 0 ? tagsB[0].name.toLowerCase() : "";
      return nameA.localeCompare(nameB);
    }

    case "date": {
      return compareDateStrings(valA, valB);
    }

    case "text":
    case "select":
    default: {
      return valA.localeCompare(valB, undefined, {
        numeric: true,
        sensitivity: "base",
      });
    }
  }
}

export function compareRowsByColumn(
  a: MarkdownTableRow,
  b: MarkdownTableRow,
  columnIndex: number,
  direction: SortDirection,
  columnType: TableColumn["type"] = "text"
): number {
  const valA = a.cells[columnIndex] || "";
  const valB = b.cells[columnIndex] || "";

  const isEmptyA = isEmptyCell(valA);
  const isEmptyB = isEmptyCell(valB);
  if (isEmptyA && isEmptyB) return 0;
  if (isEmptyA) return 1;
  if (isEmptyB) return -1;

  const factor = direction === "asc" ? 1 : -1;
  return compareByType(valA, valB, columnType) * factor;
}

export function sortRows(
  rows: MarkdownTableRow[],
  columnIndex: number,
  direction: SortDirection,
  columnType: TableColumn["type"] = "text"
): MarkdownTableRow[] {
  return [...rows].sort((a, b) =>
    compareRowsByColumn(a, b, columnIndex, direction, columnType)
  );
}

export function sortRowsByRules(
  rows: MarkdownTableRow[],
  sortRules: SortRule[],
  columns: TableColumn[]
): MarkdownTableRow[] {
  if (!sortRules || sortRules.length === 0) {
    return rows;
  }

  return [...rows].sort((a, b) => {
    for (const rule of sortRules) {
      const column = columns[rule.columnIndex];
      const result = compareRowsByColumn(
        a,
        b,
        rule.columnIndex,
        rule.direction,
        column ? column.type : "text"
      );
      if (result !== 0) {
        return result;
      }
    }
    return 0;
  });
}
