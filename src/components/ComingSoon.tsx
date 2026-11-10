import { Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { radius, spacing, useTheme } from "../theme";

/** Full-screen placeholder for sessions that are built in a later step. */
export function ComingSoon({ title, message }: { title: string; message: string }) {
  const theme = useTheme();
  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]}>
      <View style={styles.content}>
        <Text style={[styles.heading, { color: theme.text }]} accessibilityRole="header">{title}</Text>
        <Text style={{ color: theme.textMuted, fontSize: 15, lineHeight: 22 }}>{message}</Text>
        <Pressable
          onPress={() => router.back()}
          accessibilityRole="button"
          style={({ pressed }) => [styles.button, { borderColor: theme.border, opacity: pressed ? 0.7 : 1 }]}
        >
          <Text style={{ color: theme.text, fontWeight: "600" }}>Back</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  content: { padding: spacing.lg, gap: spacing.md, width: "100%", maxWidth: 640, alignSelf: "center" },
  heading: { fontSize: 28, fontWeight: "700" },
  button: {
    borderWidth: 1, borderRadius: radius.sm, paddingVertical: 12, alignItems: "center", alignSelf: "flex-start",
    paddingHorizontal: spacing.lg, minHeight: 44,
  },
});
