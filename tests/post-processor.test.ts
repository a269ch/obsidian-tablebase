import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import { App, MarkdownPostProcessorContext } from "obsidian";
import { TableStateManager } from "../src/core/table-state";
import { TablePostProcessor } from "../src/extensions/post-processor";
import { SettingsService } from "../src/services/settings-service";
import { TableSyncService } from "../src/services/table-sync-service";
import { TableViewController } from "../src/services/table-view-controller";
import { TableViewRegistry } from "../src/services/table-view-registry";
import { VaultService } from "../src/services/vault-service";
import { installObsidianDomHelpers } from "./helpers/obsidian-dom";

function buildRenderedTable(headers: string[], rows: string[][]): HTMLElement {
  const wrapper = document.createElement("div");
  const table = document.createElement("table");

  const thead = document.createElement("thead");
  const headerRow = document.createElement("tr");
  for (const header of headers) {
    const th = document.createElement("th");
    th.textContent = header;
    headerRow.appendChild(th);
  }
  thead.appendChild(headerRow);
  table.appendChild(thead);

  const tbody = document.createElement("tbody");
  for (const row of rows) {
    const tr = document.createElement("tr");
    for (const cell of row) {
      const td = document.createElement("td");
      td.textContent = cell;
      tr.appendChild(td);
    }
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);

  wrapper.appendChild(table);
  document.body.appendChild(wrapper);
  return wrapper;
}

function createProcessor(): {
  processor: TablePostProcessor;
  ctx: MarkdownPostProcessorContext;
  settingsService: SettingsService;
} {
  const settingsService = new SettingsService({
    loadData: async () => null,
    saveData: async () => undefined,
  });

  const app = { vault: {}, workspace: {} } as unknown as App;
  const controller = new TableViewController(
    app,
    settingsService,
    new TableStateManager(),
    new TableSyncService(new VaultService(app))
  );

  const processor = new TablePostProcessor(controller, new TableViewRegistry());

  const ctx = {
    docId: "doc",
    sourcePath: "Notes/Test.md",
    frontmatter: null,
    addChild: vi.fn(),
    getSectionInfo: () => ({
      text: "",
      lineStart: 3,
      lineEnd: 6,
    }),
  } as unknown as MarkdownPostProcessorContext;

  return { processor, ctx, settingsService };
}

describe("TablePostProcessor date columns", () => {
  beforeAll(() => {
    installObsidianDomHelpers(window as Window & typeof globalThis);
  });

  beforeEach(() => {
    document.body.innerHTML = "";
    window.innerHeight = 800;
    window.innerWidth = 1200;
  });

  it("should replace an inline table with the interactive view", () => {
    const { processor, ctx } = createProcessor();
    const wrapper = buildRenderedTable(
      ["Task", "Due Date [date]"],
      [["Buy bread", "2026-09-15"]]
    );

    processor.process(wrapper, ctx);

    expect(wrapper.querySelector(".ms-notion-database-container")).not.toBeNull();
    expect(wrapper.querySelector("table.ms-db-grid-table")).not.toBeNull();
    const addColTh = wrapper.querySelector("th.ms-db-th-add-col");
    expect(addColTh).not.toBeNull();
    expect(addColTh?.querySelector(".ms-db-th-add-col-content")).not.toBeNull();
    expect(addColTh?.querySelector(".ms-db-th-add-col-icon svg")).not.toBeNull();
  });

  it("should register the view for lifecycle teardown", () => {
    const { processor, ctx } = createProcessor();
    const wrapper = buildRenderedTable(["Task", "Due Date [date]"], [["A", "2026-09-15"]]);

    processor.process(wrapper, ctx);

    expect(ctx.addChild).toHaveBeenCalledTimes(1);
  });

  it("should render an annotated date column as a date cell", () => {
    const { processor, ctx } = createProcessor();
    const wrapper = buildRenderedTable(
      ["Task", "Due Date [date]"],
      [["Buy bread", "2026-09-15"]]
    );

    processor.process(wrapper, ctx);

    const dateCell = wrapper.querySelector(
      '.ms-db-td[data-col-index="1"] .ms-cell-date-wrapper'
    );
    expect(dateCell).not.toBeNull();
    expect(dateCell?.querySelector(".ms-date-text")?.textContent).toBe("2026-09-15");
  });

  it("should strip the annotation from the visible column name", () => {
    const { processor, ctx } = createProcessor();
    const wrapper = buildRenderedTable(
      ["Task", "Due Date [date]"],
      [["Buy bread", "2026-09-15"]]
    );

    processor.process(wrapper, ctx);

    const names = Array.from(wrapper.querySelectorAll(".ms-db-col-name")).map(
      (el) => el.textContent
    );
    expect(names).toEqual(["Task", "Due Date"]);
  });

  it("should open the calendar when the date cell is clicked", () => {
    const { processor, ctx } = createProcessor();
    const wrapper = buildRenderedTable(
      ["Task", "Due Date [date]"],
      [["Buy bread", "2026-09-15"]]
    );

    processor.process(wrapper, ctx);

    const td = wrapper.querySelector<HTMLElement>('.ms-db-td[data-col-index="1"]');
    expect(td).not.toBeNull();

    const rect = {
      top: 100, bottom: 130, left: 50, right: 200,
      width: 150, height: 30, x: 50, y: 100,
    };
    if (td) {
      td.getBoundingClientRect = (): DOMRect =>
        ({ ...rect, toJSON: () => rect }) as DOMRect;
    }

    td?.dispatchEvent(new MouseEvent("click", { bubbles: true }));

    const calendar = document.querySelector(".ms-date-picker-popover");
    expect(calendar).not.toBeNull();
    expect(calendar?.querySelectorAll(".ms-date-day-header").length).toBe(7);
  });

  it("should hide the original markdown table", () => {
    const { processor, ctx } = createProcessor();
    const wrapper = buildRenderedTable(["Task", "Due Date [date]"], [["A", "2026-09-15"]]);

    processor.process(wrapper, ctx);

    const original = wrapper.querySelector<HTMLElement>('table[data-ms-enhanced="true"]');
    expect(original).not.toBeNull();
    expect(original?.classList.contains("ms-table-hidden")).toBe(true);
  });

  it("should open the calendar on an empty cell of a freshly created date column", () => {
    const { processor, ctx } = createProcessor();
    const wrapper = buildRenderedTable(
      ["Task", "Due Date [date:YYYY-MM-DD]"],
      [["Buy bread", ""]]
    );

    processor.process(wrapper, ctx);

    const td = wrapper.querySelector<HTMLElement>('.ms-db-td[data-col-index="1"]');
    expect(td?.querySelector(".ms-cell-date-wrapper")).not.toBeNull();

    const rect = {
      top: 100, bottom: 130, left: 50, right: 200,
      width: 150, height: 30, x: 50, y: 100,
    };
    if (td) {
      td.getBoundingClientRect = (): DOMRect =>
        ({ ...rect, toJSON: () => rect }) as DOMRect;
    }

    td?.dispatchEvent(new MouseEvent("click", { bubbles: true }));

    expect(document.querySelector(".ms-date-picker-popover")).not.toBeNull();
  });

  it("should keep a popover open when a stale detached view is still listening", () => {
    const stale = createProcessor();
    const staleWrapper = buildRenderedTable(
      ["Task", "Due Date [date]"],
      [["A", "2026-09-15"]]
    );
    stale.processor.process(staleWrapper, stale.ctx);
    staleWrapper.remove();

    const fresh = createProcessor();
    const wrapper = buildRenderedTable(
      ["Task", "Due Date [date]"],
      [["Buy bread", "2026-09-15"]]
    );
    fresh.processor.process(wrapper, fresh.ctx);

    const td = wrapper.querySelector<HTMLElement>('.ms-db-td[data-col-index="1"]');
    const rect = {
      top: 100, bottom: 130, left: 50, right: 200,
      width: 150, height: 30, x: 50, y: 100,
    };
    if (td) {
      td.getBoundingClientRect = (): DOMRect =>
        ({ ...rect, toJSON: () => rect }) as DOMRect;
    }

    td?.dispatchEvent(new MouseEvent("click", { bubbles: true }));

    expect(document.querySelector(".ms-date-picker-popover")).not.toBeNull();
  });

  it("should not close another view's calendar when a stale view is disposed", () => {
    const stale = createProcessor();
    const staleWrapper = buildRenderedTable(
      ["Task", "Due Date [date]"],
      [["A", "2026-09-15"]]
    );
    stale.processor.process(staleWrapper, stale.ctx);

    const staleChild = (stale.ctx.addChild as unknown as {
      mock: { calls: [{ onunload(): void }][] };
    }).mock.calls[0][0];

    const fresh = createProcessor();
    const wrapper = buildRenderedTable(
      ["Task", "Due Date [date]"],
      [["Buy bread", "2026-09-15"]]
    );
    fresh.processor.process(wrapper, fresh.ctx);

    const td = wrapper.querySelector<HTMLElement>('.ms-db-td[data-col-index="1"]');
    const rect = {
      top: 100, bottom: 130, left: 50, right: 200,
      width: 150, height: 30, x: 50, y: 100,
    };
    if (td) {
      td.getBoundingClientRect = (): DOMRect =>
        ({ ...rect, toJSON: () => rect }) as DOMRect;
    }
    td?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(document.querySelector(".ms-date-picker-popover")).not.toBeNull();

    staleChild.onunload();

    expect(document.querySelector(".ms-date-picker-popover")).not.toBeNull();
  });

  it("should open the calendar when the note contains several tables", () => {
    const first = createProcessor();
    const firstWrapper = buildRenderedTable(
      ["Task", "Due Date [date]"],
      [["A", "2026-09-15"]]
    );
    first.processor.process(firstWrapper, first.ctx);

    const second = createProcessor();
    const secondWrapper = buildRenderedTable(
      ["Task", "Due Date [date]"],
      [["B", ""]]
    );
    second.processor.process(secondWrapper, second.ctx);

    const third = createProcessor();
    const thirdWrapper = buildRenderedTable(["Task", "Due Date [date]"], [["C", ""]]);
    third.processor.process(thirdWrapper, third.ctx);

    const td = secondWrapper.querySelector<HTMLElement>('.ms-db-td[data-col-index="1"]');
    const rect = {
      top: 100, bottom: 130, left: 50, right: 200,
      width: 150, height: 30, x: 50, y: 100,
    };
    if (td) {
      td.getBoundingClientRect = (): DOMRect =>
        ({ ...rect, toJSON: () => rect }) as DOMRect;
    }

    td?.dispatchEvent(new MouseEvent("click", { bubbles: true }));

    const calendar = document.querySelector(".ms-date-picker-popover");
    expect(calendar).not.toBeNull();
    expect(calendar?.querySelectorAll(".ms-date-day-header").length).toBe(7);
  });

  it("should not enhance the same table twice", () => {
    const { processor, ctx } = createProcessor();
    const wrapper = buildRenderedTable(["Task", "Due Date [date]"], [["A", "2026-09-15"]]);

    processor.process(wrapper, ctx);
    processor.process(wrapper, ctx);

    expect(wrapper.querySelectorAll(".ms-notion-database-container").length).toBe(1);
  });

  it("should update date format in regular table outside tags when settings change", async () => {
    const { processor, ctx, settingsService } = createProcessor();
    const wrapper = buildRenderedTable(
      ["Task", "Due Date"],
      [["Buy bread", "2026-09-15"]]
    );

    processor.process(wrapper, ctx);

    const dateTextBefore = wrapper.querySelector(".ms-date-text");
    expect(dateTextBefore?.textContent).toBe("2026-09-15");

    await settingsService.updateSettings({ dateFormat: "DD.MM.YYYY" });

    const dateTextAfter = wrapper.querySelector(".ms-date-text");
    expect(dateTextAfter?.textContent).toBe("15.09.2026");
  });

  it("should recognize empty date column outside tags and update date picker format on settings change", async () => {
    const { processor, ctx, settingsService } = createProcessor();
    const wrapper = buildRenderedTable(
      ["Task", "Date"],
      [["Buy bread", ""]]
    );

    processor.process(wrapper, ctx);

    const initialTd = wrapper.querySelector<HTMLElement>('.ms-db-td[data-col-index="1"]');
    expect(initialTd?.querySelector(".ms-cell-empty-placeholder")).not.toBeNull();

    await settingsService.updateSettings({ dateFormat: "DD.MM.YYYY" });

    const updatedTd = wrapper.querySelector<HTMLElement>('.ms-db-td[data-col-index="1"]');
    expect(updatedTd?.querySelector(".ms-cell-empty-placeholder")).not.toBeNull();

    const rect = {
      top: 100, bottom: 130, left: 50, right: 200,
      width: 150, height: 30, x: 50, y: 100,
    };
    if (updatedTd) {
      updatedTd.getBoundingClientRect = (): DOMRect =>
        ({ ...rect, toJSON: () => rect }) as DOMRect;
    }
    updatedTd?.dispatchEvent(new MouseEvent("click", { bubbles: true }));

    const calendar = document.querySelector(".ms-date-picker-popover");
    expect(calendar).not.toBeNull();
  });

  it("should update date format across both tagged and untagged tables when settings change", async () => {
    const { processor, ctx, settingsService } = createProcessor();

    const taggedWrapper = buildRenderedTable(
      ["Task", "Due Date [date:YYYY-MM-DD]"],
      [["Alpha", "2026-09-15"]]
    );
    const untaggedWrapper = buildRenderedTable(
      ["Task", "Due Date"],
      [["Beta", "2026-09-20"]]
    );

    processor.process(taggedWrapper, ctx);
    processor.process(untaggedWrapper, ctx);

    expect(taggedWrapper.querySelector(".ms-date-text")?.textContent).toBe("2026-09-15");
    expect(untaggedWrapper.querySelector(".ms-date-text")?.textContent).toBe("2026-09-20");

    await settingsService.updateSettings({ dateFormat: "DD.MM.YYYY" });

    expect(taggedWrapper.querySelector(".ms-date-text")?.textContent).toBe("15.09.2026");
    expect(untaggedWrapper.querySelector(".ms-date-text")?.textContent).toBe("20.09.2026");

    const subsequentWrapper = buildRenderedTable(
      ["Task", "Created"],
      [["Gamma", "2026-10-05"]]
    );
    processor.process(subsequentWrapper, ctx);

    expect(subsequentWrapper.querySelector(".ms-date-text")?.textContent).toBe("05.10.2026");
  });

  it("should skip table enhancement during print or PDF export", () => {
    const { processor, ctx } = createProcessor();

    // 1. Element inside .print container
    const printContainer = document.createElement("div");
    printContainer.addClass("print");
    const tableWrapper1 = buildRenderedTable(["Col A"], [["Val 1"]]);
    printContainer.appendChild(tableWrapper1);
    document.body.appendChild(printContainer);

    processor.process(tableWrapper1, ctx);
    expect(tableWrapper1.querySelector(".ms-notion-database-container")).toBeNull();
    expect(tableWrapper1.querySelector("table")?.classList.contains("ms-table-hidden")).toBe(false);

    // 2. Element inside .pdf-export container
    const pdfContainer = document.createElement("div");
    pdfContainer.addClass("pdf-export");
    const tableWrapper2 = buildRenderedTable(["Col B"], [["Val 2"]]);
    pdfContainer.appendChild(tableWrapper2);
    document.body.appendChild(pdfContainer);

    processor.process(tableWrapper2, ctx);
    expect(tableWrapper2.querySelector(".ms-notion-database-container")).toBeNull();
    expect(tableWrapper2.querySelector("table")?.classList.contains("ms-table-hidden")).toBe(false);

    // 3. Document body has .print class
    document.body.addClass("print");
    const tableWrapper3 = buildRenderedTable(["Col C"], [["Val 3"]]);
    processor.process(tableWrapper3, ctx);
    expect(tableWrapper3.querySelector(".ms-notion-database-container")).toBeNull();
    expect(tableWrapper3.querySelector("table")?.classList.contains("ms-table-hidden")).toBe(false);
    document.body.removeClass("print");

    // 4. matchMedia("print").matches is true
    const matchMediaSpy = vi.spyOn(window, "matchMedia").mockImplementation((query: string) => {
      return {
        matches: query === "print",
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      } as unknown as MediaQueryList;
    });

    const tableWrapper4 = buildRenderedTable(["Col D"], [["Val 4"]]);
    processor.process(tableWrapper4, ctx);
    expect(tableWrapper4.querySelector(".ms-notion-database-container")).toBeNull();
    expect(tableWrapper4.querySelector("table")?.classList.contains("ms-table-hidden")).toBe(false);

    matchMediaSpy.mockRestore();
  });
});
