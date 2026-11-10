import { useColorScheme } from "react-native";

// Accent colors taken from WaniKani's own item types, so the app
// feels familiar next to the website.
export const itemColors = {
  radical: "#00AAFF",
  kanji: "#FF00AA",
  vocabulary: "#AA00FF",
} as const;

const light = {
  background: "#F6F7FB",
  surface: "#FFFFFF",
  border: "#DADDE6",
  text: "#1C1E26",
  textMuted: "#5F6475",
  danger: "#C62828",
  success: "#2E7D32",
  highlight: "#ECEEF4",
  primary: itemColors.kanji,
  onPrimary: "#FFFFFF",
};

const dark: typeof light = {
  background: "#14151B",
  surface: "#1E2029",
  border: "#2E3140",
  text: "#ECEEF4",
  textMuted: "#A1A6B8",
  danger: "#EF5350",
  success: "#66BB6A",
  highlight: "#2E3140",
  primary: itemColors.kanji,
  onPrimary: "#FFFFFF",
};

/** Background colour for an item type (kana-only vocabulary uses the vocabulary colour). */
export function subjectColor(object: "radical" | "kanji" | "vocabulary" | "kana_vocabulary"): string {
  return object === "kana_vocabulary" ? itemColors.vocabulary : itemColors[object];
}

export type Theme = typeof light;

export function useTheme(): Theme {
  return useColorScheme() === "dark" ? dark : light;
}

export const spacing = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 } as const;
export const radius = { sm: 8, md: 12 } as const;
