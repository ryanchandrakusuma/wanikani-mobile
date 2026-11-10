import { useState } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Redirect, router } from "expo-router";
import { useAuth } from "../auth/AuthContext";
import { radius, spacing, useTheme } from "../theme";

// Step 1 placeholder: proves the token works. Lesson/review counts arrive in Step 3.
export default function Home() {
  const theme = useTheme();
  const { status, user, signOut, refreshUser } = useAuth();
  const [refreshing, setRefreshing] = useState(false);

  if (status === "signedOut") return <Redirect href="/login" />;

  const onRefresh = async () => {
    setRefreshing(true);
    try { await refreshUser(); } catch { /* offline: keep showing cached info */ }
    setRefreshing(false);
  };

  const onSignOut = async () => {
    await signOut();
    router.replace("/login");
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <Text style={[styles.greeting, { color: theme.textMuted }]}>おかえり</Text>
        <Text style={[styles.name, { color: theme.text }]}>{user?.username ?? "Loading…"}</Text>

        <View style={[styles.panel, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <Row label="Level" value={user ? String(user.level) : "–"} />
          <Row label="Subscription" value={user ? user.subscription.type : "–"} />
          <Row label="Levels unlocked" value={user ? `up to ${user.subscription.max_level_granted}` : "–"} />
          {user?.current_vacation_started_at && <Row label="Vacation mode" value="On" />}
        </View>

        {!user && (
          <Text style={[styles.note, { color: theme.textMuted }]}>
            {"Couldn't reach WaniKani. Pull down to try again."}
          </Text>
        )}

        <Pressable onPress={onSignOut} style={styles.signOut} accessibilityRole="button">
          <Text style={{ color: theme.danger, fontWeight: "600", fontSize: 15 }}>Disconnect account</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  const theme = useTheme();
  return (
    <View style={styles.row}>
      <Text style={{ color: theme.textMuted, fontSize: 15 }}>{label}</Text>
      <Text style={{ color: theme.text, fontSize: 15, fontWeight: "600" }}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  content: { padding: spacing.lg, gap: spacing.md, width: "100%", maxWidth: 640, alignSelf: "center" },
  greeting: { fontSize: 16 },
  name: { fontSize: 30, fontWeight: "700", marginTop: -spacing.sm },
  panel: { borderWidth: 1, borderRadius: radius.md, padding: spacing.md, gap: spacing.md },
  row: { flexDirection: "row", justifyContent: "space-between" },
  note: { fontSize: 14 },
  signOut: { paddingVertical: spacing.md, alignSelf: "flex-start" },
});
