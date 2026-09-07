import { describe, it, expect, beforeEach } from "vitest";
import { appendIcon, appendIconLabel, setFixedWidth } from "../src/utils/dom";
import { installObsidianDomHelpers } from "./helpers/obsidian-dom";
import {
  COLUMN_TYPE_DEFINITIONS,
  getColumnTypeIcon,
  ICON_ARROW_DOWN,
  ICON_CHECK,
  ICON_GRIP,
  ICON_PLUS,
  ICON_SEARCH,
  ICON_TRASH,
  ICON_VIEW_BOARD,
  ICON_VIEW_TABLE,
} from "../src/ui/icons";

const SVG_NAMESPACE = "http://www.w3.org/2000/svg";

const SAMPLE_ICONS = [
  ICON_PLUS,
  ICON_CHECK,
  ICON_TRASH,
  ICON_SEARCH,
  ICON_GRIP,
  ICON_ARROW_DOWN,
  ICON_VIEW_TABLE,
  ICON_VIEW_BOARD,
];

describe("appendIcon", () => {
  beforeEach(() => {
    installObsidianDomHelpers(window as Window & typeof globalThis);
  });

  it("should render a real SVG element in the SVG namespace", () => {
    const parent = document.createElement("div");
    const icon = appendIcon(parent, ICON_PLUS);

    expect(icon.namespaceURI).toBe(SVG_NAMESPACE);
    expect(icon.tagName.toLowerCase()).toBe("svg");
    expect(parent.firstElementChild).toBe(icon);
  });

  it("should preserve the declared icon dimensions", () => {
    const parent = document.createElement("div");
    const icon = appendIcon(parent, ICON_PLUS);

    expect(icon.getAttribute("width")).toBe("13");
    expect(icon.getAttribute("height")).toBe("13");
    expect(icon.getAttribute("viewBox")).toBe("0 0 24 24");
  });

  it("should preserve icon child geometry", () => {
    const parent = document.createElement("div");
    const icon = appendIcon(parent, ICON_PLUS);

    expect(icon.children.length).toBeGreaterThan(0);
    for (const child of Array.from(icon.children)) {
      expect(child.namespaceURI).toBe(SVG_NAMESPACE);
    }
  });

  it("should not contain inline margin or vertical-align styles on ICON_PLUS to keep column alignment clean", () => {
    const parent = document.createElement("div");
    const icon = appendIcon(parent, ICON_PLUS);

    expect(icon.style.marginRight).toBe("");
    expect(icon.style.verticalAlign).toBe("");
    expect(icon.getAttribute("stroke-width")).toBe("2");
  });

  it("should never emit a dimensionless svg for any shipped icon", () => {
    const allIcons = [
      ...SAMPLE_ICONS,
      ...COLUMN_TYPE_DEFINITIONS.map((definition) => definition.icon),
      ...COLUMN_TYPE_DEFINITIONS.map((definition) => getColumnTypeIcon(definition.type)),
    ];

    for (const markup of allIcons) {
      const parent = document.createElement("div");
      const icon = appendIcon(parent, markup);

      expect(icon.namespaceURI).toBe(SVG_NAMESPACE);
      expect(icon.getAttribute("width")).toBeTruthy();
      expect(icon.getAttribute("height")).toBeTruthy();
      expect(icon.children.length).toBeGreaterThan(0);
    }
  });

  it("should return independent clones on repeated calls", () => {
    const first = document.createElement("div");
    const second = document.createElement("div");

    const iconA = appendIcon(first, ICON_CHECK);
    const iconB = appendIcon(second, ICON_CHECK);

    expect(iconA).not.toBe(iconB);
    expect(first.contains(iconA)).toBe(true);
    expect(second.contains(iconB)).toBe(true);
  });

  it("should apply extra classes without dropping existing ones", () => {
    const parent = document.createElement("div");
    const icon = appendIcon(parent, ICON_SEARCH, "ms-extra ms-second");

    expect(icon.classList.contains("ms-extra")).toBe(true);
    expect(icon.classList.contains("ms-second")).toBe(true);
  });

  it("should fall back to a zero-sized svg for invalid markup", () => {
    const parent = document.createElement("div");
    const icon = appendIcon(parent, "not markup at all");

    expect(icon.namespaceURI).toBe(SVG_NAMESPACE);
    expect(icon.getAttribute("width")).toBe("0");
    expect(icon.getAttribute("height")).toBe("0");
  });
});

describe("appendIconLabel", () => {
  it("should append the icon before the label text", () => {
    const button = document.createElement("button");
    appendIconLabel(button, ICON_PLUS, "New");

    expect(button.children.length).toBe(2);
    expect(button.children[0].namespaceURI).toBe(SVG_NAMESPACE);
    expect(button.children[1].tagName.toLowerCase()).toBe("span");
    expect(button.textContent).toBe("New");
  });

  it("should set label text without interpreting markup", () => {
    const button = document.createElement("button");
    appendIconLabel(button, ICON_PLUS, "<img src=x onerror=alert(1)>");

    expect(button.querySelector("img")).toBeNull();
    expect(button.textContent).toBe("<img src=x onerror=alert(1)>");
  });
});

describe("setFixedWidth", () => {
  it("should pin width, min-width and max-width together", () => {
    const cell = document.createElement("td");
    setFixedWidth(cell, 28);

    expect(cell.style.width).toBe("28px");
    expect(cell.style.minWidth).toBe("28px");
    expect(cell.style.maxWidth).toBe("28px");
  });
});
