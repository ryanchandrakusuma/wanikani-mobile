import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { useAuth } from "../../contexts/AuthContext";
import { Panel, Row } from "../../components/Panel";
import {
  DAILY_LESSON_LIMIT_STEP, DEFAULT_DAILY_LESSON_LIMIT, MAX_DAILY_LESSON_LIMIT, MIN_DAILY_LESSON_LIMIT,
} from "../../db/settings";
import { useSettings } from "../../settings/SettingsContext";
import { useSync } from "../../contexts/SyncContext";
import { syncLabel } from "../../sync/syncLabel";
import { radius, spacing, useTheme } from "../../theme";
import { formatCount } from "../../utils/format";

export default function Settings() {
  const theme = useTheme();
  const { user, signOut } = useAuth();
  const { phase, progress, lastSyncedAt, error, counts, sync, pendingOutboxCount } = useSync();
  const { dailyLessonLimit, setDailyLessonLimit } = useSettings();

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

  const syncing = phase === "syncing";

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]} edges={["top", "left", "right"]}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={[styles.heading, { color: theme.text }]} accessibilityRole="header">Settings</Text>

        <Panel title="Account">
          <Row label="Username" value={user?.username ?? "–"} />
          <Row label="Level" value={user ? String(user.level) : "–"} />
          <Row label="Subscription" value={user ? user.subscription.type : "–"} />
          <Row label="Levels unlocked" value={user ? `up to ${user.subscription.max_level_granted}` : "–"} />
          {user?.current_vacation_started_at && <Row label="Vacation mode" value="On" />}
        </Panel>

        <Panel title="Lessons">
          <View style={styles.stepperRow}>
            <Text style={{ color: theme.text, fontSize: 15, flexShrink: 1 }}>Daily lesson limit</Text>
            <View style={styles.stepper}>
              <StepButton
                label="−"
                accessibilityLabel="Decrease daily lesson limit"
                disabled={dailyLessonLimit <= MIN_DAILY_LESSON_LIMIT}
                onPress={() => setDailyLessonLimit(dailyLessonLimit - DAILY_LESSON_LIMIT_STEP)}
              />
              <Text style={[styles.stepValue, { color: theme.text }]} testID="daily-lesson-limit">
                {dailyLessonLimit}
              </Text>
              <StepButton
                label="+"
                accessibilityLabel="Increase daily lesson limit"
                disabled={dailyLessonLimit >= MAX_DAILY_LESSON_LIMIT}
                onPress={() => setDailyLessonLimit(dailyLessonLimit + DAILY_LESSON_LIMIT_STEP)}
              />
            </View>
          </View>
          <Text style={[styles.note, { color: theme.textMuted }]}>
            {`Default is ${DEFAULT_DAILY_LESSON_LIMIT}. Lessons done on the WaniKani website count toward today's total.`}
          </Text>
        </Panel>

        <Panel title="Sync">
          <View style={styles.syncRow} accessibilityLiveRegion="polite">
            {syncing && <ActivityIndicator size="small" color={theme.primary} />}
            <Text
              style={[styles.note, { color: phase === "error" ? theme.danger : theme.textMuted }]}
              testID="sync-status"
            >
              {syncLabel(phase, progress, lastSyncedAt, error)}
            </Text>
          </View>
          <Pressable
            onPress={() => void sync()}
            disabled={syncing}
            accessibilityRole="button"
            accessibilityState={{ disabled: syncing }}
            style={({ pressed }) => [
              styles.secondaryButton,
              { borderColor: theme.border, opacity: syncing ? 0.5 : pressed ? 0.7 : 1 },
            ]}
          >
            <Text style={{ color: theme.text, fontWeight: "600" }}>Sync now</Text>
          </Pressable>
        </Panel>

        {counts && (
          <Panel title="Local summary">
            <Row label="Items" value={formatCount(counts.subjects)} />
            <Row label="Your progress" value={formatCount(counts.assignments)} />
            <Row label="Review stats" value={formatCount(counts.review_statistics)} />
            <Row label="Your notes" value={formatCount(counts.study_materials)} />
            <Row label="Levels" value={formatCount(counts.level_progressions)} />
            <Row label="Spaced repetition systems" value={formatCount(counts.srs_systems)} />
          </Panel>
        )}

        <Pressable onPress={onSignOut} style={styles.signOut} accessibilityRole="button">
          <Text style={{ color: theme.danger, fontWeight: "600", fontSize: 15 }}>Disconnect account</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

function StepButton({ label, accessibilityLabel, disabled, onPress }: {
  label: string; accessibilityLabel: string; disabled: boolean; onPress: () => void;
}) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled }}
      hitSlop={8}
      style={({ pressed }) => [
        styles.stepButton,
        { borderColor: theme.border, opacity: disabled ? 0.35 : pressed ? 0.7 : 1 },
      ]}
    >
      <Text style={{ color: theme.text, fontSize: 20, fontWeight: "600" }}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  content: { padding: spacing.lg, gap: spacing.md, width: "100%", maxWidth: 640, alignSelf: "center" },
  heading: { fontSize: 28, fontWeight: "700" },
  note: { fontSize: 14, lineHeight: 20, flexShrink: 1 },
  stepperRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.md },
  stepper: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  stepButton: {
    width: 40, height: 40, borderWidth: 1, borderRadius: radius.sm, alignItems: "center", justifyContent: "center",
  },
  stepValue: { fontSize: 18, fontWeight: "700", minWidth: 36, textAlign: "center" },
  syncRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  secondaryButton: {
    borderWidth: 1, borderRadius: radius.sm, paddingVertical: 10, alignItems: "center", minHeight: 44, justifyContent: "center",
  },
  signOut: { paddingVertical: spacing.md, alignSelf: "flex-start" },
});
