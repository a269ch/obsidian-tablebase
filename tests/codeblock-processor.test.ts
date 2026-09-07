import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import { MarkdownPostProcessorContext } from "obsidian";
import {
  TABLE_CODE_BLOCK_LANGUAGES,
  TableCodeBlockProcessor,
} from "../src/extensions/codeblock-processor";
import { TableViewController } from "../src/services/table-view-controller";
import { TableViewRegistry } from "../src/services/table-view-registry";
import { NotionTableView } from "../src/ui/table/table-view";
import { installObsidianDomHelpers } from "./helpers/obsidian-dom";

describe("TableCodeBlockProcessor", () => {
  let registry: TableViewRegistry;
  let mockViewController: TableViewController;
  let processor: TableCodeBlockProcessor;

  beforeAll(() => {
    installObsidianDomHelpers(window as Window & typeof globalThis);
  });

  beforeEach(() => {
    registry = new TableViewRegistry();
    mockViewController = {
      createCodeBlockView: vi.fn(),
    } as unknown as TableViewController;
    processor = new TableCodeBlockProcessor(mockViewController, registry);
  });

  it("should support the standard table code block languages", () => {
    expect(TABLE_CODE_BLOCK_LANGUAGES).toContain("tablebase");
    expect(TABLE_CODE_BLOCK_LANGUAGES).toContain("table");
    expect(TABLE_CODE_BLOCK_LANGUAGES).toContain("notion-table");
  });

  it("should render an empty placeholder for empty code block content", () => {
    const el = document.createElement("div");
    const ctx = { sourcePath: "note.md", addChild: vi.fn() } as unknown as MarkdownPostProcessorContext;

    processor.process("", el, ctx);

    const emptyPlaceholder = el.querySelector(".ms-empty-codeblock");
    expect(emptyPlaceholder).not.toBeNull();
    expect(emptyPlaceholder?.textContent).toBe("Empty table block");
    expect(mockViewController.createCodeBlockView).not.toHaveBeenCalled();
    expect(ctx.addChild).not.toHaveBeenCalled();
  });

  it("should parse markdown table and append the interactive view to the element", () => {
    const el = document.createElement("div");
    const viewEl = document.createElement("div");
    viewEl.className = "ms-notion-database-container";

    const mockView = {
      getElement: vi.fn(() => viewEl),
      dispose: vi.fn(),
    } as unknown as NotionTableView;

    vi.mocked(mockViewController.createCodeBlockView).mockReturnValue(mockView);

    const ctx = {
      sourcePath: "folder/test.md",
      addChild: vi.fn(),
    } as unknown as MarkdownPostProcessorContext;

    const source = "| Col A | Col B |\n| --- | --- |\n| 1 | 2 |";
    processor.process(source, el, ctx);

    expect(mockViewController.createCodeBlockView).toHaveBeenCalledWith(
      expect.objectContaining({
        sourcePath: "folder/test.md",
        initialSource: source,
        tableData: expect.objectContaining({
          headers: ["Col A", "Col B"],
        }),
      })
    );

    expect(el.querySelector(".ms-notion-database-container")).toBe(viewEl);
    expect(ctx.addChild).toHaveBeenCalled();

    const renderChild = vi.mocked(ctx.addChild).mock.calls[0][0];
    renderChild.onload();
    expect(registry.size).toBe(1);

    renderChild.onunload();
    expect(registry.size).toBe(0);
    expect(mockView.dispose).toHaveBeenCalled();
  });
});
