import { describe, it, expect } from "vitest";
import { SelectionModel } from "../src/ui/table/selection";

describe("SelectionModel", () => {
  it("should start empty", () => {
    const selection = new SelectionModel();

    expect(selection.isEmpty()).toBe(true);
    expect(selection.getFocusedCell()).toBeNull();
    expect(selection.current.kind).toBe("none");
  });

  it("should highlight the row and column of a focused cell", () => {
    const selection = new SelectionModel();
    selection.focusCell(2, 3);

    expect(selection.getFocusedCell()).toEqual({ row: 2, col: 3 });
    expect(selection.isCellFocused(2, 3)).toBe(true);
    expect(selection.isCellFocused(2, 4)).toBe(false);
    expect(selection.isRowHighlighted(2)).toBe(true);
    expect(selection.isColumnHighlighted(3)).toBe(true);
    expect(selection.isRowHighlighted(1)).toBe(false);
  });

  it("should not report a focused cell for row selections", () => {
    const selection = new SelectionModel();
    selection.focusRow(4);

    expect(selection.getFocusedCell()).toBeNull();
    expect(selection.isRowFocused(4)).toBe(true);
    expect(selection.isRowHighlighted(4)).toBe(true);
    expect(selection.isColumnHighlighted(0)).toBe(false);
  });

  it("should not report a focused cell for column selections", () => {
    const selection = new SelectionModel();
    selection.focusColumn(1);

    expect(selection.getFocusedCell()).toBeNull();
    expect(selection.isColumnFocused(1)).toBe(true);
    expect(selection.isColumnHighlighted(1)).toBe(true);
    expect(selection.isRowHighlighted(0)).toBe(false);
  });

  it("should replace previous selection when focus changes", () => {
    const selection = new SelectionModel();

    selection.focusRow(1);
    selection.focusColumn(2);

    expect(selection.isRowFocused(1)).toBe(false);
    expect(selection.isColumnFocused(2)).toBe(true);
  });

  it("should reset to empty on clear", () => {
    const selection = new SelectionModel();
    selection.focusCell(1, 1);
    selection.clear();

    expect(selection.isEmpty()).toBe(true);
    expect(selection.isCellFocused(1, 1)).toBe(false);
    expect(selection.isRowHighlighted(1)).toBe(false);
    expect(selection.isColumnHighlighted(1)).toBe(false);
  });
});
