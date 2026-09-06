import {
  ColumnType,
  DateFormatOption,
  MarkdownTableData,
  MultiSelectTag,
  PluginSettings,
  TableColumn,
  TableFilterState,
} from "../types";
import { isCellChecked, parseCellNumber } from "./sort-engine";
import { parseCellTags, looksLikeMultiSelect } from "./tag-parser";
import {
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

  /**
   * Analyzes table headers and data rows to infer column definitions, types, and unique tags.
   */
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
          if (KNOWN_DATE_FORMATS.has(rawFmt)) {
            columnDateFormat = rawFmt as DateFormatOption;
          } else {
            columnDateFormat =
              this.inferDateFormatFromCells(columnCells) ||
              settings.dateFormat ||
              "YYYY-MM-DD";
          }
        }
      } else {
        const isSingleSelectKeyword = SINGLE_SELECT_KEYWORDS.test(cleanHeaderName);
        const headerMatchesMulti = settings.multiSelectColumnNames.some(
          (name) => cleanHeaderName.toLowerCase().includes(name.toLowerCase())
        );

        if (isSingleSelectKeyword) {
          inferredType = "select";
        } else if (headerMatchesMulti) {
          inferredType = "multi-select";
        } else if (this.isCheckboxColumn(columnCells)) {
          inferredType = "checkbox";
        } else if (this.isDateColumn(columnCells)) {
          inferredType = "date";
          columnDateFormat =
            this.inferDateFormatFromCells(columnCells) ||
            settings.dateFormat ||
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

      columns.push({
        name: cleanHeaderName,
        index: c,
        type: inferredType,
        dateFormat: columnDateFormat,
        uniqueTags: Array.from(tagMap.values()),
      });
    }

    return columns;
  }

  private inferDateFormatFromCells(cells: string[]): DateFormatOption | undefined {
    const nonBlank = cells.filter((c) => c.trim().length > 0 && c.trim() !== "-");
    for (const raw of nonBlank) {
      const c = raw.trim();
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
    // Don't classify pure text titles like "Item 1" as numbers
    return nonBlank.every((c) => {
      const trimmed = c.trim();
      return /^[+-]?\$?\d+([.,]\d+)?%?$/.test(trimmed) || (!isNaN(parseCellNumber(trimmed)) && !/[a-zA-Z\u0400-\u04FF]/.test(trimmed));
    });
  }

  private isDateColumn(cells: string[]): boolean {
    const nonBlank = cells.filter((c) => c.trim().length > 0 && c.trim() !== "-");
    if (nonBlank.length === 0) return false;
    const dateRegex = /^\d{4}[-./]\d{1,2}[-./]\d{1,2}$|^\d{1,2}[-./]\d{1,2}[-./]\d{2,4}$/;
    return nonBlank.every((c) => dateRegex.test(c.trim()));
  }

  /**
   * Retrieves or initializes filter state for a table.
   */
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

  /**
   * Updates the filter state for a table.
   */
  public setFilterState(tableId: string, state: TableFilterState): void {
    this.filterStates.set(tableId, state);
  }

  /**
   * Clears filter state for a table.
   */
  public clearFilterState(tableId: string): void {
    const state = this.getOrCreateFilterState(tableId);
    state.rules = [];
    state.sortRules = [];
    state.searchQuery = "";
    this.filterStates.set(tableId, state);
  }

  /**
   * Serializes filter state to JSON comment string.
   */
  public serializeToComment(state: TableFilterState): string {
    const payload = {
      conjunction: state.conjunction,
      rules: state.rules,
      sortRules: state.sortRules,
    };
    return `<!-- ms-filter: ${JSON.stringify(payload)} -->`;
  }

  /**
   * Deserializes filter state from JSON comment string.
   */
  public deserializeFromComment(
    commentText: string,
    tableId: string
  ): TableFilterState | null {
    const match = commentText.match(/<!--\s*ms-filter:\s*(\{.*\})\s*-->/);
    if (!match) return null;

    try {
      const parsed = JSON.parse(match[1]);
      return {
        tableId,
        conjunction: parsed.conjunction || "AND",
        rules: parsed.rules || [],
        sortRules: parsed.sortRules || [],
        searchQuery: "",
        isFilterOpen: (parsed.rules && parsed.rules.length > 0) || false,
        isSortOpen: (parsed.sortRules && parsed.sortRules.length > 0) || false,
      };
    } catch {
      return null;
    }
  }
}
