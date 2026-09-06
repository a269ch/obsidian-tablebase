import { TagColor } from "../types";

export interface ColorScheme {
  bg: string;
  text: string;
  border?: string;
  darkBg: string;
  darkText: string;
}

export const TAG_PALETTE_COLORS: Record<TagColor, ColorScheme> = {
  default: {
    bg: "rgba(227, 226, 224, 0.5)",
    text: "#37352f",
    darkBg: "rgba(255, 255, 255, 0.08)",
    darkText: "rgba(255, 255, 255, 0.81)",
  },
  gray: {
    bg: "rgba(227, 226, 224, 0.6)",
    text: "#5a5a5a",
    darkBg: "rgba(155, 154, 151, 0.2)",
    darkText: "#9b9a97",
  },
  brown: {
    bg: "rgba(238, 224, 218, 0.6)",
    text: "#64473a",
    darkBg: "rgba(140, 46, 0, 0.2)",
    darkText: "#ba856f",
  },
  orange: {
    bg: "rgba(250, 222, 201, 0.6)",
    text: "#894a00",
    darkBg: "rgba(245, 93, 0, 0.2)",
    darkText: "#c77d48",
  },
  yellow: {
    bg: "rgba(253, 236, 200, 0.65)",
    text: "#89632a",
    darkBg: "rgba(233, 168, 0, 0.2)",
    darkText: "#ca9849",
  },
  green: {
    bg: "rgba(219, 237, 219, 0.6)",
    text: "#2b593f",
    darkBg: "rgba(0, 135, 107, 0.2)",
    darkText: "#529e72",
  },
  blue: {
    bg: "rgba(211, 229, 239, 0.6)",
    text: "#28456c",
    darkBg: "rgba(0, 120, 223, 0.2)",
    darkText: "#5e87c9",
  },
  purple: {
    bg: "rgba(232, 222, 238, 0.6)",
    text: "#492f64",
    darkBg: "rgba(103, 36, 222, 0.2)",
    darkText: "#9d68d3",
  },
  pink: {
    bg: "rgba(244, 223, 235, 0.6)",
    text: "#69314c",
    darkBg: "rgba(221, 0, 129, 0.2)",
    darkText: "#ba4d76",
  },
  red: {
    bg: "rgba(255, 226, 221, 0.6)",
    text: "#6e3630",
    darkBg: "rgba(255, 0, 26, 0.2)",
    darkText: "#be5249",
  },
};

export const COLOR_LIST: TagColor[] = [
  "default",
  "gray",
  "brown",
  "orange",
  "yellow",
  "green",
  "blue",
  "purple",
  "pink",
  "red",
];

/**
 * Deterministically generates a color for a given tag name using djb2-like hash.
 */
export function getHashColor(tagName: string): TagColor {
  if (!tagName) return "default";
  let hash = 0;
  const normalized = tagName.trim().toLowerCase();
  for (let i = 0; i < normalized.length; i++) {
    hash = (hash << 5) - hash + normalized.charCodeAt(i);
    hash |= 0;
  }
  const colorIndex = Math.abs(hash) % COLOR_LIST.length;
  return COLOR_LIST[colorIndex];
}

/**
 * Resolves the TagColor for a tag, checking user overrides first.
 */
export function resolveTagColor(
  tagName: string,
  customColors?: Record<string, TagColor>
): TagColor {
  const cleanName = tagName.trim().toLowerCase();
  if (customColors && customColors[cleanName]) {
    return customColors[cleanName];
  }
  return getHashColor(cleanName);
}
