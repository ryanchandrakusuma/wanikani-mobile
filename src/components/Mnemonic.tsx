import { StyleSheet, Text, type TextStyle } from "react-native";
import { parseMarkup, type MarkupTag } from "../subjects/markup";
import { itemColors, useTheme } from "../theme";

/** Renders WaniKani mnemonic/hint text with its tags coloured like on the website. */
export function Mnemonic({ text, style }: { text: string | null | undefined; style?: TextStyle }) {
  const theme = useTheme();
  const segments = parseMarkup(text);
  if (segments.length === 0) return null;

  const tagStyle = (tag: MarkupTag | null): TextStyle | undefined => {
    switch (tag) {
      case "radical": return { ...styles.tag, backgroundColor: itemColors.radical };
      case "kanji": return { ...styles.tag, backgroundColor: itemColors.kanji };
      case "vocabulary": return { ...styles.tag, backgroundColor: itemColors.vocabulary };
      case "reading": return { ...styles.reading, backgroundColor: theme.highlight };
      case "meaning": return styles.meaning;
      default: return undefined;
    }
  };

  return (
    <Text style={[styles.text, { color: theme.text }, style]}>
      {segments.map((s, i) => (
        <Text key={i} style={tagStyle(s.tag)}>{s.text}</Text>
      ))}
    </Text>
  );
}

const styles = StyleSheet.create({
  text: { fontSize: 16, lineHeight: 24 },
  tag: { color: "#FFFFFF", fontWeight: "600" },
  reading: { fontWeight: "700" },
  meaning: { fontWeight: "700" },
});
