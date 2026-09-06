/**
 * Utility functions for input controls and cell value sanitization.
 */

/**
 * Attaches keyboard and input event listeners to restrict an input element to numeric values
 * (supports negative numbers, decimal points, commas, standard navigation, and clipboard paste).
 */
export function attachStrictNumericInputHandlers(input: HTMLInputElement): void {
  input.setAttribute("inputmode", "decimal");
  input.setAttribute("placeholder", "0");

  input.addEventListener("keydown", (e: KeyboardEvent) => {
    if (
      e.key === "Backspace" ||
      e.key === "Delete" ||
      e.key === "ArrowLeft" ||
      e.key === "ArrowRight" ||
      e.key === "Tab" ||
      e.key === "Enter" ||
      e.key === "Escape" ||
      e.key === "Home" ||
      e.key === "End" ||
      (e.ctrlKey || e.metaKey)
    ) {
      return;
    }
    // Allow minus sign at the start if not already present
    if (e.key === "-" && input.selectionStart === 0 && !input.value.includes("-")) {
      return;
    }
    // Allow decimal dot or comma once
    if ((e.key === "." || e.key === ",") && !input.value.includes(".") && !input.value.includes(",")) {
      return;
    }
    // Block all non-numeric keys
    if (!/^[0-9]$/.test(e.key)) {
      e.preventDefault();
    }
  });

  input.addEventListener("input", () => {
    const val = input.value;
    let sanitized = "";
    let hasMinus = false;
    let hasDecimal = false;
    for (let i = 0; i < val.length; i++) {
      const ch = val[i];
      if (ch === "-" && sanitized.length === 0 && !hasMinus) {
        sanitized += ch;
        hasMinus = true;
      } else if ((ch === "." || ch === ",") && !hasDecimal) {
        sanitized += ch;
        hasDecimal = true;
      } else if (/[0-9]/.test(ch)) {
        sanitized += ch;
      }
    }
    if (input.value !== sanitized) {
      input.value = sanitized;
    }
  });
}

/**
 * Sanitizes numeric cell string before saving (e.g. discards lone minus, dot, or comma).
 */
export function sanitizeNumericCellValue(val: string): string {
  const trimmed = val.trim();
  if (trimmed === "-" || trimmed === "." || trimmed === ",") {
    return "";
  }
  return trimmed;
}
