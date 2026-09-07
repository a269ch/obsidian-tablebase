import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import { App } from "obsidian";
import { DEFAULT_SETTINGS, MultiSelectTag } from "../src/types";
import { createColorPickerElement } from "../src/ui/color-picker";
import { ConfirmModal, confirmAction } from "../src/ui/modals/confirm-modal";
import { RenameColumnModal } from "../src/ui/modals/rename-column-modal";
import { SingleSelectPopover } from "../src/ui/modals/single-select-popover";
import { TagSelectModal } from "../src/ui/modals/tag-select-modal";
import { createTagBadge } from "../src/ui/tag-badge";
import { installObsidianDomHelpers } from "./helpers/obsidian-dom";

function stubLayout(el: Element): void {
  const base = {
    top: 100,
    bottom: 130,
    left: 50,
    right: 200,
    width: 150,
    height: 30,
    x: 50,
    y: 100,
  };
  el.getBoundingClientRect = (): DOMRect =>
    ({ ...base, toJSON: () => base }) as DOMRect;
}

describe("UI Modals and Popovers", () => {
  beforeAll(() => {
    installObsidianDomHelpers(window as Window & typeof globalThis);
  });

  beforeEach(() => {
    document.body.innerHTML = "";
    window.innerHeight = 800;
    window.innerWidth = 1200;
  });

  describe("createTagBadge", () => {
    it("should render badge with text, colors, and dataset", () => {
      const tag: MultiSelectTag = { id: "urgent", name: "Urgent", color: "red" };
      const badge = createTagBadge({ tag });

      expect(badge.className).toContain("ms-tag-badge");
      expect(badge.className).toContain("ms-color-red");
      expect(badge.dataset.tagName).toBe("Urgent");
      expect(badge.dataset.tagId).toBe("urgent");
      expect(badge.textContent).toBe("Urgent");
    });

    it("should handle clickable badges", () => {
      const tag: MultiSelectTag = { id: "task", name: "Task", color: "blue" };
      const onClick = vi.fn();
      const badge = createTagBadge({ tag, clickable: true, onClick });

      expect(badge.classList.contains("clickable")).toBe(true);
      badge.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      expect(onClick).toHaveBeenCalledTimes(1);
      expect(onClick).toHaveBeenCalledWith(tag, expect.any(MouseEvent));
    });

    it("should handle removable badges and close button", () => {
      const tag: MultiSelectTag = { id: "dev", name: "Dev", color: "green" };
      const onRemove = vi.fn();
      const badge = createTagBadge({ tag, removable: true, onRemove });

      const removeBtn = badge.querySelector<HTMLElement>(".ms-tag-remove-btn");
      expect(removeBtn).not.toBeNull();
      expect(removeBtn?.textContent).toBe("×");

      removeBtn?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      expect(onRemove).toHaveBeenCalledTimes(1);
      expect(onRemove).toHaveBeenCalledWith(tag, expect.any(MouseEvent));
    });
  });

  describe("createColorPickerElement", () => {
    it("should render color swatches and trigger selection", () => {
      const onSelectColor = vi.fn();
      const picker = createColorPickerElement({
        currentColor: "blue",
        onSelectColor,
        allowCustomHex: true,
      });

      const dots = picker.querySelectorAll<HTMLElement>(".ms-color-swatch-dot");
      expect(dots.length).toBeGreaterThan(5);

      const purpleDot = picker.querySelector<HTMLElement>(".ms-color-purple");
      expect(purpleDot).not.toBeNull();
      purpleDot?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      expect(onSelectColor).toHaveBeenCalledWith("purple");
    });

    it("should allow custom hex color picking when enabled", () => {
      const onSelectColor = vi.fn();
      const picker = createColorPickerElement({
        currentColor: "#123456",
        onSelectColor,
        allowCustomHex: true,
      });

      const colorInput = picker.querySelector<HTMLInputElement>(".ms-color-custom-input");
      expect(colorInput).not.toBeNull();
      expect(colorInput?.value).toBe("#123456");

      if (colorInput) {
        colorInput.value = "#abcdef";
        colorInput.dispatchEvent(new Event("change", { bubbles: true }));
        expect(onSelectColor).toHaveBeenCalledWith("#abcdef");
      }
    });
  });

  describe("ConfirmModal", () => {
    it("should display title, message and trigger confirm callback", async () => {
      const onConfirm = vi.fn();
      const modal = new ConfirmModal({
        app: {} as App,
        title: "Delete Column",
        message: "Are you sure you want to delete this column?",
        confirmText: "Delete",
        destructive: true,
        onConfirm,
      });

      modal.open();
      expect(modal.titleEl.textContent).toBe("Delete Column");
      const msg = modal.contentEl.querySelector(".ms-modal-confirm-message");
      expect(msg?.textContent).toBe("Are you sure you want to delete this column?");

      const buttons = modal.contentEl.querySelectorAll<HTMLButtonElement>("button");
      expect(buttons.length).toBe(2);

      const confirmBtn = buttons[0];
      expect(confirmBtn.textContent).toBe("Delete");
      expect(confirmBtn.classList.contains("mod-warning")).toBe(true);

      confirmBtn.click();
      expect(modal.wasConfirmed()).toBe(true);
      expect(onConfirm).toHaveBeenCalledTimes(1);
    });

    it("should cancel without calling onConfirm", () => {
      const onConfirm = vi.fn();
      const modal = new ConfirmModal({
        app: {} as App,
        title: "Cancel Check",
        message: "Do something?",
        onConfirm,
      });

      modal.open();
      const buttons = modal.contentEl.querySelectorAll<HTMLButtonElement>("button");
      const cancelBtn = buttons[1];
      expect(cancelBtn.textContent).toBe("Cancel");

      cancelBtn.click();
      expect(modal.wasConfirmed()).toBe(false);
      expect(onConfirm).not.toHaveBeenCalled();
    });

    it("should open via confirmAction helper", () => {
      const onConfirm = vi.fn();
      confirmAction({
        app: {} as App,
        title: "Action Test",
        message: "Proceed?",
        onConfirm,
      });

      const modalEl = document.body.querySelector(".ms-modal-confirm");
      expect(modalEl).not.toBeNull();
    });
  });

  describe("RenameColumnModal", () => {
    it("should populate current name and save on Enter key", () => {
      const onSave = vi.fn();
      const modal = new RenameColumnModal({
        app: {} as App,
        currentName: "Old Column",
        onSave,
      });

      modal.open();
      const input = modal.contentEl.querySelector<HTMLInputElement>(".ms-modal-name-input");
      expect(input).not.toBeNull();
      expect(input?.value).toBe("Old Column");

      if (input) {
        input.value = "New Column";
        input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
      }

      expect(onSave).toHaveBeenCalledWith("New Column");
    });

    it("should save on Save button click", () => {
      const onSave = vi.fn();
      const modal = new RenameColumnModal({
        app: {} as App,
        currentName: "Old Column",
        onSave,
      });

      modal.open();
      const input = modal.contentEl.querySelector<HTMLInputElement>(".ms-modal-name-input");
      if (input) {
        input.value = "Renamed Column";
      }

      const saveBtn = Array.from(
        modal.contentEl.querySelectorAll<HTMLButtonElement>("button")
      ).find((b) => b.textContent === "Save");

      saveBtn?.click();
      expect(onSave).toHaveBeenCalledWith("Renamed Column");
    });

    it("should not save when name is empty", () => {
      const onSave = vi.fn();
      const modal = new RenameColumnModal({
        app: {} as App,
        currentName: "Old Column",
        onSave,
      });

      modal.open();
      const input = modal.contentEl.querySelector<HTMLInputElement>(".ms-modal-name-input");
      if (input) {
        input.value = "   ";
        input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
      }

      expect(onSave).not.toHaveBeenCalled();
    });
  });

  describe("SingleSelectPopover", () => {
    it("should render options and select existing tag", async () => {
      const anchorEl = document.createElement("button");
      document.body.appendChild(anchorEl);
      stubLayout(anchorEl);

      const onSelect = vi.fn().mockResolvedValue(undefined);
      const popover = new SingleSelectPopover({
        app: {} as App,
        anchorEl,
        columnName: "Status",
        currentValue: "Todo",
        allAvailableTags: [
          { id: "todo", name: "Todo", color: "blue" },
          { id: "done", name: "Done", color: "green" },
        ],
        settings: { ...DEFAULT_SETTINGS },
        onSelect,
      });

      popover.open();

      const optionItems = document.body.querySelectorAll<HTMLElement>(".ms-select-option-item");
      expect(optionItems.length).toBe(2);

      const doneOption = Array.from(optionItems).find((el) => el.textContent?.includes("Done"));
      expect(doneOption).toBeDefined();

      doneOption?.click();
      expect(onSelect).toHaveBeenCalledWith("Done");
    });

    it("should filter options based on search input and support creating new tag", async () => {
      const anchorEl = document.createElement("button");
      document.body.appendChild(anchorEl);
      stubLayout(anchorEl);

      const onSelect = vi.fn().mockResolvedValue(undefined);
      const popover = new SingleSelectPopover({
        app: {} as App,
        anchorEl,
        columnName: "Status",
        currentValue: "",
        allAvailableTags: [{ id: "todo", name: "Todo", color: "blue" }],
        settings: { ...DEFAULT_SETTINGS },
        onSelect,
      });

      popover.open();

      const searchInput = document.body.querySelector<HTMLInputElement>(".ms-popover-search-input");
      expect(searchInput).not.toBeNull();

      if (searchInput) {
        searchInput.value = "Blocked";
        searchInput.dispatchEvent(new Event("input", { bubbles: true }));
      }

      const createItem = document.body.querySelector<HTMLElement>(".ms-create-option-item");
      expect(createItem).not.toBeNull();
      expect(createItem?.textContent).toContain("Blocked");

      createItem?.click();
      expect(onSelect).toHaveBeenCalledWith("Blocked");
    });

    it("should clear selection when clear button is clicked", async () => {
      const anchorEl = document.createElement("button");
      document.body.appendChild(anchorEl);
      stubLayout(anchorEl);

      const onSelect = vi.fn().mockResolvedValue(undefined);
      const popover = new SingleSelectPopover({
        app: {} as App,
        anchorEl,
        columnName: "Status",
        currentValue: "Todo",
        allAvailableTags: [{ id: "todo", name: "Todo", color: "blue" }],
        settings: { ...DEFAULT_SETTINGS },
        onSelect,
      });

      popover.open();

      const clearItem = document.body.querySelector<HTMLElement>(".ms-menu-item.is-danger");
      expect(clearItem).not.toBeNull();
      expect(clearItem?.textContent).toContain("Clear selection");

      clearItem?.click();
      expect(onSelect).toHaveBeenCalledWith("");
    });
  });

  describe("TagSelectModal", () => {
    it("should render tags and save formatted cell on apply", () => {
      const onSave = vi.fn();
      const modal = new TagSelectModal({
        app: {} as App,
        settings: { ...DEFAULT_SETTINGS, defaultTagFormat: "comma" },
        columnName: "Tags",
        currentValue: "Alpha, Beta",
        allAvailableTags: [
          { id: "alpha", name: "Alpha", color: "blue" },
          { id: "beta", name: "Beta", color: "red" },
          { id: "gamma", name: "Gamma", color: "green" },
        ],
        onSave,
      });

      modal.open();

      const selectedArea = modal.contentEl.querySelector(".ms-selected-tags-area");
      expect(selectedArea).not.toBeNull();
      const badges = selectedArea?.querySelectorAll(".ms-tag-badge");
      expect(badges?.length).toBe(2);

      const availableRows = modal.contentEl.querySelectorAll<HTMLElement>(".ms-tag-item-row");
      expect(availableRows.length).toBe(3);

      const gammaRow = Array.from(availableRows).find((r) => r.textContent?.includes("Gamma"));
      gammaRow?.click();

      const saveBtn = Array.from(
        modal.contentEl.querySelectorAll<HTMLButtonElement>("button")
      ).find((b) => b.textContent === "Apply Changes");

      saveBtn?.click();
      expect(onSave).toHaveBeenCalledTimes(1);
      const [formattedResult] = onSave.mock.calls[0];
      expect(formattedResult).toContain("Alpha");
      expect(formattedResult).toContain("Beta");
      expect(formattedResult).toContain("Gamma");
    });

    it("should remove tag when remove button on badge is clicked", () => {
      const onSave = vi.fn();
      const modal = new TagSelectModal({
        app: {} as App,
        settings: { ...DEFAULT_SETTINGS, defaultTagFormat: "comma" },
        columnName: "Tags",
        currentValue: "Alpha, Beta",
        allAvailableTags: [
          { id: "alpha", name: "Alpha", color: "blue" },
          { id: "beta", name: "Beta", color: "red" },
        ],
        onSave,
      });

      modal.open();

      const firstRemoveBtn = modal.contentEl.querySelector<HTMLElement>(".ms-tag-remove-btn");
      expect(firstRemoveBtn).not.toBeNull();
      firstRemoveBtn?.click();

      const remainingBadges = modal.contentEl.querySelectorAll(".ms-selected-tags-area .ms-tag-badge");
      expect(remainingBadges.length).toBe(1);

      const saveBtn = Array.from(
        modal.contentEl.querySelectorAll<HTMLButtonElement>("button")
      ).find((b) => b.textContent === "Apply Changes");

      saveBtn?.click();
      expect(onSave).toHaveBeenCalledWith("Beta", expect.any(Array));
    });
  });
});
