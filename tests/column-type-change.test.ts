import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import { App, MarkdownPostProcessorContext } from "obsidian";
import { TableStateManager } from "../src/core/table-state";
import { TableCodeBlockProcessor } from "../src/extensions/codeblock-processor";
import { TablePostProcessor } from "../src/extensions/post-processor";
import { SettingsService } from "../src/services/settings-service";
import { TableSyncService } from "../src/services/table-sync-service";
import { TableViewController } from "../src/services/table-view-controller";
import { TableViewRegistry } from "../src/services/table-view-registry";
import { VaultService } from "../src/services/vault-service";
import { installObsidianDomHelpers } from "./helpers/obsidian-dom";

const ANCHOR_RECT = {
  top: 40, bottom: 74, left: 200, right: 340, width: 140, height: 34, x: 200, y: 40,
};

/** Builds the DOM Obsidian produces for a Markdown table. */
function renderTable(markdown: string): HTMLElement {
  const rows = markdown
    .split("\n")
    .filter((line) => line.trim().startsWith("|"))
    .map((line) =>
      line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((cell) => cell.trim())
    );

  const wrapper = document.createElement("div");
  const table = document.createElement("table");

  const thead = document.createElement("thead");
  const headerRow = document.createElement("tr");
  for (const header of rows[0]) {
    const th = document.createElement("th");
    th.textContent = header;
    headerRow.appendChild(th);
  }
  thead.appendChild(headerRow);
  table.appendChild(thead);

  const tbody = document.createElement("tbody");
  for (const row of rows.slice(2)) {
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

/** Opens the header menu of a column and clicks one of its property types. */
function pickColumnType(root: HTMLElement, colIndex: number, label: string): void {
  const th = root.querySelector<HTMLElement>(`th.ms-db-th[data-col-index="${colIndex}"]`);
  expect(th).not.toBeNull();
  // The popover closes itself when the anchor has no on-screen box, and jsdom
  // reports an empty rect for everything.
  if (th) {
    th.getBoundingClientRect = (): DOMRect =>
      ({ ...ANCHOR_RECT, toJSON: () => ANCHOR_RECT }) as DOMRect;
  }
  th?.dispatchEvent(new MouseEvent("click", { bubbles: true }));

  const item = Array.from(
    document.querySelectorAll<HTMLElement>(".ms-col-header-menu .ms-menu-item")
  ).find((el) => el.textContent?.trim() === label);
  expect(item, `menu item "${label}"`).toBeDefined();
  item?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
}

/** Lets the persist-then-rerender chain settle. */
function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

describe("changing a column type from the header menu", () => {
  let doc: string;
  let controller: TableViewController;

  beforeAll(() => {
    installObsidianDomHelpers(window as Window & typeof globalThis);
  });

  beforeEach(async () => {
    document.body.innerHTML = "";

    const settingsService = new SettingsService({
      loadData: async () => null,
      saveData: async () => undefined,
    });
    await settingsService.loadSettings();

    const app = { vault: {}, workspace: {} } as unknown as App;
    const vaultService = {
      modifyFile: vi.fn(async (_path: string, transform: (content: string) => string) => {
        doc = transform(doc);
        return true;
      }),
    } as unknown as VaultService;

    controller = new TableViewController(
      app,
      settingsService,
      new TableStateManager(),
      new TableSyncService(vaultService)
    );
  });

  it("turns an auto-detected tag column of an inline table into text", async () => {
    doc = [
      "# Note",
      "",
      "| Модуль | Категория |",
      "| --- | --- |",
      "| Ядро | Architecture, Core |",
      "| Интерфейс | Web, UI, Design |",
      "",
    ].join("\n");

    const processor = new TablePostProcessor(controller, new TableViewRegistry());
    const ctx = {
      docId: "doc",
      sourcePath: "Notes/Test.md",
      frontmatter: null,
      addChild: vi.fn(),
      getSectionInfo: () => ({ text: doc, lineStart: 2, lineEnd: 5 }),
    } as unknown as MarkdownPostProcessorContext;

    const wrapper = renderTable(doc);
    processor.process(wrapper, ctx);
    expect(wrapper.querySelector('.ms-db-td[data-col-index="1"] .ms-tag-badge')).not.toBeNull();

    pickColumnType(wrapper, 1, "Text");
    await flush();

    // Without the annotation the column would detect itself as tags again.
    expect(doc).toContain("Категория [text]");
    expect(doc).toContain("# Note");

    document.body.innerHTML = "";
    const rerendered = renderTable(doc);
    processor.process(rerendered, ctx);

    const cell = rerendered.querySelector<HTMLElement>('.ms-db-td[data-col-index="1"]');
    expect(cell?.querySelector(".ms-cell-text-wrapper")).not.toBeNull();
    expect(cell?.querySelector(".ms-tag-badge")).toBeNull();
    expect(
      Array.from(rerendered.querySelectorAll(".ms-db-col-name")).map((el) => el.textContent)
    ).toEqual(["Модуль", "Категория"]);
  });

  it("turns a select column of a table code block into text", async () => {
    const source = [
      "| Task | Status [select] |",
      "| --- | --- |",
      "| Buy milk | Todo |",
      "| Write docs | Done |",
    ].join("\n");
    doc = "# Note\n\n```table\n" + source + "\n```\n";

    const processor = new TableCodeBlockProcessor(controller, new TableViewRegistry());
    const ctx = {
      docId: "doc",
      sourcePath: "Notes/Test.md",
      frontmatter: null,
      addChild: vi.fn(),
      getSectionInfo: () => null,
    } as unknown as MarkdownPostProcessorContext;

    const host = document.createElement("div");
    document.body.appendChild(host);
    processor.process(source, host, ctx);
    expect(host.querySelector('.ms-db-td[data-col-index="1"] .ms-tag-badge')).not.toBeNull();

    pickColumnType(host, 1, "Text");
    await flush();

    expect(doc).toContain("Status [text]");
    expect(host.querySelector('.ms-db-td[data-col-index="1"] .ms-cell-text-wrapper')).not.toBeNull();

    const newSource = doc.split("```")[1].replace(/^table\n/, "").trimEnd();
    const host2 = document.createElement("div");
    document.body.appendChild(host2);
    processor.process(newSource, host2, ctx);
    expect(host2.querySelector('.ms-db-td[data-col-index="1"] .ms-tag-badge')).toBeNull();
  });
});
