import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import { App } from "obsidian";
import { DatePickerPopover } from "../src/ui/modals/date-picker-popover";
import { installObsidianDomHelpers } from "./helpers/obsidian-dom";

const POPOVER_SELECTOR = ".ms-date-picker-popover";

function stubLayout(el: Element, rect: Partial<DOMRect>): void {
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
  const merged = { ...base, ...rect };
  el.getBoundingClientRect = (): DOMRect =>
    ({ ...merged, toJSON: () => merged }) as DOMRect;
}

function createAnchor(): HTMLElement {
  const anchor = document.createElement("td");
  document.body.appendChild(anchor);
  stubLayout(anchor, {});
  return anchor;
}

function openPicker(options: {
  currentDate?: string;
  onSelectDate?: (value: string) => Promise<void>;
} = {}): { anchor: HTMLElement; popover: DatePickerPopover } {
  const anchor = createAnchor();
  const popover = new DatePickerPopover({
    app: {} as App,
    anchorEl: anchor,
    currentDate: options.currentDate ?? "2026-09-15",
    dateFormat: "YYYY-MM-DD",
    onSelectDate: options.onSelectDate ?? (async () => undefined),
  });
  popover.open();
  return { anchor, popover };
}

describe("DatePickerPopover", () => {
  beforeAll(() => {
    installObsidianDomHelpers(window as Window & typeof globalThis);
  });

  beforeEach(() => {
    document.body.innerHTML = "";
    window.innerHeight = 800;
    window.innerWidth = 1200;
  });

  it("should mount the calendar into the document on open", () => {
    openPicker();

    const mounted = document.querySelector(POPOVER_SELECTOR);
    expect(mounted).not.toBeNull();
    expect(mounted?.isConnected).toBe(true);
  });

  it("should render weekday headers and a full month of day cells", () => {
    openPicker({ currentDate: "2026-09-15" });

    const mounted = document.querySelector(POPOVER_SELECTOR);
    const headers = mounted?.querySelectorAll(".ms-date-day-header") ?? [];
    const dayCells =
      mounted?.querySelectorAll(".ms-date-day-cell:not(.is-other-month)") ?? [];

    expect(headers.length).toBe(7);
    expect(dayCells.length).toBe(30);
  });

  it("should highlight the currently selected date", () => {
    openPicker({ currentDate: "2026-09-15" });

    const selected = document.querySelectorAll(`${POPOVER_SELECTOR} .is-selected`);
    expect(selected.length).toBe(1);
    expect(selected[0].textContent).toBe("15");
  });

  it("should report the clicked day back in the configured format", async () => {
    const onSelectDate = vi.fn(async () => undefined);
    openPicker({ currentDate: "2026-09-15", onSelectDate });

    const cells = Array.from(
      document.querySelectorAll<HTMLElement>(
        `${POPOVER_SELECTOR} .ms-date-day-cell:not(.is-other-month)`
      )
    );
    const target = cells.find((cell) => cell.textContent === "20");
    target?.dispatchEvent(new MouseEvent("click", { bubbles: true }));

    expect(onSelectDate).toHaveBeenCalledWith("2026-09-20");
  });

  it("should navigate to the month grid and back down to days", () => {
    openPicker({ currentDate: "2026-09-15" });

    const monthLabel = document.querySelector<HTMLElement>(
      `${POPOVER_SELECTOR} .ms-date-label-btn`
    );
    expect(monthLabel?.textContent).toBe("September");

    monthLabel?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    const monthItems = document.querySelectorAll(`${POPOVER_SELECTOR} .ms-date-grid-item`);
    expect(monthItems.length).toBe(12);

    (monthItems[0] as HTMLElement).dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(
      document.querySelectorAll(`${POPOVER_SELECTOR} .ms-date-day-header`).length
    ).toBe(7);
  });

  it("should page through years from the year grid", () => {
    openPicker({ currentDate: "2026-09-15" });

    const labels = document.querySelectorAll<HTMLElement>(
      `${POPOVER_SELECTOR} .ms-date-label-btn`
    );
    labels[1]?.dispatchEvent(new MouseEvent("click", { bubbles: true }));

    const yearItems = document.querySelectorAll(`${POPOVER_SELECTOR} .ms-date-grid-item`);
    expect(yearItems.length).toBe(12);
    expect(yearItems[0].textContent).toBe("2016");
  });

  it("should open on an empty cell using today as the view month", () => {
    openPicker({ currentDate: "" });

    const mounted = document.querySelector(POPOVER_SELECTOR);
    expect(mounted).not.toBeNull();
    expect(
      (mounted?.querySelectorAll(".ms-date-day-cell:not(.is-other-month)") ?? []).length
    ).toBeGreaterThan(27);
  });

  it("should render navigation buttons with real icons", () => {
    openPicker();

    const navButtons = document.querySelectorAll(`${POPOVER_SELECTOR} .ms-date-nav-btn`);
    expect(navButtons.length).toBe(2);

    for (const button of Array.from(navButtons)) {
      const svg = button.querySelector("svg");
      expect(svg).not.toBeNull();
      expect(svg?.getAttribute("width")).toBe("14");
    }
  });
});
