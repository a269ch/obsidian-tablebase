import { describe, it, expect, beforeAll, vi } from "vitest";
import { parseLinkTokens, renderTextWithLinks } from "../src/utils/link-renderer";
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
});
