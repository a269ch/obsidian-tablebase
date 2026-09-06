import { describe, it, expect, vi } from "vitest";
import {
  attachStrictNumericInputHandlers,
  sanitizeNumericCellValue,
} from "../src/ui/input-utils";

describe("Input Utils", () => {
  it("should sanitize numeric cell values properly", () => {
    expect(sanitizeNumericCellValue("123")).toBe("123");
    expect(sanitizeNumericCellValue("-45.67")).toBe("-45.67");
    expect(sanitizeNumericCellValue("  100  ")).toBe("100");
    expect(sanitizeNumericCellValue("-")).toBe("");
    expect(sanitizeNumericCellValue(".")).toBe("");
    expect(sanitizeNumericCellValue(",")).toBe("");
    expect(sanitizeNumericCellValue("   ")).toBe("");
  });

  it("should attach strict numeric input handlers and restrict invalid characters", () => {
    const listeners: Record<string, Function[]> = {};
    const attributes: Record<string, string> = {};

    const mockInput = {
      value: "",
      selectionStart: 0,
      setAttribute: (k: string, v: string) => {
        attributes[k] = v;
      },
      addEventListener: (evt: string, fn: Function) => {
        if (!listeners[evt]) listeners[evt] = [];
        listeners[evt].push(fn);
      },
    } as unknown as HTMLInputElement;

    attachStrictNumericInputHandlers(mockInput);

    expect(attributes["inputmode"]).toBe("decimal");
    expect(attributes["placeholder"]).toBe("0");
    expect(listeners["keydown"]?.length).toBe(1);
    expect(listeners["input"]?.length).toBe(1);

    const onKeyDown = listeners["keydown"][0];
    const onInput = listeners["input"][0];

    // Allowed navigation and control keys
    const enterEvt = { key: "Enter", preventDefault: vi.fn() };
    onKeyDown(enterEvt);
    expect(enterEvt.preventDefault).not.toHaveBeenCalled();

    // Allowed digit key
    const digitEvt = { key: "5", preventDefault: vi.fn() };
    onKeyDown(digitEvt);
    expect(digitEvt.preventDefault).not.toHaveBeenCalled();

    // Blocked letter key
    const letterEvt = { key: "a", preventDefault: vi.fn() };
    onKeyDown(letterEvt);
    expect(letterEvt.preventDefault).toHaveBeenCalled();

    // Minus at position 0 allowed
    mockInput.value = "";
    mockInput.selectionStart = 0;
    const minusEvt = { key: "-", preventDefault: vi.fn() };
    onKeyDown(minusEvt);
    expect(minusEvt.preventDefault).not.toHaveBeenCalled();

    // Minus blocked if already present or not at position 0
    mockInput.value = "10";
    mockInput.selectionStart = 2;
    const minusBlockedEvt = { key: "-", preventDefault: vi.fn() };
    onKeyDown(minusBlockedEvt);
    expect(minusBlockedEvt.preventDefault).toHaveBeenCalled();

    // Single dot allowed
    mockInput.value = "10";
    const dotEvt = { key: ".", preventDefault: vi.fn() };
    onKeyDown(dotEvt);
    expect(dotEvt.preventDefault).not.toHaveBeenCalled();

    // Second dot blocked
    mockInput.value = "10.5";
    const secondDotEvt = { key: ".", preventDefault: vi.fn() };
    onKeyDown(secondDotEvt);
    expect(secondDotEvt.preventDefault).toHaveBeenCalled();

    // Input sanitization test (e.g. pasted letters)
    mockInput.value = "$ -12.34 abc";
    onInput();
    expect(mockInput.value).toBe("-12.34");
  });
});
