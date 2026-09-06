import { MarkdownTableData, MarkdownTableRow } from "../types";

/**
 * Escapes pipe characters inside markdown table cells.
 */
export function escapeTableCell(content: string): string {
  if (!content || !content.includes("|")) return content || "";

  let result = "";
  let isEscaped = false;
  let inWikiLink = false;
  let inCodeSpan = false;

  for (let i = 0; i < content.length; i++) {
    const char = content[i];
    const nextChar = i + 1 < content.length ? content[i + 1] : "";

    if (char === "\\" && !isEscaped) {
      isEscaped = true;
      result += char;
      continue;
    }

    if (!isEscaped) {
      if (char === "`") {
        inCodeSpan = !inCodeSpan;
      } else if (char === "[" && nextChar === "[") {
        inWikiLink = true;
      } else if (char === "]" && i > 0 && content[i - 1] === "]" && inWikiLink) {
        inWikiLink = false;
      }

      if (char === "|" && !inWikiLink && !inCodeSpan) {
        result += "\\|";
        isEscaped = false;
        continue;
      }
    }

    result += char;
    isEscaped = false;
  }

  return result;
}

/**
 * Unescapes pipe characters for internal processing.
 */
export function unescapeTableCell(content: string): string {
  return content.replace(/\\\|/g, "|");
}

/**
 * Splits a markdown table row line into raw cell strings, respecting escaped pipes,
 * Obsidian wikilinks ([[Note|Alias]]), and inline code spans (`a|b`).
 */
export function splitTableRow(line: string): string[] {
  const trimmed = line.trim();
  let content = trimmed;

  if (content.startsWith("|")) {
    content = content.slice(1);
  }
  if (content.endsWith("|") && !content.endsWith("\\|")) {
    content = content.slice(0, -1);
  }

  const cells: string[] = [];
  let current = "";
  let isEscaped = false;
  let inWikiLink = false;
  let inCodeSpan = false;

  for (let i = 0; i < content.length; i++) {
    const char = content[i];
    const nextChar = i + 1 < content.length ? content[i + 1] : "";

    if (char === "\\" && !isEscaped) {
      isEscaped = true;
      current += char;
      continue;
    }

    if (!isEscaped) {
      if (char === "`") {
        inCodeSpan = !inCodeSpan;
      } else if (char === "[" && nextChar === "[") {
        inWikiLink = true;
      } else if (char === "]" && i > 0 && content[i - 1] === "]" && inWikiLink) {
        inWikiLink = false;
      }

      if (char === "|" && !inWikiLink && !inCodeSpan) {
        cells.push(current.trim());
        current = "";
        isEscaped = false;
        continue;
      }
    }

    current += char;
    isEscaped = false;
  }

  cells.push(current.trim());
  return cells;
}

/**
 * Checks if a line is a markdown table delimiter row (e.g. | --- | :---: | ---: |).
 */
export function isDelimiterRow(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed.includes("-")) return false;

  const cells = splitTableRow(trimmed);
  if (cells.length === 0) return false;

  return cells.every((cell) => /^:?-+:?$/.test(cell.trim()));
}

/**
 * Parses markdown document text and extracts all GFM table structures.
 */
export function parseMarkdownTables(docContent: string): MarkdownTableData[] {
  const lines = docContent.split(/\r?\n/);
  const tables: MarkdownTableData[] = [];

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];

    if (line.includes("|") && i + 1 < lines.length && isDelimiterRow(lines[i + 1])) {
      const startLine = i;
      const headers = splitTableRow(line);
      const delimiterLine = lines[i + 1];
      const alignments = splitTableRow(delimiterLine);

      const rows: MarkdownTableRow[] = [];
      let currentLineIdx = i + 2;

      while (currentLineIdx < lines.length) {
        const rowLine = lines[currentLineIdx];
        if (!rowLine.trim().startsWith("|") && !rowLine.includes("|")) {
          break;
        }

        const rawCells = splitTableRow(rowLine);
        while (rawCells.length < headers.length) {
          rawCells.push("");
        }

        rows.push({
          rowIndex: rows.length,
          rawLine: rowLine,
          cells: rawCells.slice(0, headers.length),
        });

        currentLineIdx++;
      }

      const endLine = currentLineIdx - 1;
      const rawMarkdown = lines.slice(startLine, endLine + 1).join("\n");

      tables.push({
        id: `tbl_${startLine}_${endLine}`,
        headers,
        alignments,
        rows,
        startLine,
        endLine,
        rawMarkdown,
      });

      i = currentLineIdx;
    } else {
      i++;
    }
  }

  return tables;
}

/**
 * Serializes a MarkdownTableData object back to aligned Markdown table text.
 */
export function serializeMarkdownTable(table: MarkdownTableData): string {
  const { headers, alignments, rows } = table;

  const colWidths: number[] = headers.map((h, i) => {
    let max = Math.max(h.length, alignments[i] ? alignments[i].length : 3);
    for (const r of rows) {
      const cell = r.cells[i] || "";
      if (cell.length > max) {
        max = cell.length;
      }
    }
    return max;
  });

  const headerStr =
    "| " +
    headers
      .map((h, i) => escapeTableCell(h || "").padEnd(colWidths[i], " "))
      .join(" | ") +
    " |";

  const delimiterStr =
    "| " +
    headers
      .map((_, i) => {
        const align = alignments[i] || "---";
        const width = colWidths[i];
        const isLeft = align.startsWith(":");
        const isRight = align.endsWith(":");
        if (isLeft && isRight) {
          return ":" + "-".repeat(Math.max(1, width - 2)) + ":";
        } else if (isRight) {
          return "-".repeat(Math.max(2, width - 1)) + ":";
        } else if (isLeft) {
          return ":" + "-".repeat(Math.max(2, width - 1));
        } else {
          return "-".repeat(Math.max(3, width));
        }
      })
      .join(" | ") +
    " |";

  const rowStrings = rows.map((row) => {
    return (
      "| " +
      headers
        .map((_, i) => escapeTableCell(row.cells[i] || "").padEnd(colWidths[i], " "))
        .join(" | ") +
      " |"
    );
  });

  return [headerStr, delimiterStr, ...rowStrings].join("\n");
}

/**
 * Finds the target table by line, headers or index with reliable fallbacks.
 */
export function findTargetTable(
  tables: MarkdownTableData[],
  startLine: number,
  headers?: string[],
  tableIndex?: number
): MarkdownTableData | undefined {
  if (tables.length === 0) return undefined;

  if (startLine >= 0) {
    const byLine = tables.find(
      (t) => t.startLine === startLine || (startLine >= t.startLine && startLine <= t.endLine)
    );
    if (byLine) return byLine;
  }

  if (headers && headers.length > 0) {
    const byHeaders = tables.find((t) =>
      t.headers.length === headers.length &&
      t.headers.every((h, i) => h.trim().toLowerCase() === headers[i]?.trim().toLowerCase())
    );
    if (byHeaders) return byHeaders;
  }

  if (tableIndex !== undefined && tableIndex >= 0 && tableIndex < tables.length) {
    return tables[tableIndex];
  }

  return tables[0];
}

/**
 * Mutates a target table within a markdown document text and returns the updated document text.
 * The mutator callback receives the resolved table and can modify it in place.
 * Returning false from the callback cancels the mutation and preserves original document content.
 */
export function mutateTableInDocument(
  docContent: string,
  startLine: number,
  mutator: (table: MarkdownTableData) => boolean | void,
  headers?: string[],
  tableIndex?: number
): string {
  const tables = parseMarkdownTables(docContent);
  const targetTable = findTargetTable(tables, startLine, headers, tableIndex);
  if (!targetTable) return docContent;

  const result = mutator(targetTable);
  if (result === false) return docContent;

  const isCrlf = docContent.includes("\r\n");
  const eol = isCrlf ? "\r\n" : "\n";
  const newTableLines = serializeMarkdownTable(targetTable).split("\n");
  const lines = docContent.split(/\r?\n/);
  lines.splice(
    targetTable.startLine,
    targetTable.endLine - targetTable.startLine + 1,
    ...newTableLines
  );
  return lines.join(eol);
}

/**
 * Replaces a specific cell in markdown document text and returns the new full document text.
 */
export function updateCellInDocument(
  docContent: string,
  startLine: number,
  rowIndex: number,
  colIndex: number,
  newCellValue: string,
  headers?: string[],
  tableIndex?: number
): string {
  return mutateTableInDocument(
    docContent,
    startLine,
    (table) => {
      if (!table.rows[rowIndex]) return false;
      table.rows[rowIndex].cells[colIndex] = newCellValue;
    },
    headers,
    tableIndex
  );
}

/**
 * Adds a new row to the markdown table in the document.
 */
export function addRowToDocument(
  docContent: string,
  startLine: number,
  initialCells?: string[],
  headers?: string[],
  tableIndex?: number
): string {
  return mutateTableInDocument(
    docContent,
    startLine,
    (table) => {
      const colCount = table.headers.length;
      const newCells = initialCells ? [...initialCells] : new Array(colCount).fill("");
      while (newCells.length < colCount) newCells.push("");

      table.rows.push({
        rowIndex: table.rows.length,
        rawLine: "",
        cells: newCells,
      });
    },
    headers,
    tableIndex
  );
}

/**
 * Deletes a row from the markdown table in the document.
 */
export function deleteRowFromDocument(
  docContent: string,
  startLine: number,
  rowIndex: number,
  headers?: string[],
  tableIndex?: number
): string {
  return mutateTableInDocument(
    docContent,
    startLine,
    (table) => {
      if (rowIndex < 0 || rowIndex >= table.rows.length) return false;
      table.rows.splice(rowIndex, 1);
      table.rows.forEach((r, idx) => (r.rowIndex = idx));
    },
    headers,
    tableIndex
  );
}

/**
 * Adds a new column to the markdown table in the document.
 */
export function addColumnToDocument(
  docContent: string,
  startLine: number,
  columnName: string,
  atIndex?: number,
  headers?: string[],
  tableIndex?: number
): string {
  return mutateTableInDocument(
    docContent,
    startLine,
    (table) => {
      const insertIdx = atIndex !== undefined ? atIndex : table.headers.length;
      table.headers.splice(insertIdx, 0, columnName);
      table.alignments.splice(insertIdx, 0, "---");
      table.rows.forEach((row) => {
        row.cells.splice(insertIdx, 0, "");
      });
    },
    headers,
    tableIndex
  );
}

/**
 * Renames a column in the markdown table in the document.
 */
export function renameColumnInDocument(
  docContent: string,
  startLine: number,
  colIndex: number,
  newName: string,
  headers?: string[],
  tableIndex?: number
): string {
  return mutateTableInDocument(
    docContent,
    startLine,
    (table) => {
      if (colIndex < 0 || colIndex >= table.headers.length) return false;
      table.headers[colIndex] = newName;
    },
    headers,
    tableIndex
  );
}

/**
 * Deletes a column from the markdown table in the document.
 */
export function deleteColumnFromDocument(
  docContent: string,
  startLine: number,
  colIndex: number,
  headers?: string[],
  tableIndex?: number
): string {
  return mutateTableInDocument(
    docContent,
    startLine,
    (table) => {
      if (colIndex < 0 || colIndex >= table.headers.length) return false;
      table.headers.splice(colIndex, 1);
      table.alignments.splice(colIndex, 1);
      table.rows.forEach((row) => {
        row.cells.splice(colIndex, 1);
      });
    },
    headers,
    tableIndex
  );
}

/**
 * Reorders a row from fromIndex to toIndex in the document table.
 */
export function reorderRowInDocument(
  docContent: string,
  startLine: number,
  fromIndex: number,
  toIndex: number,
  headers?: string[],
  tableIndex?: number
): string {
  return mutateTableInDocument(
    docContent,
    startLine,
    (table) => {
      if (
        fromIndex < 0 ||
        fromIndex >= table.rows.length ||
        toIndex < 0 ||
        toIndex >= table.rows.length
      ) {
        return false;
      }
      const [movedRow] = table.rows.splice(fromIndex, 1);
      table.rows.splice(toIndex, 0, movedRow);
      table.rows.forEach((r, idx) => (r.rowIndex = idx));
    },
    headers,
    tableIndex
  );
}

/**
 * Reorders a column from fromIndex to toIndex in the document table.
 */
export function reorderColumnInDocument(
  docContent: string,
  startLine: number,
  fromIndex: number,
  toIndex: number,
  headers?: string[],
  tableIndex?: number
): string {
  return mutateTableInDocument(
    docContent,
    startLine,
    (table) => {
      if (
        fromIndex < 0 ||
        fromIndex >= table.headers.length ||
        toIndex < 0 ||
        toIndex >= table.headers.length
      ) {
        return false;
      }
      const [movedHeader] = table.headers.splice(fromIndex, 1);
      table.headers.splice(toIndex, 0, movedHeader);
      if (table.alignments && table.alignments.length > fromIndex) {
        const [movedAlign] = table.alignments.splice(fromIndex, 1);
        table.alignments.splice(toIndex, 0, movedAlign);
      }
      table.rows.forEach((r) => {
        const [movedCell] = r.cells.splice(fromIndex, 1);
        r.cells.splice(toIndex, 0, movedCell);
      });
    },
    headers,
    tableIndex
  );
}

/**
 * Exports markdown table data to CSV format.
 */
export function exportTableToCSV(
  tableData: MarkdownTableData,
  hiddenColumns: number[] = []
): string {
  const escapeCSV = (val: string) => {
    if (val.includes(",") || val.includes('"') || val.includes("\n")) {
      return `"${val.replace(/"/g, '""')}"`;
    }
    return val;
  };

  const visibleIndices = tableData.headers
    .map((_, i) => i)
    .filter((i) => !hiddenColumns.includes(i));

  const headers = visibleIndices.map((i) => escapeCSV(tableData.headers[i])).join(",");
  const rows = tableData.rows.map((row) =>
    visibleIndices.map((i) => escapeCSV(row.cells[i] || "")).join(",")
  );

  return [headers, ...rows].join("\n");
}

