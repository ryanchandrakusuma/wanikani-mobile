import { useState } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { useAuth } from "../../contexts/AuthContext";
import { Panel } from "../../components/Panel";
import type { ForecastHour } from "../../db/queries";
import { useSettings } from "../../settings/SettingsContext";
import { useSync } from "../../contexts/SyncContext";
import { syncLabel } from "../../sync/syncLabel";
import { itemColors, radius, spacing, useTheme } from "../../theme";
import { useTodo } from "../../todo/useTodo";
import { formatCount } from "../../utils/format";
import { formatClock, formatIn } from "../../utils/time";

// Step 3: the to-do list. Everything here is read from the local database.
export default function Home() {
  const theme = useTheme();
  const { user, refreshUser } = useAuth();
  const { phase, progress, lastSyncedAt, error, sync } = useSync();
  const { dailyLessonLimit } = useSettings();
  const { todo, refresh } = useTodo();
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = async () => {
    setRefreshing(true);
    try { await refreshUser(); } catch { /* offline: keep showing cached info */ }
    await sync();
    await refresh().catch(() => {});
    setRefreshing(false);
  };

  const lessons = todo?.lessonsAvailable ?? 0;
  const reviews = todo?.reviewsAvailable ?? 0;
  const doneToday = todo?.lessonsStartedToday ?? 0;
  const nextReview = todo?.nextReviewAt ? new Date(todo.nextReviewAt) : null;

  const lessonNote =
    lessons === 0 ? "No lessons waiting"
    : doneToday >= dailyLessonLimit ? `Daily limit reached (${dailyLessonLimit})`
    : `${doneToday} of ${dailyLessonLimit} done today`;

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]} edges={["top", "left", "right"]}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <View style={styles.header}>
          <View style={{ flexShrink: 1 }}>
            <Text style={[styles.greeting, { color: theme.textMuted }]}>おかえり</Text>
            <Text style={[styles.name, { color: theme.text }]} numberOfLines={1}>{user?.username ?? "…"}</Text>
          </View>
          {user && (
            <Text style={[styles.level, { color: theme.textMuted }]}>{`Level ${user.level}`}</Text>
          )}
        </View>

        {user?.current_vacation_started_at && (
          <View style={[styles.banner, { borderColor: theme.border, backgroundColor: theme.surface }]}>
            <Text style={{ color: theme.text, fontSize: 14 }}>
              Vacation mode is on. Reviews are paused until you turn it off on WaniKani.
            </Text>
          </View>
        )}

        <View style={styles.cards}>
          <TodoCard
            title="Lessons"
            count={lessons}
            note={lessonNote}
            color={itemColors.radical}
            action="Start lessons"
            onPress={() => router.push("/lessons")}
            testID="lessons-card"
          />
          <TodoCard
            title="Reviews"
            count={reviews}
            note={reviews === 0 ? "All caught up" : "Ready now"}
            color={itemColors.kanji}
            action="Start reviews"
            onPress={() => router.push("/reviews")}
            testID="reviews-card"
          />
        </View>

        <Text style={[styles.next, { color: theme.text }]} testID="next-review">
          {nextReview
            ? `Next reviews ${formatIn(nextReview)} · ${formatClock(nextReview)}`
            : todo ? "No reviews scheduled" : ""}
        </Text>

        <Panel title="Next 24 hours">
          {todo && todo.forecast.length > 0
            ? <Forecast hours={todo.forecast} />
            : <Text style={{ color: theme.textMuted, fontSize: 14 }}>No reviews in the next 24 hours.</Text>}
        </Panel>

        <Text
          style={[styles.sync, { color: phase === "error" ? theme.danger : theme.textMuted }]}
          testID="sync-status"
          accessibilityLiveRegion="polite"
        >
          {syncLabel(phase, progress, lastSyncedAt, error)}
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function TodoCard({ title, count, note, color, action, onPress, testID }: {
  title: string; count: number; note: string; color: string; action: string;
  onPress: () => void; testID: string;
}) {
  const theme = useTheme();
  const disabled = count === 0;
  return (
    <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]} testID={testID}>
      <Text style={[styles.cardTitle, { color: theme.textMuted }]}>{title}</Text>
      <Text style={[styles.cardCount, { color: theme.text }]}>{formatCount(count)}</Text>
      <Text style={[styles.cardNote, { color: theme.textMuted }]}>{note}</Text>
      <Pressable
        onPress={onPress}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel={action}
        accessibilityState={{ disabled }}
        style={({ pressed }) => [
          styles.cardButton,
          { backgroundColor: color, opacity: disabled ? 0.35 : pressed ? 0.8 : 1 },
        ]}
      >
        <Text style={styles.cardButtonText}>Start</Text>
      </Pressable>
    </View>
  );
}

function Forecast({ hours }: { hours: ForecastHour[] }) {
  const theme = useTheme();
  const max = Math.max(...hours.map((h) => h.count));
  return (
    <View style={{ gap: spacing.sm }}>
      {hours.map((h) => (
        <View
          key={h.hourStart.getTime()}
          style={styles.forecastRow}
          accessible
          accessibilityLabel={`${formatClock(h.hourStart)}: ${h.count} new, ${h.cumulative} total`}
        >
          <Text style={[styles.forecastTime, { color: theme.textMuted }]}>{formatClock(h.hourStart)}</Text>
          <View style={styles.forecastTrack}>
            <View
              style={[
                styles.forecastBar,
                { width: `${Math.max(4, (h.count / max) * 100)}%`, backgroundColor: itemColors.kanji },
              ]}
            />
          </View>
          <Text style={[styles.forecastCount, { color: theme.text }]}>{`+${h.count}`}</Text>
          <Text style={[styles.forecastTotal, { color: theme.textMuted }]}>{h.cumulative}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  content: { padding: spacing.lg, gap: spacing.md, width: "100%", maxWidth: 640, alignSelf: "center" },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", gap: spacing.md },
  greeting: { fontSize: 16 },
  name: { fontSize: 30, fontWeight: "700" },
  level: { fontSize: 15, fontWeight: "600", paddingBottom: 6 },
  banner: { borderWidth: 1, borderRadius: radius.md, padding: spacing.md },
  cards: { flexDirection: "row", gap: spacing.md },
  card: { flex: 1, borderWidth: 1, borderRadius: radius.md, padding: spacing.md, gap: spacing.xs },
  cardTitle: { fontSize: 15, fontWeight: "600" },
  cardCount: { fontSize: 40, fontWeight: "700" },
  cardNote: { fontSize: 13, minHeight: 34 },
  cardButton: { marginTop: spacing.sm, borderRadius: radius.sm, paddingVertical: 12, alignItems: "center", minHeight: 44 },
  cardButtonText: { color: "#FFFFFF", fontWeight: "700", fontSize: 15 },
  next: { fontSize: 15, fontWeight: "600" },
  forecastRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  forecastTime: { width: 44, fontSize: 13, fontVariant: ["tabular-nums"] },
  forecastTrack: { flex: 1, height: 10 },
  forecastBar: { height: 10, borderRadius: 5 },
  forecastCount: { width: 40, textAlign: "right", fontSize: 13, fontWeight: "600", fontVariant: ["tabular-nums"] },
  forecastTotal: { width: 40, textAlign: "right", fontSize: 13, fontVariant: ["tabular-nums"] },
  sync: { fontSize: 13, textAlign: "center", marginTop: spacing.sm },
});
