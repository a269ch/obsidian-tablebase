import {
  CalculationType,
  ColumnAlignment,
  ColumnType,
  DateFormatOption,
  MarkdownTableData,
  MarkdownTableRow,
  TableColumn,
} from "../types";
import { isCalculationAllowedFor } from "./calculation-engine";
import { formatDateByOption, parseDateByOption } from "./date-utils";
import { formatColumnAlignmentToken } from "./markdown-parser";

export function applyCellUpdate(
  tableData: MarkdownTableData,
  rowIndex: number,
  colIndex: number,
  newValue: string
): void {
  if (tableData.rows[rowIndex]) {
    tableData.rows[rowIndex].cells[colIndex] = newValue;
  }
}

export function applyAddRow(
  tableData: MarkdownTableData,
  columnCount: number,
  atIndex?: number,
  prefilledCells?: string[]
): MarkdownTableRow {
  const newRowCells: string[] =
    prefilledCells && prefilledCells.length === columnCount
      ? [...prefilledCells]
      : new Array<string>(columnCount).fill("");

  const insertIdx =
    atIndex !== undefined && atIndex >= 0 && atIndex <= tableData.rows.length
      ? atIndex
      : tableData.rows.length;

  const newRow: MarkdownTableRow = {
    rowIndex: insertIdx,
    rawLine: "",
    cells: newRowCells,
  };

  tableData.rows.splice(insertIdx, 0, newRow);
  tableData.rows.forEach((r, idx) => (r.rowIndex = idx));
  return newRow;
}

export function applyDuplicateRow(
  tableData: MarkdownTableData,
  rowIndex: number
): MarkdownTableRow | null {
  const source = tableData.rows[rowIndex];
  if (!source) return null;

  const duplicatedCells = [...source.cells];
  const insertIdx = rowIndex + 1;
  const newRow: MarkdownTableRow = {
    rowIndex: insertIdx,
    rawLine: "",
    cells: duplicatedCells,
  };

  tableData.rows.splice(insertIdx, 0, newRow);
  tableData.rows.forEach((r, idx) => (r.rowIndex = idx));
  return newRow;
}

export function applyDeleteRow(
  tableData: MarkdownTableData,
  rowIndex: number
): MarkdownTableRow | null {
  if (rowIndex < 0 || rowIndex >= tableData.rows.length) return null;
  const [removed] = tableData.rows.splice(rowIndex, 1);
  tableData.rows.forEach((r, idx) => (r.rowIndex = idx));
  return removed || null;
}

export const TYPE_ANNOTATION_REGEX =
  /\s*\[(text|multi-select|select|number|checkbox|date)(?::([^\]]+))?\]$/i;

export const SINGLE_SELECT_KEYWORDS =
  /^(status|priority|state|stage)$/i;

export const MULTI_SELECT_KEYWORDS =
  /^(tags?|labels?|categories|category|keywords?)$/i;

export const DATE_KEYWORDS =
  /^(date|dates|due\s*date|due|duedate|deadline|deadlines|scheduled?|schedule|created(\s*at)?|updated(\s*at)?|modified(\s*at)?|start(\s*date)?|end(\s*date)?|target(\s*date)?|completed(\s*at)?|closed(\s*at)?|published(\s*at)?|release(\s*date)?|day|timestamp)$/i;

export function stripTypeAnnotation(name: string): string {
  return name.replace(TYPE_ANNOTATION_REGEX, "").trim();
}

export function formatColumnHeader(
  name: string,
  type: ColumnType,
  dateFormat?: DateFormatOption,
  options: { explicit?: boolean; calculation?: CalculationType } = {}
): string {
  const cleanName = stripTypeAnnotation(name);
  const calculation =
    options.calculation && options.calculation !== "none" ? options.calculation : undefined;

  // An un-annotated header is re-detected from its values on every render, so
  // a type the user picked by hand has to be written down to survive — and a
  // calculation has nowhere to live without one.
  if (!options.explicit && !calculation) {
    if (type === "text") {
      const wouldBeDetectedAsAnotherType =
        SINGLE_SELECT_KEYWORDS.test(cleanName) ||
        MULTI_SELECT_KEYWORDS.test(cleanName) ||
        DATE_KEYWORDS.test(cleanName);
      if (!wouldBeDetectedAsAnotherType) return cleanName;
    } else if (type === "select" && SINGLE_SELECT_KEYWORDS.test(cleanName)) {
      return cleanName;
    }
  }

  const params: string[] = [];
  if (type === "date") {
    params.push(dateFormat || "YYYY-MM-DD");
  }
  if (calculation) {
    params.push(calculation);
  }

  return params.length > 0
    ? `${cleanName} [${type}:${params.join(",")}]`
    : `${cleanName} [${type}]`;
}

export function applyAddColumn(
  tableData: MarkdownTableData,
  columns: TableColumn[],
  name: string,
  type: ColumnType,
  atIndex?: number,
  dateFormat?: DateFormatOption
): TableColumn {
  const insertIdx =
    atIndex !== undefined && atIndex >= 0 && atIndex <= tableData.headers.length
      ? atIndex
      : tableData.headers.length;

  const headerText = formatColumnHeader(name, type, dateFormat);
  const cleanName = stripTypeAnnotation(name);

  tableData.headers.splice(insertIdx, 0, headerText);
  if (tableData.alignments) {
    tableData.alignments.splice(
      insertIdx,
      0,
      type === "checkbox" ? ":---:" : type === "number" ? "---:" : "---"
    );
  }
  tableData.rows.forEach((r) => r.cells.splice(insertIdx, 0, ""));

  const newCol: TableColumn = {
    name: cleanName,
    index: insertIdx,
    type,
    align: type === "checkbox" ? "center" : type === "number" ? "right" : "left",
    ...(type === "date" ? { dateFormat: dateFormat || "YYYY-MM-DD" } : {}),
  };

  columns.splice(insertIdx, 0, newCol);
  columns.forEach((c, idx) => (c.index = idx));
  return newCol;
}

export function applyRenameColumn(
  tableData: MarkdownTableData,
  columns: TableColumn[],
  colIndex: number,
  newName: string
): void {
  const col = columns[colIndex];
  const explicitTypeMatch = newName.match(TYPE_ANNOTATION_REGEX);
  const cleanName = stripTypeAnnotation(newName);
  const targetType = explicitTypeMatch
    ? (explicitTypeMatch[1].toLowerCase() as ColumnType)
    : col
    ? col.type
    : "text";

  const targetDateFormat = explicitTypeMatch && explicitTypeMatch[2]
    ? (explicitTypeMatch[2].trim().toUpperCase() as DateFormatOption)
    : col?.dateFormat;

  if (col) {
    col.name = cleanName;
    col.type = targetType;
    if (targetType === "date") {
      col.dateFormat = targetDateFormat || "YYYY-MM-DD";
    } else {
      delete col.dateFormat;
    }
  }

  const hadExplicitType = TYPE_ANNOTATION_REGEX.test(tableData.headers[colIndex] ?? "");
  const headerText = formatColumnHeader(
    cleanName,
    targetType,
    targetDateFormat || col?.dateFormat,
    {
      explicit: hadExplicitType || Boolean(explicitTypeMatch),
      calculation: col?.calculation,
    }
  );
  if (colIndex >= 0 && colIndex < tableData.headers.length) {
    tableData.headers[colIndex] = headerText;
  }
}

export function applyChangeColumnType(
  tableData: MarkdownTableData,
  columns: TableColumn[],
  colIndex: number,
  newType: ColumnType,
  dateFormat?: DateFormatOption
): void {
  const col = columns[colIndex];
  if (!col) return;

  col.type = newType;
  if (newType === "checkbox") {
    col.align = "center";
    if (tableData.alignments && colIndex < tableData.alignments.length) {
      tableData.alignments[colIndex] = ":---:";
    }
  } else if (newType === "number") {
    if (!col.align || col.align === "left") {
      col.align = "right";
      if (tableData.alignments && colIndex < tableData.alignments.length) {
        tableData.alignments[colIndex] = "---:";
      }
    }
  }
  if (newType === "date") {
    col.dateFormat = dateFormat || col.dateFormat || "YYYY-MM-DD";
  } else {
    delete col.dateFormat;
  }

  // "Sum" makes no sense on a checkbox, so an incompatible one is dropped.
  if (!isCalculationAllowedFor(newType, col.calculation)) {
    delete col.calculation;
  }

  const cleanName = stripTypeAnnotation(col.name);
  col.name = cleanName;

  const headerText = formatColumnHeader(cleanName, newType, col.dateFormat, {
    explicit: true,
    calculation: col.calculation,
  });
  if (colIndex >= 0 && colIndex < tableData.headers.length) {
    tableData.headers[colIndex] = headerText;
  }
}

export function applyChangeColumnDateFormat(
  tableData: MarkdownTableData,
  columns: TableColumn[],
  colIndex: number,
  newDateFormat: DateFormatOption
): void {
  const col = columns[colIndex];
  if (!col || col.type !== "date") return;

  const oldFormat = col.dateFormat || "YYYY-MM-DD";
  col.dateFormat = newDateFormat;

  const cleanName = stripTypeAnnotation(col.name);
  col.name = cleanName;

  const headerText = formatColumnHeader(cleanName, "date", newDateFormat, {
    calculation: col.calculation,
  });
  if (colIndex >= 0 && colIndex < tableData.headers.length) {
    tableData.headers[colIndex] = headerText;
  }

  if (oldFormat !== newDateFormat) {
    for (const row of tableData.rows) {
      const cell = (row.cells[colIndex] || "").trim();
      if (cell) {
        const parsed = parseDateByOption(cell, oldFormat);
        if (parsed) {
          row.cells[colIndex] = formatDateByOption(parsed, newDateFormat);
        }
      }
    }
  }
}

export function applyDeleteColumn(
  tableData: MarkdownTableData,
  columns: TableColumn[],
  colIndex: number
): void {
  if (colIndex >= 0 && colIndex < tableData.headers.length) {
    tableData.headers.splice(colIndex, 1);
    if (tableData.alignments && colIndex < tableData.alignments.length) {
      tableData.alignments.splice(colIndex, 1);
    }
    tableData.rows.forEach((r) => r.cells.splice(colIndex, 1));
  }
  if (colIndex >= 0 && colIndex < columns.length) {
    columns.splice(colIndex, 1);
    columns.forEach((c, idx) => (c.index = idx));
  }
}

export function applyChangeColumnCalculation(
  tableData: MarkdownTableData,
  columns: TableColumn[],
  colIndex: number,
  calculation: CalculationType
): void {
  const col = columns[colIndex];
  if (!col) return;

  if (calculation === "none") {
    delete col.calculation;
  } else {
    col.calculation = calculation;
  }

  const hadExplicitType = TYPE_ANNOTATION_REGEX.test(tableData.headers[colIndex] ?? "");
  const headerText = formatColumnHeader(col.name, col.type, col.dateFormat, {
    explicit: hadExplicitType,
    calculation: col.calculation,
  });

  if (colIndex >= 0 && colIndex < tableData.headers.length) {
    tableData.headers[colIndex] = headerText;
  }
}

export function applyChangeColumnAlignment(
  tableData: MarkdownTableData,
  columns: TableColumn[],
  colIndex: number,
  newAlignment: ColumnAlignment
): void {
  if (colIndex < 0 || colIndex >= columns.length) return;
  const col = columns[colIndex];
  if (col) {
    col.align = newAlignment;
  }
  if (!tableData.alignments) {
    tableData.alignments = new Array<string>(tableData.headers.length).fill("---");
  }
  while (tableData.alignments.length < tableData.headers.length) {
    tableData.alignments.push("---");
  }
  tableData.alignments[colIndex] = formatColumnAlignmentToken(newAlignment);
}

export function applyReorderRows(
  tableData: MarkdownTableData,
  fromIndex: number,
  toIndex: number
): void {
  if (
    fromIndex === toIndex ||
    fromIndex < 0 ||
    fromIndex >= tableData.rows.length ||
    toIndex < 0 ||
    toIndex >= tableData.rows.length
  ) {
    return;
  }

  const [movedRow] = tableData.rows.splice(fromIndex, 1);
  tableData.rows.splice(toIndex, 0, movedRow);
  tableData.rows.forEach((r, idx) => (r.rowIndex = idx));
}

export function applyReorderColumns(
  tableData: MarkdownTableData,
  columns: TableColumn[],
  fromIndex: number,
  toIndex: number
): void {
  if (
    fromIndex === toIndex ||
    fromIndex < 0 ||
    fromIndex >= tableData.headers.length ||
    toIndex < 0 ||
    toIndex >= tableData.headers.length
  ) {
    return;
  }

  const [movedCol] = columns.splice(fromIndex, 1);
  columns.splice(toIndex, 0, movedCol);
  columns.forEach((c, idx) => (c.index = idx));

  const [movedHeader] = tableData.headers.splice(fromIndex, 1);
  tableData.headers.splice(toIndex, 0, movedHeader);

  if (tableData.alignments && tableData.alignments.length > fromIndex) {
    const [movedAlign] = tableData.alignments.splice(fromIndex, 1);
    tableData.alignments.splice(toIndex, 0, movedAlign);
  }

  tableData.rows.forEach((r) => {
    const [movedCell] = r.cells.splice(fromIndex, 1);
    r.cells.splice(toIndex, 0, movedCell);
  });
}
