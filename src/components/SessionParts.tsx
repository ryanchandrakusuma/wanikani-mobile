import type { ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { radius, spacing, useTheme } from "../theme";

// Building blocks shared by the lesson and review screens.

/** Top bar: a close (✕) button, a title, and an optional item on the right. */
export function SessionHeader({ title, closeLabel, onClose, right }: {
  title: string; closeLabel: string; onClose: () => void; right?: ReactNode;
}) {
  const theme = useTheme();
  return (
    <View style={[styles.header, { borderColor: theme.border }]}>
      <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel={closeLabel} hitSlop={12} style={styles.side}>
        <Text style={{ color: theme.text, fontSize: 22 }}>✕</Text>
      </Pressable>
      <Text style={[styles.title, { color: theme.text }]} accessibilityRole="header">{title}</Text>
      <View style={[styles.side, { alignItems: "flex-end" }]}>{right}</View>
    </View>
  );
}

export function Centered({ children }: { children: ReactNode }) {
  return <View style={styles.centered}>{children}</View>;
}

export function Message({ title, body, children }: { title: string; body: string; children: ReactNode }) {
  const theme = useTheme();
  return (
    <Centered>
      <View style={styles.message}>
        <Text style={[styles.messageTitle, { color: theme.text }]}>{title}</Text>
        <Text style={[styles.messageBody, { color: theme.textMuted }]}>{body}</Text>
        <View style={{ gap: spacing.sm, alignSelf: "stretch" }}>{children}</View>
      </View>
    </Centered>
  );
}

export function Button({ label, onPress, secondary, disabled, flex }: {
  label: string; onPress: () => void; secondary?: boolean; disabled?: boolean; flex?: boolean;
}) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled }}
      style={({ pressed }) => [
        styles.button,
        flex && { flex: 1 },
        secondary
          ? { borderWidth: 1, borderColor: theme.border }
          : { backgroundColor: theme.primary },
        { opacity: disabled ? 0.4 : pressed ? 0.8 : 1 },
      ]}
    >
      <Text style={{ color: secondary ? theme.text : theme.onPrimary, fontWeight: "700", fontSize: 16 }}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderBottomWidth: 1,
  },
  side: { minWidth: 48 },
  title: { fontSize: 17, fontWeight: "700" },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.lg },
  message: { width: "100%", maxWidth: 480, gap: spacing.md, alignItems: "center" },
  messageTitle: { fontSize: 22, fontWeight: "700", textAlign: "center" },
  messageBody: { fontSize: 15, lineHeight: 22, textAlign: "center" },
  button: { borderRadius: radius.sm, paddingVertical: 14, alignItems: "center", minHeight: 50, justifyContent: "center" },
});
