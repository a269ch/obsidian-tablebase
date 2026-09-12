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

  it("should round-trip a selection through serialize and restore", () => {
    const selection = new SelectionModel();
    selection.focusCell(3, 2);
    expect(selection.serialize()).toEqual({ kind: "cell", row: 3, col: 2 });

    selection.focusRow(1);
    expect(selection.serialize()).toEqual({ kind: "row", row: 1 });

    selection.focusColumn(4);
    expect(selection.serialize()).toEqual({ kind: "column", col: 4 });

    selection.clear();
    expect(selection.serialize()).toBeUndefined();

    const restored = new SelectionModel();
    restored.restore({ kind: "cell", row: 3, col: 2 });
    expect(restored.isCellFocused(3, 2)).toBe(true);

    restored.restore({ kind: "row", row: 5 });
    expect(restored.isRowFocused(5)).toBe(true);

    restored.restore({ kind: "column", col: 6 });
    expect(restored.isColumnFocused(6)).toBe(true);
  });

  it("should clear the selection for missing or malformed snapshots", () => {
    const selection = new SelectionModel();

    selection.focusCell(1, 1);
    selection.restore(undefined);
    expect(selection.isEmpty()).toBe(true);

    selection.focusCell(1, 1);
    selection.restore({ kind: "cell", row: 2 });
    expect(selection.isEmpty()).toBe(true);

    selection.focusCell(1, 1);
    selection.restore({ kind: "row" });
    expect(selection.isEmpty()).toBe(true);
  });

});
