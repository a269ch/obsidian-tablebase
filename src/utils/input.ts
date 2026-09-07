const NAVIGATION_KEYS = new Set<string>([
  "Backspace",
  "Delete",
  "ArrowLeft",
  "ArrowRight",
  "Tab",
  "Enter",
  "Escape",
  "Home",
  "End",
]);

// Matches a single digit 0-9
const SINGLE_DIGIT = /^[0-9]$/;

export function attachStrictNumericInputHandlers(input: HTMLInputElement): void {
  input.setAttribute("inputmode", "decimal");
  input.setAttribute("placeholder", "0");

  input.addEventListener("keydown", (e: KeyboardEvent) => {
    if (NAVIGATION_KEYS.has(e.key) || e.ctrlKey || e.metaKey) {
      return;
    }
    if (e.key === "-" && input.selectionStart === 0 && !input.value.includes("-")) {
      return;
    }
    if (
      (e.key === "." || e.key === ",") &&
      !input.value.includes(".") &&
      !input.value.includes(",")
    ) {
      return;
    }
    if (!SINGLE_DIGIT.test(e.key)) {
      e.preventDefault();
    }
  });

  input.addEventListener("input", () => {
    const sanitized = stripNonNumericCharacters(input.value);
    if (input.value !== sanitized) {
      input.value = sanitized;
    }
  });
}

export function stripNonNumericCharacters(value: string): string {
  let sanitized = "";
  let hasMinus = false;
  let hasDecimal = false;

  for (const char of value) {
    if (char === "-" && sanitized.length === 0 && !hasMinus) {
      sanitized += char;
      hasMinus = true;
    } else if ((char === "." || char === ",") && !hasDecimal) {
      sanitized += char;
      hasDecimal = true;
    } else if (SINGLE_DIGIT.test(char)) {
      sanitized += char;
    }
  }

  return sanitized;
}

export function sanitizeNumericCellValue(val: string): string {
  const trimmed = val.trim();
  if (trimmed === "-" || trimmed === "." || trimmed === ",") {
    return "";
  }
  return trimmed;
}
