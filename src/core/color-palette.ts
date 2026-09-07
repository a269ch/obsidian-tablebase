import { TagColor, PresetTagColor } from "../types";

export interface ColorScheme {
  bg: string;
  text: string;
  border?: string;
  darkBg: string;
  darkText: string;
}

export const TAG_PALETTE_COLORS: Record<PresetTagColor, ColorScheme> = {
  default: {
    bg: "rgba(227, 226, 224, 0.5)",
    text: "#37352f",
    darkBg: "rgba(255, 255, 255, 0.1)",
    darkText: "rgba(255, 255, 255, 0.88)",
  },
  gray: {
    bg: "rgba(227, 226, 224, 0.6)",
    text: "#5a5a5a",
    darkBg: "rgba(151, 154, 155, 0.25)",
    darkText: "#9b9a97",
  },
  brown: {
    bg: "rgba(238, 224, 218, 0.6)",
    text: "#64473a",
    darkBg: "rgba(147, 114, 100, 0.28)",
    darkText: "#c49d8c",
  },
  orange: {
    bg: "rgba(250, 222, 201, 0.6)",
    text: "#894a00",
    darkBg: "rgba(204, 114, 61, 0.28)",
    darkText: "#f39b62",
  },
  yellow: {
    bg: "rgba(253, 236, 200, 0.65)",
    text: "#89632a",
    darkBg: "rgba(203, 145, 47, 0.28)",
    darkText: "#eec061",
  },
  green: {
    bg: "rgba(219, 237, 219, 0.6)",
    text: "#2b593f",
    darkBg: "rgba(68, 131, 97, 0.28)",
    darkText: "#6fc493",
  },
  blue: {
    bg: "rgba(211, 229, 239, 0.6)",
    text: "#28456c",
    darkBg: "rgba(51, 126, 169, 0.28)",
    darkText: "#76b8df",
  },
  purple: {
    bg: "rgba(232, 222, 238, 0.6)",
    text: "#492f64",
    darkBg: "rgba(144, 101, 176, 0.28)",
    darkText: "#be96e8",
  },
  pink: {
    bg: "rgba(244, 223, 235, 0.6)",
    text: "#69314c",
    darkBg: "rgba(193, 76, 138, 0.28)",
    darkText: "#ea7bb7",
  },
  red: {
    bg: "rgba(255, 226, 221, 0.6)",
    text: "#6e3630",
    darkBg: "rgba(212, 76, 71, 0.28)",
    darkText: "#ff837d",
  },
};

export const COLOR_LIST: PresetTagColor[] = [
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

export function getCustomColorScheme(hex: string): ColorScheme {
  const cleanHex = hex.replace("#", "");
  const r = parseInt(cleanHex.substring(0, 2), 16) || 0;
  const g = parseInt(cleanHex.substring(2, 4), 16) || 0;
  const b = parseInt(cleanHex.substring(4, 6), 16) || 0;

  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  let darkText = hex;

  if (luminance < 0.55) {
    const factor = Math.min(0.65, (0.55 - luminance) * 1.2 + 0.35);
    const lr = Math.round(r + (255 - r) * factor);
    const lg = Math.round(g + (255 - g) * factor);
    const lb = Math.round(b + (255 - b) * factor);
    const toHex = (n: number) => n.toString(16).padStart(2, "0");
    darkText = `#${toHex(lr)}${toHex(lg)}${toHex(lb)}`;
  }

  return {
    bg: `rgba(${r}, ${g}, ${b}, 0.18)`,
    text: hex,
    darkBg: `rgba(${r}, ${g}, ${b}, 0.28)`,
    darkText,
  };
}

export function getColorScheme(color: TagColor): ColorScheme {
  if (color && typeof color === "string" && color.startsWith("#")) {
    return getCustomColorScheme(color);
  }
  return TAG_PALETTE_COLORS[color as PresetTagColor] || TAG_PALETTE_COLORS.default;
}

export function getHashColor(tagName: string): PresetTagColor {
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
