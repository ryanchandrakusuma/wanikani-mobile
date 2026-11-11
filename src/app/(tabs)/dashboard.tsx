import { StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { spacing, useTheme } from "../../theme";

// Placeholder until Step 8 (item spread, forecast, daily history, accuracy).
export default function Dashboard() {
  const theme = useTheme();
  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]} edges={["top", "left", "right"]}>
      <View style={styles.content}>
        <Text style={[styles.heading, { color: theme.text }]} accessibilityRole="header">Dashboard</Text>
        <Text style={{ color: theme.textMuted, fontSize: 15, lineHeight: 22 }}>
          Charts for your progress, review forecast and daily history are coming in a later step.
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  content: { padding: spacing.lg, gap: spacing.md, width: "100%", maxWidth: 640, alignSelf: "center" },
  heading: { fontSize: 28, fontWeight: "700" },
});
