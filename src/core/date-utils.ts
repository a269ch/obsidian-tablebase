import { DateFormatOption } from "../types";

export interface DateFormatDescriptor {
  format: DateFormatOption;
  label: string;
  example: string;
}

export const DATE_FORMAT_OPTIONS: DateFormatDescriptor[] = [
  { format: "YYYY-MM-DD", label: "YYYY-MM-DD", example: "2026-09-04" },
  { format: "DD.MM.YYYY", label: "DD.MM.YYYY", example: "04.09.2026" },
  { format: "DD/MM/YYYY", label: "DD/MM/YYYY", example: "04/09/2026" },
  { format: "MM/DD/YYYY", label: "MM/DD/YYYY", example: "09/04/2026" },
  { format: "YYYY/MM/DD", label: "YYYY/MM/DD", example: "2026/09/04" },
  { format: "DD-MM-YYYY", label: "DD-MM-YYYY", example: "04-09-2026" },
];

/**
 * Formats a Date object into a string based on the chosen DateFormatOption.
 */
export function formatDateByOption(
  d: Date,
  format: DateFormatOption = "YYYY-MM-DD"
): string {
  if (!d || isNaN(d.getTime())) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");

  switch (format) {
    case "DD/MM/YYYY":
      return `${day}/${m}/${y}`;
    case "MM/DD/YYYY":
      return `${m}/${day}/${y}`;
    case "DD.MM.YYYY":
      return `${day}.${m}.${y}`;
    case "YYYY/MM/DD":
      return `${y}/${m}/${day}`;
    case "DD-MM-YYYY":
      return `${day}-${m}-${y}`;
    case "YYYY-MM-DD":
    default:
      return `${y}-${m}-${day}`;
  }
}

/**
 * Parses a date string into a Date object according to the DateFormatOption.
 * Falls back to standard Date.parse if explicit format parsing does not match.
 */
export function parseDateByOption(
  str: string,
  format: DateFormatOption = "YYYY-MM-DD"
): Date | null {
  if (!str || !str.trim()) return null;
  const s = str.trim();

  let y: number | undefined;
  let m: number | undefined;
  let d: number | undefined;

  const delimiter = format.includes("/") ? "/" : format.includes(".") ? "." : "-";
  if (s.includes(delimiter)) {
    const parts = s.split(delimiter);
    if (
      parts.length === 3 &&
      /^\d+$/.test(parts[0]) &&
      /^\d+$/.test(parts[1]) &&
      /^\d+$/.test(parts[2])
    ) {
      const [p0, p1, p2] = parts.map((p) => parseInt(p, 10));
      switch (format) {
        case "DD/MM/YYYY":
        case "DD.MM.YYYY":
        case "DD-MM-YYYY":
          d = p0;
          m = p1 - 1;
          y = p2;
          break;
        case "MM/DD/YYYY":
          m = p0 - 1;
          d = p1;
          y = p2;
          break;
        case "YYYY/MM/DD":
        case "YYYY-MM-DD":
        default:
          y = p0;
          m = p1 - 1;
          d = p2;
          break;
      }
    }
  }

  if (
    y !== undefined &&
    !isNaN(y) &&
    m !== undefined &&
    !isNaN(m) &&
    d !== undefined &&
    !isNaN(d)
  ) {
    const dateObj = new Date(y, m, d);
    if (!isNaN(dateObj.getTime())) return dateObj;
  }

  const fallback = Date.parse(s);
  return !isNaN(fallback) ? new Date(fallback) : null;
}

/**
 * Compares two date strings based on DateFormatOption.
 * Returns negative if a < b, positive if a > b, 0 if equal.
 */
export function compareDateStrings(
  valA: string,
  valB: string,
  format?: DateFormatOption
): number {
  const dateA = parseDateByOption(valA, format);
  const dateB = parseDateByOption(valB, format);

  if (!dateA && !dateB) {
    return valA.localeCompare(valB);
  }
  if (!dateA) return 1;
  if (!dateB) return -1;
  return dateA.getTime() - dateB.getTime();
}
