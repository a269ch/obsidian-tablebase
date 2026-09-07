import {
  ColumnAlignment,
  ColumnType,
  DateFormatOption,
  FilterRule,
  MarkdownTableData,
  MultiSelectTag,
  PluginSettings,
  SortRule,
  TableColumn,
  TableFilterState,
} from "../types";
import { parseColumnAlignment } from "./markdown-parser";
import { isCellChecked, parseCellNumber } from "./sort-engine";
import { parseCellTags, looksLikeMultiSelect } from "./tag-parser";
import {
  DATE_KEYWORDS,
  SINGLE_SELECT_KEYWORDS,
  TYPE_ANNOTATION_REGEX,
  stripTypeAnnotation,
} from "./table-mutator";

const KNOWN_DATE_FORMATS = new Set<string>([
  "DD/MM/YYYY",
  "MM/DD/YYYY",
  "DD.MM.YYYY",
  "YYYY/MM/DD",
  "DD-MM-YYYY",
  "YYYY-MM-DD",
]);

export class TableStateManager {
  private filterStates: Map<string, TableFilterState> = new Map();

  public analyzeColumns(
    table: MarkdownTableData,
    settings: PluginSettings
  ): TableColumn[] {
    const columns: TableColumn[] = [];

    for (let c = 0; c < table.headers.length; c++) {
      const rawHeader = table.headers[c] || "";
      const columnCells = table.rows.map((r) => r.cells[c] || "");

      let inferredType: ColumnType = "text";
      let cleanHeaderName = stripTypeAnnotation(rawHeader);
      let columnDateFormat: DateFormatOption | undefined;

      const typeTagMatch = rawHeader.match(TYPE_ANNOTATION_REGEX);
      if (typeTagMatch) {
        inferredType = typeTagMatch[1].toLowerCase() as ColumnType;
        if (inferredType === "date") {
          const rawFmt = (typeTagMatch[2] || "").trim().toUpperCase();
          columnDateFormat =
            settings.dateFormat ||
            (KNOWN_DATE_FORMATS.has(rawFmt) ? (rawFmt as DateFormatOption) : undefined) ||
            this.inferDateFormatFromCells(columnCells) ||
            "YYYY-MM-DD";
        }
      } else {
        const isSingleSelectKeyword = SINGLE_SELECT_KEYWORDS.test(cleanHeaderName);
        const isDateKeyword = DATE_KEYWORDS.test(cleanHeaderName);
        const headerMatchesMulti = settings.multiSelectColumnNames.some(
          (name) => cleanHeaderName.toLowerCase().includes(name.toLowerCase())
        );

        if (isSingleSelectKeyword) {
          inferredType = "select";
        } else if (headerMatchesMulti) {
          inferredType = "multi-select";
        } else if (this.isCheckboxColumn(columnCells)) {
          inferredType = "checkbox";
        } else if (isDateKeyword || this.isDateColumn(columnCells)) {
          inferredType = "date";
          columnDateFormat =
            settings.dateFormat ||
            this.inferDateFormatFromCells(columnCells) ||
            "YYYY-MM-DD";
        } else if (this.isNumberColumn(columnCells)) {
          inferredType = "number";
        } else if (
          settings.autoDetectMultiSelect &&
          looksLikeMultiSelect(columnCells, cleanHeaderName)
        ) {
          inferredType = "multi-select";
        }
      }

      const tagMap = new Map<string, MultiSelectTag>();
      if (inferredType === "multi-select" || inferredType === "select") {
        for (const cell of columnCells) {
          const tags = parseCellTags(cell, settings.customTagColors);
          for (const t of tags) {
            if (!tagMap.has(t.id)) {
              tagMap.set(t.id, t);
            }
          }
        }
      }

      const rawAlign = table.alignments?.[c];
      const hasExplicitAlign = rawAlign ? rawAlign.trim().includes(":") : false;
      const align: ColumnAlignment = hasExplicitAlign
        ? parseColumnAlignment(rawAlign)
        : (inferredType === "number" ? "right" : inferredType === "checkbox" ? "center" : "left");

      columns.push({
        name: cleanHeaderName,
        index: c,
        type: inferredType,
        align,
        dateFormat: columnDateFormat,
        uniqueTags: Array.from(tagMap.values()),
      });
    }

    return columns;
  }

  private inferDateFormatFromCells(cells: string[]): DateFormatOption | undefined {
    const nonBlank = cells.filter((c) => {
      const t = c.trim().toLowerCase();
      return t.length > 0 && t !== "-" && t !== "n/a" && t !== "none" && t !== "null";
    });
    for (const raw of nonBlank) {
      const c = raw.trim();
      // Each pattern pins a fully zero-padded date shape to one supported format
      if (/^\d{4}-\d{2}-\d{2}$/.test(c)) return "YYYY-MM-DD";
      if (/^\d{2}\.\d{2}\.\d{4}$/.test(c)) return "DD.MM.YYYY";
      if (/^\d{4}\/\d{2}\/\d{2}$/.test(c)) return "YYYY/MM/DD";
      if (/^\d{2}\/\d{2}\/\d{4}$/.test(c)) return "DD/MM/YYYY";
      if (/^\d{2}-\d{2}-\d{4}$/.test(c)) return "DD-MM-YYYY";
    }
    return undefined;
  }

  private isCheckboxColumn(cells: string[]): boolean {
    const nonBlank = cells.filter((c) => c.trim().length > 0);
    if (nonBlank.length === 0) return false;
    return nonBlank.every(
      (c) => c.trim() === "[x]" || c.trim() === "[ ]" || isCellChecked(c)
    );
  }

  private isNumberColumn(cells: string[]): boolean {
    const nonBlank = cells.filter((c) => c.trim().length > 0 && c.trim() !== "-");
    if (nonBlank.length === 0) return false;

    return nonBlank.every((c) => {
      const trimmed = c.trim();
      // Optional sign/currency, digits, optional decimal part, optional percent
      const isPlainNumber = /^[+-]?\$?\d+([.,]\d+)?%?$/.test(trimmed);
      // Otherwise accept parseable numbers only when free of Latin/Cyrillic letters
      const hasLetters = /[a-zA-Z\u0400-\u04FF]/.test(trimmed);
      return isPlainNumber || (!isNaN(parseCellNumber(trimmed)) && !hasLetters);
    });
  }

  private isDateColumn(cells: string[]): boolean {
    const nonBlank = cells.filter((c) => {
      const t = c.trim().toLowerCase();
      return t.length > 0 && t !== "-" && t !== "n/a" && t !== "none" && t !== "null";
    });
    if (nonBlank.length === 0) return false;
    // Year-first or day-first dates separated by dash, dot or slash
    const dateRegex = /^\d{4}[-./]\d{1,2}[-./]\d{1,2}$|^\d{1,2}[-./]\d{1,2}[-./]\d{2,4}$/;
    return nonBlank.every((c) => dateRegex.test(c.trim()));
  }

  public getOrCreateFilterState(tableId: string): TableFilterState {
    let state = this.filterStates.get(tableId);
    if (!state) {
      state = {
        tableId,
        conjunction: "AND",
        rules: [],
        sortRules: [],
        searchQuery: "",
        isFilterOpen: false,
        isSortOpen: false,
      };
      this.filterStates.set(tableId, state);
    }
    return state;
  }

  public setFilterState(tableId: string, state: TableFilterState): void {
    this.filterStates.set(tableId, state);
  }

  public clearFilterState(tableId: string): void {
    const state = this.getOrCreateFilterState(tableId);
    state.rules = [];
    state.sortRules = [];
    state.searchQuery = "";
    this.filterStates.set(tableId, state);
  }

  public serializeToComment(state: TableFilterState): string {
    const payload = {
      conjunction: state.conjunction,
      rules: state.rules,
      sortRules: state.sortRules,
    };
    return `<!-- ms-filter: ${JSON.stringify(payload)} -->`;
  }

  public deserializeFromComment(
    commentText: string,
    tableId: string
  ): TableFilterState | null {
    // HTML comment marker "<!-- ms-filter: {...} -->" with the JSON payload in group 1
    const match = commentText.match(/<!--\s*ms-filter:\s*(\{.*\})\s*-->/);
    if (!match) return null;

    try {
      const parsed = JSON.parse(match[1]) as {
        conjunction?: "AND" | "OR";
        rules?: FilterRule[];
        sortRules?: SortRule[];
      };
      const rules = Array.isArray(parsed?.rules) ? parsed.rules : [];
      const sortRules = Array.isArray(parsed?.sortRules) ? parsed.sortRules : [];
      return {
        tableId,
        conjunction: parsed?.conjunction === "OR" ? "OR" : "AND",
        rules,
        sortRules,
        searchQuery: "",
        isFilterOpen: rules.length > 0,
        isSortOpen: sortRules.length > 0,
      };
    } catch {
      return null;
    }
  }
}
