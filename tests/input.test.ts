import { describe, it, expect, vi } from "vitest";
import {
  attachStrictNumericInputHandlers,
  sanitizeNumericCellValue,
  stripNonNumericCharacters,
} from "../src/utils/input";

describe("stripNonNumericCharacters", () => {
  it("should keep digits, a single leading minus and a single separator", () => {
    expect(stripNonNumericCharacters("$ -12.34 abc")).toBe("-12.34");
    expect(stripNonNumericCharacters("12,5")).toBe("12,5");
    expect(stripNonNumericCharacters("1.2.3")).toBe("1.23");
    expect(stripNonNumericCharacters("5-6")).toBe("56");
    expect(stripNonNumericCharacters("abc")).toBe("");
    expect(stripNonNumericCharacters("")).toBe("");
  });
});

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

    const enterEvt = { key: "Enter", preventDefault: vi.fn() };
    onKeyDown(enterEvt);
    expect(enterEvt.preventDefault).not.toHaveBeenCalled();

    const digitEvt = { key: "5", preventDefault: vi.fn() };
    onKeyDown(digitEvt);
    expect(digitEvt.preventDefault).not.toHaveBeenCalled();

    const letterEvt = { key: "a", preventDefault: vi.fn() };
    onKeyDown(letterEvt);
    expect(letterEvt.preventDefault).toHaveBeenCalled();

    mockInput.value = "";
    mockInput.selectionStart = 0;
    const minusEvt = { key: "-", preventDefault: vi.fn() };
    onKeyDown(minusEvt);
    expect(minusEvt.preventDefault).not.toHaveBeenCalled();

    mockInput.value = "10";
    mockInput.selectionStart = 2;
    const minusBlockedEvt = { key: "-", preventDefault: vi.fn() };
    onKeyDown(minusBlockedEvt);
    expect(minusBlockedEvt.preventDefault).toHaveBeenCalled();

    mockInput.value = "10";
    const dotEvt = { key: ".", preventDefault: vi.fn() };
    onKeyDown(dotEvt);
    expect(dotEvt.preventDefault).not.toHaveBeenCalled();

    mockInput.value = "10.5";
    const secondDotEvt = { key: ".", preventDefault: vi.fn() };
    onKeyDown(secondDotEvt);
    expect(secondDotEvt.preventDefault).toHaveBeenCalled();

    mockInput.value = "$ -12.34 abc";
    onInput();
    expect(mockInput.value).toBe("-12.34");
  });
});
