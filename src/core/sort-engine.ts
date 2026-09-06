import { MarkdownTableRow, SortDirection, TableColumn } from "../types";
import { parseCellTags } from "./tag-parser";
import { compareDateStrings } from "./date-utils";

/**
 * Checks if a cell string represents a checked checkbox.
 */
export function isCellChecked(cell: string): boolean {
  const norm = (cell || "").trim().toLowerCase();
  return (
    norm === "[x]" ||
    norm === "x" ||
    norm === "true" ||
    norm === "yes" ||
    norm === "1" ||
    norm === "✓" ||
    norm === "✔"
  );
}

/**
 * Extracts a numeric value from string (e.g. "$1,200.50", "12,5 €", "45%", "3 500", "-50").
 */
export function parseCellNumber(cell: string): number {
  if (!cell) return NaN;
  let s = cell.trim();
  // Remove currency symbols, percent, and spaces
  s = s.replace(/[$€£¥₽%]/g, "").replace(/\s+/g, "");

  // Handle European comma decimal vs US comma thousands
  if (s.includes(",") && !s.includes(".")) {
    s = s.replace(",", ".");
  } else if (s.includes(",") && s.includes(".")) {
    if (s.indexOf(",") < s.indexOf(".")) {
      // US format "1,200.50"
      s = s.replace(/,/g, "");
    } else {
      // EU format "1.200,50"
      s = s.replace(/\./g, "").replace(",", ".");
    }
  }

  const clean = s.replace(/[^\d.-]/g, "");
  return parseFloat(clean);
}

/**
 * Sorts table rows according to a specific column and direction.
 */
export function sortRows(
  rows: MarkdownTableRow[],
  columnIndex: number,
  direction: SortDirection,
  columnType: TableColumn["type"] = "text"
): MarkdownTableRow[] {
  const sorted = [...rows];
  const factor = direction === "asc" ? 1 : -1;

  sorted.sort((a, b) => {
    const valA = a.cells[columnIndex] || "";
    const valB = b.cells[columnIndex] || "";

    // Empty values always go to the bottom in ascending, top in descending
    const isEmptyA = !valA.trim() || valA.trim() === "-";
    const isEmptyB = !valB.trim() || valB.trim() === "-";

    if (isEmptyA && isEmptyB) return 0;
    if (isEmptyA) return 1;
    if (isEmptyB) return -1;

    switch (columnType) {
      case "number": {
        const numA = parseCellNumber(valA);
        const numB = parseCellNumber(valB);
        if (isNaN(numA) && isNaN(numB)) return 0;
        if (isNaN(numA)) return 1;
        if (isNaN(numB)) return -1;
        return (numA - numB) * factor;
      }

      case "checkbox": {
        const checkA = isCellChecked(valA) ? 1 : 0;
        const checkB = isCellChecked(valB) ? 1 : 0;
        return (checkA - checkB) * factor;
      }

      case "multi-select": {
        const tagsA = parseCellTags(valA);
        const tagsB = parseCellTags(valB);
        const nameA = tagsA.length > 0 ? tagsA[0].name.toLowerCase() : "";
        const nameB = tagsB.length > 0 ? tagsB[0].name.toLowerCase() : "";
        return nameA.localeCompare(nameB) * factor;
      }

      case "date": {
        return compareDateStrings(valA, valB) * factor;
      }

      case "text":
      case "select":
      default: {
        return (
          valA.localeCompare(valB, undefined, {
            numeric: true,
            sensitivity: "base",
          }) * factor
        );
      }
    }
  });

  return sorted;
}
