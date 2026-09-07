import { describe, it, expect } from "vitest";
import {
  parseCellTags,
  formatTagsToCell,
  looksLikeMultiSelect,
} from "../src/core/tag-parser";

describe("Tag Parser & Formatter", () => {
  describe("parseCellTags", () => {
    it("should parse comma-separated tags and trim whitespace", () => {
      const tags = parseCellTags("React, TypeScript, CSS");
      expect(tags.length).toBe(3);
      expect(tags[0].name).toBe("React");
      expect(tags[1].name).toBe("TypeScript");
      expect(tags[2].name).toBe("CSS");
    });

    it("should parse semicolon-separated tags", () => {
      const tags = parseCellTags("Design; Architecture; Backend");
      expect(tags.length).toBe(3);
      expect(tags.map((t) => t.name)).toEqual(["Design", "Architecture", "Backend"]);
    });

    it("should parse wikilinks", () => {
      const tags = parseCellTags("[[Project Alpha]], [[Team Beta|Alias]]");
      expect(tags.length).toBe(2);
      expect(tags[0].name).toBe("Project Alpha");
      expect(tags[1].name).toBe("Team Beta");
    });

    it("should parse hashtags including alphanumeric and underscores", () => {
      const tags = parseCellTags("#dev #important #urgent_fix");
      expect(tags.length).toBe(3);
      expect(tags.map((t) => t.name)).toEqual(["dev", "important", "urgent_fix"]);
    });

    it("should deduplicate tags case-insensitively", () => {
      const tags = parseCellTags("Bug, bug, BUG, Feature");
      expect(tags.length).toBe(2);
      expect(tags[0].name).toBe("Bug");
      expect(tags[1].name).toBe("Feature");
    });

    it("should return empty array for empty, dash, or n/a cells", () => {
      expect(parseCellTags("")).toEqual([]);
      expect(parseCellTags("   ")).toEqual([]);
      expect(parseCellTags("-")).toEqual([]);
      expect(parseCellTags("N/A")).toEqual([]);
      expect(parseCellTags("null")).toEqual([]);
    });
  });

  describe("formatTagsToCell", () => {
    const sampleTags = [
      { id: "frontend", name: "Frontend", color: "blue" as const },
      { id: "urgent", name: "Urgent", color: "red" as const },
    ];

    it("should format as comma-separated string by default", () => {
      expect(formatTagsToCell(sampleTags)).toBe("Frontend, Urgent");
      expect(formatTagsToCell(["A", "B", "C"])).toBe("A, B, C");
    });

    it("should format as wikilinks", () => {
      expect(formatTagsToCell(sampleTags, "wikilink")).toBe("[[Frontend]], [[Urgent]]");
    });

    it("should format as hashtags", () => {
      expect(formatTagsToCell(sampleTags, "hashtag")).toBe("#Frontend #Urgent");
      expect(formatTagsToCell(["In Progress", "Code Review"], "hashtag")).toBe("#In_Progress #Code_Review");
    });

    it("should return empty string for empty inputs", () => {
      expect(formatTagsToCell([])).toBe("");
      expect(formatTagsToCell(["", "  "])).toBe("");
    });
  });

  describe("looksLikeMultiSelect", () => {
    it("should return true for known multi-select header names", () => {
      expect(looksLikeMultiSelect([], "Tags")).toBe(true);
      expect(looksLikeMultiSelect([], "Status")).toBe(true);
      expect(looksLikeMultiSelect([], "Labels")).toBe(true);
    });

    it("should detect multi-select cells based on content patterns", () => {
      const values = ["React, UI", "Go, Backend", "Vue, Frontend", "Node"];
      expect(looksLikeMultiSelect(values, "Skills")).toBe(true);
    });

    it("should return false for regular single-value columns", () => {
      const values = ["Alice", "Bob", "Charlie", "David"];
      expect(looksLikeMultiSelect(values, "Author")).toBe(false);
    });
  });
});
