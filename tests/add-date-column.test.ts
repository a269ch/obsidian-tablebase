import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import { App } from "obsidian";
import { parseMarkdownTables } from "../src/core/markdown-parser";
import { applyAddColumn } from "../src/core/table-mutator";
import { TableStateManager } from "../src/core/table-state";
import { AddColumnModal } from "../src/ui/modals/add-column-modal";
import { ColumnType, DEFAULT_SETTINGS, MarkdownTableData, TableColumn } from "../src/types";
import { installObsidianDomHelpers } from "./helpers/obsidian-dom";

function openModal(onSave = vi.fn()): { modal: AddColumnModal; onSave: typeof onSave } {
  const modal = new AddColumnModal({ app: {} as App, onSave });
  modal.open();
  return { modal, onSave };
}

function selectType(modal: AddColumnModal, label: string): void {
  const cards = Array.from(
    modal.contentEl.querySelectorAll<HTMLElement>(".ms-add-col-type-card")
  );
  const card = cards.find(
    (el) => el.querySelector(".ms-type-card-label")?.textContent === label
  );
  card?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
}

function typeNameAndSubmit(modal: AddColumnModal, name: string): void {
  const input = modal.contentEl.querySelector<HTMLInputElement>(".ms-modal-name-input");
  if (!input) throw new Error("name input not rendered");
  input.value = name;
  input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
}

describe("Adding a Date column", () => {
  beforeAll(() => {
    installObsidianDomHelpers(window as Window & typeof globalThis);
  });

  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("should render all six property type cards", () => {
    const { modal } = openModal();
    const labels = Array.from(
      modal.contentEl.querySelectorAll(".ms-type-card-label")
    ).map((el) => el.textContent);

    expect(labels).toEqual([
      "Text",
      "Number",
      "Select",
      "Multi-select",
      "Date",
      "Checkbox",
    ]);
  });

  it("should report the date type when Date is picked", () => {
    const { modal, onSave } = openModal();

    selectType(modal, "Date");
    typeNameAndSubmit(modal, "Due Date");

    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave.mock.calls[0][0]).toBe("Due Date");
    expect(onSave.mock.calls[0][1]).toBe("date");
  });

  it("should mark the Date card as selected", () => {
    const { modal } = openModal();
    selectType(modal, "Date");

    const selected = modal.contentEl.querySelectorAll(
      ".ms-add-col-type-card.is-selected"
    );
    expect(selected.length).toBe(1);
    expect(selected[0].querySelector(".ms-type-card-label")?.textContent).toBe("Date");
  });

  it("should not create a column when the name is left empty", () => {
    const { modal, onSave } = openModal();

    selectType(modal, "Date");
    typeNameAndSubmit(modal, "   ");

    expect(onSave).not.toHaveBeenCalled();
  });

  it("should explain why nothing happened on an empty name", () => {
    const { modal } = openModal();

    const error = modal.contentEl.querySelector<HTMLElement>(".ms-modal-name-error");
    expect(error?.hidden).toBe(true);

    selectType(modal, "Date");
    typeNameAndSubmit(modal, "");

    expect(error?.hidden).toBe(false);
    expect(error?.textContent).toContain("Enter a property name");
    expect(
      modal.contentEl
        .querySelector(".ms-modal-name-input")
        ?.classList.contains("is-invalid")
    ).toBe(true);
  });

  it("should clear the validation error once the user types", () => {
    const { modal } = openModal();
    selectType(modal, "Date");
    typeNameAndSubmit(modal, "");

    const input = modal.contentEl.querySelector<HTMLInputElement>(".ms-modal-name-input");
    const error = modal.contentEl.querySelector<HTMLElement>(".ms-modal-name-error");
    expect(error?.hidden).toBe(false);

    if (input) {
      input.value = "D";
      input.dispatchEvent(new Event("input", { bubbles: true }));
    }

    expect(error?.hidden).toBe(true);
    expect(input?.classList.contains("is-invalid")).toBe(false);
  });

  it("should write a [date:FORMAT] header into the table", () => {
    const tableData: MarkdownTableData = parseMarkdownTables(
      ["| Task |", "| --- |", "| Buy bread |"].join("\n")
    )[0];
    const columns: TableColumn[] = new TableStateManager().analyzeColumns(tableData, {
      ...DEFAULT_SETTINGS,
    });

    const created = applyAddColumn(
      tableData,
      columns,
      "Due Date",
      "date" as ColumnType,
      undefined,
      undefined
    );

    expect(created.type).toBe("date");
    expect(created.dateFormat).toBe("YYYY-MM-DD");
    expect(tableData.headers[1]).toBe("Due Date [date:YYYY-MM-DD]");
  });

  it("should still be a date column after a markdown round-trip", () => {
    const tableData: MarkdownTableData = parseMarkdownTables(
      ["| Task |", "| --- |", "| Buy bread |"].join("\n")
    )[0];
    const columns: TableColumn[] = new TableStateManager().analyzeColumns(tableData, {
      ...DEFAULT_SETTINGS,
    });

    applyAddColumn(tableData, columns, "Due Date", "date" as ColumnType, undefined, undefined);

    const markdown = [
      `| ${tableData.headers.join(" | ")} |`,
      "| --- | --- |",
      "| Buy bread |  |",
    ].join("\n");

    const reparsed = parseMarkdownTables(markdown)[0];
    const reanalyzed = new TableStateManager().analyzeColumns(reparsed, {
      ...DEFAULT_SETTINGS,
    });

    expect(reanalyzed[1].type).toBe("date");
    expect(reanalyzed[1].name).toBe("Due Date");
    expect(reanalyzed[1].dateFormat).toBe("YYYY-MM-DD");
  });
});
