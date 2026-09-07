import { describe, expect, it } from "vitest";
import {
  compareDateStrings,
  formatDateByOption,
  parseAnyDate,
  parseDateByOption,
} from "../src/core/date-utils";

describe("date-utils", () => {
  describe("formatDateByOption", () => {
    const testDate = new Date(2026, 8, 1);

    it("formats YYYY-MM-DD by default", () => {
      expect(formatDateByOption(testDate)).toBe("2026-09-01");
    });

    it("formats DD/MM/YYYY", () => {
      expect(formatDateByOption(testDate, "DD/MM/YYYY")).toBe("01/09/2026");
    });

    it("formats MM/DD/YYYY", () => {
      expect(formatDateByOption(testDate, "MM/DD/YYYY")).toBe("09/01/2026");
    });

    it("formats DD.MM.YYYY", () => {
      expect(formatDateByOption(testDate, "DD.MM.YYYY")).toBe("01.09.2026");
    });

    it("formats YYYY/MM/DD", () => {
      expect(formatDateByOption(testDate, "YYYY/MM/DD")).toBe("2026/09/01");
    });

    it("formats DD-MM-YYYY", () => {
      expect(formatDateByOption(testDate, "DD-MM-YYYY")).toBe("01-09-2026");
    });

    it("returns empty string for invalid date", () => {
      expect(formatDateByOption(new Date("invalid"))).toBe("");
    });
  });

  describe("parseDateByOption", () => {
    it("parses YYYY-MM-DD correctly", () => {
      const parsed = parseDateByOption("2026-09-01", "YYYY-MM-DD");
      expect(parsed).not.toBeNull();
      expect(parsed?.getFullYear()).toBe(2026);
      expect(parsed?.getMonth()).toBe(8);
      expect(parsed?.getDate()).toBe(1);
    });

    it("parses DD/MM/YYYY correctly", () => {
      const parsed = parseDateByOption("01/09/2026", "DD/MM/YYYY");
      expect(parsed).not.toBeNull();
      expect(parsed?.getFullYear()).toBe(2026);
      expect(parsed?.getMonth()).toBe(8);
      expect(parsed?.getDate()).toBe(1);
    });

    it("parses MM/DD/YYYY correctly", () => {
      const parsed = parseDateByOption("09/01/2026", "MM/DD/YYYY");
      expect(parsed).not.toBeNull();
      expect(parsed?.getFullYear()).toBe(2026);
      expect(parsed?.getMonth()).toBe(8);
      expect(parsed?.getDate()).toBe(1);
    });

    it("parses DD.MM.YYYY correctly", () => {
      const parsed = parseDateByOption("01.09.2026", "DD.MM.YYYY");
      expect(parsed).not.toBeNull();
      expect(parsed?.getFullYear()).toBe(2026);
      expect(parsed?.getMonth()).toBe(8);
      expect(parsed?.getDate()).toBe(1);
    });

    it("parses YYYY/MM/DD correctly", () => {
      const parsed = parseDateByOption("2026/09/01", "YYYY/MM/DD");
      expect(parsed).not.toBeNull();
      expect(parsed?.getFullYear()).toBe(2026);
      expect(parsed?.getMonth()).toBe(8);
      expect(parsed?.getDate()).toBe(1);
    });

    it("parses DD-MM-YYYY correctly", () => {
      const parsed = parseDateByOption("01-09-2026", "DD-MM-YYYY");
      expect(parsed).not.toBeNull();
      expect(parsed?.getFullYear()).toBe(2026);
      expect(parsed?.getMonth()).toBe(8);
      expect(parsed?.getDate()).toBe(1);
    });

    it("returns null for empty strings or invalid input", () => {
      expect(parseDateByOption("")).toBeNull();
      expect(parseDateByOption("   ")).toBeNull();
      expect(parseDateByOption("not-a-date")).toBeNull();
    });

    it("falls back to Date.parse for standard ISO timestamps", () => {
      const parsed = parseDateByOption("2026-09-01T12:00:00Z", "DD/MM/YYYY");
      expect(parsed).not.toBeNull();
      expect(parsed?.getFullYear()).toBe(2026);
    });
  });

  describe("parseAnyDate", () => {
    it("parses dates across various formats regardless of preferred format", () => {
      const iso = parseAnyDate("2026-09-15", "DD.MM.YYYY");
      expect(iso).not.toBeNull();
      expect(iso?.getFullYear()).toBe(2026);
      expect(iso?.getMonth()).toBe(8);
      expect(iso?.getDate()).toBe(15);

      const dot = parseAnyDate("15.09.2026", "YYYY-MM-DD");
      expect(dot).not.toBeNull();
      expect(dot?.getFullYear()).toBe(2026);
      expect(dot?.getMonth()).toBe(8);
      expect(dot?.getDate()).toBe(15);

      const slash = parseAnyDate("15/09/2026", "YYYY-MM-DD");
      expect(slash).not.toBeNull();
      expect(slash?.getFullYear()).toBe(2026);
      expect(slash?.getMonth()).toBe(8);
      expect(slash?.getDate()).toBe(15);
    });

    it("returns null for non-date inputs", () => {
      expect(parseAnyDate("")).toBeNull();
      expect(parseAnyDate("random-text")).toBeNull();
    });
  });

  describe("compareDateStrings", () => {
    it("compares dates chronologically", () => {
      expect(compareDateStrings("2026-08-01", "2026-09-01")).toBeLessThan(0);
      expect(compareDateStrings("2026-09-02", "2026-09-01")).toBeGreaterThan(0);
      expect(compareDateStrings("2026-09-01", "2026-09-01")).toBe(0);
    });

    it("handles DD.MM.YYYY format", () => {
      expect(compareDateStrings("01.08.2026", "01.09.2026", "DD.MM.YYYY")).toBeLessThan(0);
      expect(compareDateStrings("15.09.2026", "01.09.2026", "DD.MM.YYYY")).toBeGreaterThan(0);
    });

    it("handles invalid or non-date strings gracefully", () => {
      expect(compareDateStrings("abc", "def")).toBeLessThan(0);
      expect(compareDateStrings("2026-09-01", "invalid")).toBeLessThan(0);
      expect(compareDateStrings("invalid", "2026-09-01")).toBeGreaterThan(0);
    });
  });
});
