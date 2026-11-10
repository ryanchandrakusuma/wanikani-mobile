import { useState } from "react";
import { ActivityIndicator, Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Redirect, router } from "expo-router";
import { useAuth } from "../auth/AuthContext";
import { useSync } from "../sync/SyncContext";
import { radius, spacing, useTheme } from "../theme";
import { formatRelative } from "../utils/time";

const formatCount = (n: number) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ",");

// Step 2: account info + sync status + what's stored locally.
// The real lesson/review to-do list replaces the "stored" panel in Step 3.
export default function Home() {
  const theme = useTheme();
  const { status, user, signOut, refreshUser } = useAuth();
  const { phase, progress, lastSyncedAt, error, counts, sync, pendingOutboxCount } = useSync();
  const [refreshing, setRefreshing] = useState(false);

  if (status === "signedOut") return <Redirect href="/login" />;

  const onRefresh = async () => {
    setRefreshing(true);
    try { await refreshUser(); } catch { /* offline: keep showing cached info */ }
    await sync();
    setRefreshing(false);
  };

  const doSignOut = async () => {
    await signOut();
    router.replace("/login");
  };

  const onSignOut = async () => {
    const pending = await pendingOutboxCount();
    if (pending === 0) return doSignOut();
    Alert.alert(
      "Unsent results",
      `${pending} result${pending === 1 ? " hasn't" : "s haven't"} been sent to WaniKani yet. ` +
        "They stay on this device and are sent when you sign in again with the same account.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Disconnect anyway", style: "destructive", onPress: () => void doSignOut() },
      ],
    );
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

        <View style={styles.syncRow} accessibilityLiveRegion="polite">
          {phase === "syncing" && <ActivityIndicator size="small" color={theme.primary} />}
          <Text
            style={[styles.note, { color: phase === "error" ? theme.danger : theme.textMuted }]}
            testID="sync-status"
          >
            {syncLabel(phase, progress, lastSyncedAt, error)}
          </Text>
        </View>

        {counts && (
          <View style={[styles.panel, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <Text style={[styles.panelTitle, { color: theme.text }]}>Local summary</Text>
            <Row label="Items" value={formatCount(counts.subjects)} />
            <Row label="Your progress" value={formatCount(counts.assignments)} />
            <Row label="Review stats" value={formatCount(counts.review_statistics)} />
            <Row label="Your notes" value={formatCount(counts.study_materials)} />
            <Row label="Levels" value={formatCount(counts.level_progressions)} />
            <Row label="Spaced repetition systems" value={formatCount(counts.srs_systems)} />
          </View>
        )}

        <Pressable onPress={onSignOut} style={styles.signOut} accessibilityRole="button">
          <Text style={{ color: theme.danger, fontWeight: "600", fontSize: 15 }}>Disconnect account</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

function syncLabel(
  phase: ReturnType<typeof useSync>["phase"],
  progress: ReturnType<typeof useSync>["progress"],
  lastSyncedAt: string | null,
  error: string | null,
): string {
  if (phase === "syncing") {
    if (!progress) return "Syncing…";
    return progress.total > 0
      ? `Syncing ${progress.label}… ${formatCount(progress.fetched)} / ${formatCount(progress.total)}`
      : `Syncing ${progress.label}…`;
  }
  if (phase === "error") return error ?? "Sync failed.";
  return lastSyncedAt ? `Synced ${formatRelative(lastSyncedAt)}` : "Not synced yet";
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
  panelTitle: { fontSize: 15, fontWeight: "700" },
  row: { flexDirection: "row", justifyContent: "space-between" },
  syncRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  note: { fontSize: 14, flexShrink: 1 },
  signOut: { paddingVertical: spacing.md, alignSelf: "flex-start" },
});
