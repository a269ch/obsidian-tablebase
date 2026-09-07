export type PresetTagColor =
  | "default"
  | "gray"
  | "brown"
  | "orange"
  | "yellow"
  | "green"
  | "blue"
  | "purple"
  | "pink"
  | "red";

export type TagColor = PresetTagColor | (string & {});

export interface MultiSelectTag {
  id: string;
  name: string;
  color: TagColor;
}

export type ColumnType =
  | "text"
  | "multi-select"
  | "select"
  | "number"
  | "checkbox"
  | "date";

export type CalculationType =
  | "none"
  | "count_all"
  | "count_values"
  | "count_unique"
  | "count_empty"
  | "count_not_empty"
  | "sum"
  | "average"
  | "min"
  | "max"
  | "percent_checked"
  | "percent_unchecked"
  | "count_checked"
  | "count_unchecked";

export type ColumnAlignment = "left" | "center" | "right";

export interface TableColumn {
  name: string;
  index: number;
  type: ColumnType;
  align?: ColumnAlignment;
  width?: number;
  calculation?: CalculationType;
  uniqueTags?: MultiSelectTag[];
  dateFormat?: DateFormatOption;
}

export type SortDirection = "asc" | "desc";

export interface SortRule {
  column: string;
  columnIndex: number;
  direction: SortDirection;
}

export type MultiSelectOperator =
  | "is_one_of"
  | "is_not_one_of"
  | "contains"
  | "does_not_contain"
  | "is_empty"
  | "is_not_empty"
  | "contains_all"
  | "contains_any"
  | "does_not_contain_any";

export type TextOperator =
  | "is_one_of"
  | "is_not_one_of"
  | "equals"
  | "not_equals"
  | "contains"
  | "does_not_contain"
  | "starts_with"
  | "ends_with"
  | "is_empty"
  | "is_not_empty";

export type NumberOperator =
  | "equals"
  | "not_equals"
  | "greater_than"
  | "less_than"
  | "greater_equal"
  | "less_equal"
  | "is_empty"
  | "is_not_empty";

export type CheckboxOperator =
  | "is_checked"
  | "is_unchecked";

export type FilterOperator =
  | MultiSelectOperator
  | TextOperator
  | NumberOperator
  | CheckboxOperator;

export interface FilterRule {
  id: string;
  column: string;
  columnIndex: number;
  operator: FilterOperator;
  value: string | string[];
  enabled: boolean;
  conjunction?: Conjunction;
}

export type Conjunction = "AND" | "OR";

export type DatabaseViewType = "table" | "board";

export interface TableFilterState {
  tableId: string;
  conjunction: Conjunction;
  rules: FilterRule[];
  sortRules: SortRule[];
  searchQuery: string;
  isFilterOpen: boolean;
  isSortOpen: boolean;
  isPropertiesOpen?: boolean;
  viewType?: DatabaseViewType;
  hiddenColumnIndices?: number[];
  groupByColumnIndex?: number;
  stickyFirstColumn?: boolean;
  showRowNumbers?: boolean;
}

export type TagFormat = "comma" | "hashtag" | "wikilink";

export type DateFormatOption =
  | "YYYY-MM-DD"
  | "DD/MM/YYYY"
  | "MM/DD/YYYY"
  | "DD.MM.YYYY"
  | "YYYY/MM/DD"
  | "DD-MM-YYYY";

export interface PluginSettings {
  defaultTagFormat: TagFormat;
  dateFormat?: DateFormatOption;
  autoDetectMultiSelect: boolean;
  multiSelectColumnNames: string[];
  customTagColors: Record<string, TagColor>;
  enableCalculations: boolean;
  stickyFirstColumn: boolean;
  showRowNumbers: boolean;
}

export const DEFAULT_SETTINGS: PluginSettings = {
  defaultTagFormat: "comma",
  autoDetectMultiSelect: true,
  multiSelectColumnNames: [
    "Tags",
    "Tag",
    "Labels",
    "Label",
    "Categories",
    "Category",
    "Status",
    "Keywords",
  ],
  customTagColors: {},
  enableCalculations: true,
  stickyFirstColumn: true,
  showRowNumbers: false,
};

export interface MarkdownTableRow {
  rowIndex: number;
  rawLine: string;
  cells: string[];
}

export interface MarkdownTableData {
  id: string;
  headers: string[];
  alignments: string[];
  rows: MarkdownTableRow[];
  startLine: number;
  endLine: number;
  rawMarkdown: string;
}
