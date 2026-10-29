import { describe, it, expect, beforeAll, vi } from "vitest";
import { parseLinkTokens, renderTextWithLinks, stripCodeSpans, toPlainText } from "../src/utils/link-renderer";
import { installObsidianDomHelpers } from "./helpers/obsidian-dom";

describe("link-renderer", () => {
  beforeAll(() => {
    installObsidianDomHelpers(window as Window & typeof globalThis);
  });

  it("should return empty array for empty or whitespace text", () => {
    expect(parseLinkTokens("")).toEqual([]);
  });

  it("should parse plain text with no links", () => {
    const tokens = parseLinkTokens("Hello world, this is a test.");
    expect(tokens).toEqual([
      { type: "text", text: "Hello world, this is a test." },
    ]);
  });

  it("should parse raw URLs (http and https)", () => {
    const tokens = parseLinkTokens("Visit https://github.com and http://example.org today!");
    expect(tokens).toEqual([
      { type: "text", text: "Visit " },
      { type: "external", text: "https://github.com", href: "https://github.com" },
      { type: "text", text: " and " },
      { type: "external", text: "http://example.org", href: "http://example.org" },
      { type: "text", text: " today!" },
    ]);
  });

  it("should trim trailing punctuation from raw URLs", () => {
    const tokens = parseLinkTokens("Go to https://example.com/docs, or https://test.io.");
    expect(tokens).toEqual([
      { type: "text", text: "Go to " },
      { type: "external", text: "https://example.com/docs", href: "https://example.com/docs" },
      { type: "text", text: ", or " },
      { type: "external", text: "https://test.io", href: "https://test.io" },
      { type: "text", text: "." },
    ]);
  });

  it("should parse standard markdown links", () => {
    const tokens = parseLinkTokens("Here is [Google](https://google.com) search engine.");
    expect(tokens).toEqual([
      { type: "text", text: "Here is " },
      { type: "external", text: "Google", href: "https://google.com" },
      { type: "text", text: " search engine." },
    ]);
  });

  it("should parse obsidian internal wiki links with and without alias", () => {
    const tokens = parseLinkTokens("Check [[Project Plan]] and [[Meeting Notes|notes from Monday]].");
    expect(tokens).toEqual([
      { type: "text", text: "Check " },
      { type: "internal", text: "Project Plan", href: "Project Plan" },
      { type: "text", text: " and " },
      { type: "internal", text: "notes from Monday", href: "Meeting Notes" },
      { type: "text", text: "." },
    ]);
  });

  it("should render links and plain text into container and trigger click callbacks", () => {
    const container = document.createElement("div");
    const onExternalClick = vi.fn();
    const onInternalClick = vi.fn();

    renderTextWithLinks(container, "Visit [Obsidian](https://obsidian.md) or [[My Note]]", {
      onExternalClick,
      onInternalClick,
    });

    const externalLink = container.querySelector<HTMLAnchorElement>("a.external-link");
    expect(externalLink).not.toBeNull();
    expect(externalLink?.textContent).toBe("Obsidian");
    expect(externalLink?.getAttribute("href")).toBe("https://obsidian.md");
    expect(externalLink?.getAttribute("target")).toBe("_blank");

    externalLink?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(onExternalClick).toHaveBeenCalledWith("https://obsidian.md", expect.any(MouseEvent));

    const internalLink = container.querySelector<HTMLAnchorElement>("a.internal-link");
    expect(internalLink).not.toBeNull();
    expect(internalLink?.textContent).toBe("My Note");
    expect(internalLink?.dataset.href).toBe("My Note");

    internalLink?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(onInternalClick).toHaveBeenCalledWith("My Note", expect.any(MouseEvent));
  });

  it("should handle URLs inside parentheses cleanly", () => {
    const tokens = parseLinkTokens("(see https://example.com/info)");
    expect(tokens).toEqual([
      { type: "text", text: "(see " },
      { type: "external", text: "https://example.com/info", href: "https://example.com/info" },
      { type: "text", text: ")" },
    ]);
  });

  it("should handle complex URLs with ports, query strings, and hashes", () => {
    const url = "https://localhost:8080/api/v1?filter=active&sort=desc#section-2";
    const tokens = parseLinkTokens(`Check ${url} now`);
    expect(tokens).toEqual([
      { type: "text", text: "Check " },
      { type: "external", text: url, href: url },
      { type: "text", text: " now" },
    ]);
  });

  it("should parse internal links with headings and aliases", () => {
    const tokens = parseLinkTokens("Read [[Design Doc#Components|Architecture Components]]");
    expect(tokens).toEqual([
      { type: "text", text: "Read " },
      { type: "internal", text: "Architecture Components", href: "Design Doc#Components" },
    ]);
  });

  it("should treat non-links and unclosed markdown brackets as plain text", () => {
    const tokens = parseLinkTokens("Text with [brackets] and (parentheses) without link");
    expect(tokens).toEqual([
      { type: "text", text: "Text with [brackets] and (parentheses) without link" },
    ]);
  });

  it("should keep balanced parentheses inside markdown and raw URLs", () => {
    const url = "https://en.wikipedia.org/wiki/URL_(identifier)";
    expect(parseLinkTokens(`[Wikipedia](${url})`)).toEqual([
      { type: "external", text: "Wikipedia", href: url },
    ]);
    expect(parseLinkTokens(`See ${url} today`)).toEqual([
      { type: "text", text: "See " },
      { type: "external", text: url, href: url },
      { type: "text", text: " today" },
    ]);
  });

  it("should prevent default navigation and dblclick bubbling on rendered links", () => {
    const container = document.createElement("div");
    const onExternalClick = vi.fn();
    const onInternalClick = vi.fn();
    renderTextWithLinks(container, "Visit https://example.com or [[My Note]]", {
      onExternalClick,
      onInternalClick,
    });

    const parentDblClick = vi.fn();
    container.addEventListener("dblclick", parentDblClick);

    for (const link of Array.from(container.querySelectorAll("a"))) {
      const click = new MouseEvent("click", { bubbles: true, cancelable: true });
      link.dispatchEvent(click);
      expect(click.defaultPrevented).toBe(true);

      link.dispatchEvent(new MouseEvent("dblclick", { bubbles: true, cancelable: true }));
    }

    expect(onExternalClick).toHaveBeenCalledTimes(1);
    expect(onInternalClick).toHaveBeenCalledTimes(1);
    expect(parentDblClick).not.toHaveBeenCalled();
  });
  it("should parse inline code spans and leave links inside them as code", () => {
    expect(parseLinkTokens("Loose in `System/AI` and `[[Note]]`")).toEqual([
      { type: "text", text: "Loose in " },
      { type: "code", text: "System/AI" },
      { type: "text", text: " and " },
      { type: "code", text: "[[Note]]" },
    ]);
  });

  it("should follow CommonMark backtick runs for code spans", () => {
    // A longer run holds a backtick; one space each side is stripped.
    expect(parseLinkTokens("`` a`b ``")).toEqual([{ type: "code", text: "a`b" }]);
    expect(parseLinkTokens("`  `")).toEqual([{ type: "code", text: "  " }]);
    // A run closes only on a run of the same length.
    expect(parseLinkTokens("``a`b``")).toEqual([{ type: "code", text: "a`b" }]);
    // Unmatched and escaped backticks stay text.
    expect(parseLinkTokens("a ` b")).toEqual([{ type: "text", text: "a ` b" }]);
    expect(parseLinkTokens("\\`a`")).toEqual([{ type: "text", text: "\\`a`" }]);
    expect(parseLinkTokens("``a`")).toEqual([{ type: "text", text: "``a`" }]);
  });

  it("should keep a link whole when a code span sits in its label", () => {
    expect(parseLinkTokens("see [`api`](https://e.test/api) or `https://e.test/x`")).toEqual([
      { type: "text", text: "see " },
      { type: "external", text: "api", href: "https://e.test/api" },
      { type: "text", text: " or " },
      { type: "code", text: "https://e.test/x" },
    ]);
  });

  it("should treat line endings in a code span as spaces", () => {
    expect(parseLinkTokens("`a\rb\r\nc`")).toEqual([{ type: "code", text: "a b c" }]);
    expect(parseLinkTokens("` \t `")).toEqual([{ type: "code", text: "\t" }]);
  });

  it("should strip code spans only, leaving links as written", () => {
    expect(stripCodeSpans("`Done` and [[Page]] `` a`b ``")).toBe("Done and [[Page]] a`b");
  });

  it("should flatten code spans to their text", () => {
    expect(toPlainText("Loose in `System/AI`")).toBe("Loose in System/AI");
  });

  it("should render a code span as a styled span, not a code element", () => {
    const container = document.createElement("div");
    renderTextWithLinks(container, "Run `= this.file.name` now");
    const code = container.querySelector(".ms-cell-code");
    expect(code?.tagName).toBe("SPAN");
    expect(code?.textContent).toBe("= this.file.name");
    expect(container.querySelector("code")).toBeNull();
    expect(container.textContent).toBe("Run = this.file.name now");
  });
});
