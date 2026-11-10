import type { ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";
import { radius, spacing, useTheme } from "../theme";

/** A bordered card with an optional title. */
export function Panel({ title, children }: { title?: string; children: ReactNode }) {
  const theme = useTheme();
  return (
    <View style={[styles.panel, { backgroundColor: theme.surface, borderColor: theme.border }]}>
      {title && <Text style={[styles.title, { color: theme.text }]}>{title}</Text>}
      {children}
    </View>
  );
}

/** A label on the left, a value on the right. */
export function Row({ label, value }: { label: string; value: string }) {
  const theme = useTheme();
  return (
    <View style={styles.row}>
      <Text style={{ color: theme.textMuted, fontSize: 15, flexShrink: 1 }}>{label}</Text>
      <Text style={{ color: theme.text, fontSize: 15, fontWeight: "600" }}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { borderWidth: 1, borderRadius: radius.md, padding: spacing.md, gap: spacing.md },
  title: { fontSize: 15, fontWeight: "700" },
  row: { flexDirection: "row", justifyContent: "space-between", gap: spacing.md },
});
