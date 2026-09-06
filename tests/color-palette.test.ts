import { describe, it, expect } from "vitest";
import {
  COLOR_LIST,
  TAG_PALETTE_COLORS,
  getHashColor,
  resolveTagColor,
} from "../src/core/color-palette";

describe("Color Palette & Hash Algorithm", () => {
  it("should have all 10 color definitions with light and dark themes", () => {
    expect(COLOR_LIST.length).toBe(10);
    for (const color of COLOR_LIST) {
      expect(TAG_PALETTE_COLORS[color]).toBeDefined();
      expect(TAG_PALETTE_COLORS[color].bg).toBeDefined();
      expect(TAG_PALETTE_COLORS[color].text).toBeDefined();
      expect(TAG_PALETTE_COLORS[color].darkBg).toBeDefined();
      expect(TAG_PALETTE_COLORS[color].darkText).toBeDefined();
    }
  });

  it("should return stable deterministic color for tag names", () => {
    const color1 = getHashColor("Frontend");
    const color2 = getHashColor("Frontend");
    const color3 = getHashColor("frontend");
    expect(color1).toBe(color2);
    expect(color1).toBe(color3);
    expect(COLOR_LIST).toContain(color1);
  });

  it("should return default color for empty or blank tag", () => {
    expect(getHashColor("")).toBe("default");
    expect(getHashColor("   ")).toBe("default");
  });

  it("should respect custom color overrides", () => {
    const customColors = {
      urgent: "red" as const,
      done: "green" as const,
    };

    expect(resolveTagColor("urgent", customColors)).toBe("red");
    expect(resolveTagColor("URGENT", customColors)).toBe("red");
    expect(resolveTagColor("done", customColors)).toBe("green");

    const fallbackColor = resolveTagColor("random-tag", customColors);
    expect(COLOR_LIST).toContain(fallbackColor);
  });
});
