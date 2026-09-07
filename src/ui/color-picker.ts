import { COLOR_LIST } from "../core/color-palette";
import { TagColor } from "../types";

export interface ColorPickerOptions {
  currentColor: TagColor;
  onSelectColor: (color: TagColor) => void | Promise<void>;
  allowCustomHex?: boolean;
}

export function createColorPickerElement(options: ColorPickerOptions): HTMLElement {
  const { currentColor, onSelectColor, allowCustomHex = true } = options;

  const container = createDiv({ cls: "ms-tag-color-picker" });

  const paletteRow = container.createDiv({ cls: "ms-color-palette-row" });

  const isCustom = currentColor && typeof currentColor === "string" && currentColor.startsWith("#");

  for (const color of COLOR_LIST) {
    const isSelected = currentColor === color;
    const dot = paletteRow.createSpan({
      cls: `ms-color-swatch-dot ms-color-${color} ${isSelected ? "is-selected" : ""}`,
      attr: { title: color.charAt(0).toUpperCase() + color.slice(1) },
    });

    dot.addEventListener("click", (e) => {
      e.stopPropagation();
      e.preventDefault();
      void onSelectColor(color);
    });
  }

  if (allowCustomHex) {
    const customWrapper = paletteRow.createSpan({
      cls: `ms-color-custom-wrapper ${isCustom ? "is-selected" : ""}`,
      attr: { title: "Custom Color (Hex Picker)" },
    });
    if (isCustom) {
      customWrapper.setCssStyles({ borderColor: currentColor });
    }
    const colorInput = customWrapper.createEl("input", {
      type: "color",
      cls: "ms-color-custom-input",
      value: isCustom ? currentColor : "#2383e2",
    });

    colorInput.addEventListener("click", (e) => {
      e.stopPropagation();
    });

    colorInput.addEventListener("input", (e) => {
      e.stopPropagation();
      const val = (e.target as HTMLInputElement).value;
      if (val) {
        void onSelectColor(val);
      }
    });

    colorInput.addEventListener("change", (e) => {
      e.stopPropagation();
      const val = (e.target as HTMLInputElement).value;
      if (val) {
        void onSelectColor(val);
      }
    });
  }

  return container;
}
