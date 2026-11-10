import { useEffect, useState } from "react";
import {
  ActivityIndicator, Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { randomUUID } from "expo-crypto";
import { getDatabase } from "../db/database";
import { completeLessons } from "../db/lessons";
import { getTodoCounts } from "../db/queries";
import { LessonView } from "../lessons/LessonView";
import { lessonPages } from "../lessons/pages";
import { loadBatch, nextBatchSize, type Batch } from "../lessons/session";
import { QuizCard } from "../quiz/QuizCard";
import {
  answerQuestion, createQuiz, currentQuestion, isFinished, quizProgress, type QuizState,
} from "../quiz/quizQueue";
import { useSettings } from "../settings/SettingsContext";
import { hasReading } from "../subjects/model";
import { useSync } from "../sync/SyncContext";
import { radius, spacing, useTheme } from "../theme";
import { startOfLocalDay } from "../utils/time";

type Phase =
  | { name: "loading" }
  | { name: "empty" }
  | { name: "limit"; available: number }
  | { name: "learn"; batch: Batch; index: number; page: number }
  | { name: "quiz"; batch: Batch; quiz: QuizState; asked: number }
  | { name: "done"; learned: number; available: number; limitReached: boolean }
  | { name: "error"; message: string };

/** Decides what to show next: a new batch, the limit screen, or "nothing left". */
async function nextPhase(dailyLimit: number, ignoreLimit: boolean): Promise<Phase> {
  try {
    const db = await getDatabase();
    const now = new Date();
    const counts = await getTodoCounts(db, now, startOfLocalDay(now));
    if (counts.lessonsAvailable === 0) return { name: "empty" };
    const size = nextBatchSize(dailyLimit, counts.lessonsStartedToday, ignoreLimit);
    if (size === 0) return { name: "limit", available: counts.lessonsAvailable };
    const batch = await loadBatch(db, size);
    return batch.items.length ? { name: "learn", batch, index: 0, page: 0 } : { name: "empty" };
  } catch {
    return { name: "error", message: "Couldn't load your lessons. Try again." };
  }
}

export default function Lessons() {
  const theme = useTheme();
  const { dailyLessonLimit } = useSettings();
  const { sync } = useSync();
  const [phase, setPhase] = useState<Phase>({ name: "loading" });
  const [ignoreLimit, setIgnoreLimit] = useState(false);

  // First batch. Re-evaluated if the saved limit finishes loading before a batch has started.
  useEffect(() => {
    let cancelled = false;
    nextPhase(dailyLessonLimit, false).then((p) => {
      if (cancelled) return;
      setPhase((prev) => (["loading", "limit", "empty"].includes(prev.name) ? p : prev));
    });
    return () => { cancelled = true; };
  }, [dailyLessonLimit]);

  const loadMore = (ignore: boolean) => {
    if (ignore) setIgnoreLimit(true);
    setPhase({ name: "loading" });
    nextPhase(dailyLessonLimit, ignore || ignoreLimit).then(setPhase);
  };

  const finishBatch = async (batch: Batch) => {
    setPhase({ name: "loading" });
    try {
      const db = await getDatabase();
      const learned = await completeLessons(db, batch.items, new Date(), randomUUID);
      void sync(); // send to WaniKani now if online; otherwise on the next sync
      const now = new Date();
      const counts = await getTodoCounts(db, now, startOfLocalDay(now));
      setPhase({
        name: "done",
        learned,
        available: counts.lessonsAvailable,
        limitReached: !ignoreLimit && counts.lessonsStartedToday >= dailyLessonLimit,
      });
    } catch {
      setPhase({ name: "error", message: "Couldn't save this batch. Try it again." });
    }
  };

  const close = () => {
    if (phase.name === "learn" || phase.name === "quiz") {
      Alert.alert(
        "Leave lessons?",
        "This batch isn't finished, so it won't be saved. Batches you already finished are kept.",
        [{ text: "Stay", style: "cancel" }, { text: "Leave", style: "destructive", onPress: () => router.back() }],
      );
    } else {
      router.back();
    }
  };

  let title = "Lessons";
  if (phase.name === "learn") title = `Lesson ${phase.index + 1} of ${phase.batch.items.length}`;
  if (phase.name === "quiz") {
    const p = quizProgress(phase.quiz);
    title = `Quiz ${p.done} / ${p.total}`;
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]}>
      <View style={[styles.header, { borderColor: theme.border }]}>
        <Pressable onPress={close} accessibilityRole="button" accessibilityLabel="Close lessons" hitSlop={12}>
          <Text style={{ color: theme.text, fontSize: 22 }}>✕</Text>
        </Pressable>
        <Text style={[styles.title, { color: theme.text }]} accessibilityRole="header">{title}</Text>
        <View style={{ width: 22 }} />
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        {phase.name === "loading" && <Centered><ActivityIndicator color={theme.primary} /></Centered>}

        {phase.name === "empty" && (
          <Message title="No lessons waiting" body="New lessons unlock as your items reach Guru. Check back later.">
            <Button label="Back to home" onPress={() => router.back()} />
          </Message>
        )}

        {phase.name === "limit" && (
          <Message
            title="Daily limit reached"
            body={`You've done your ${dailyLessonLimit} lessons for today. ${phase.available} more are waiting.`}
          >
            <Button label="Do more anyway" onPress={() => loadMore(true)} />
            <Button label="Back to home" onPress={() => router.back()} secondary />
          </Message>
        )}

        {phase.name === "error" && (
          <Message title="Something went wrong" body={phase.message}>
            <Button label="Try again" onPress={() => loadMore(false)} />
            <Button label="Back to home" onPress={() => router.back()} secondary />
          </Message>
        )}

        {phase.name === "learn" && <Learn phase={phase} setPhase={setPhase} />}

        {phase.name === "quiz" && (() => {
          const q = currentQuestion(phase.quiz)!;
          const item = phase.batch.items.find((i) => i.subject.id === q.itemId)!;
          return (
            <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
              <QuizCard
                key={phase.asked}
                subject={item.subject}
                kind={q.kind}
                synonyms={item.study.meaningSynonyms}
                onDone={(verdict) => {
                  const quiz = answerQuestion(phase.quiz, verdict);
                  if (isFinished(quiz)) void finishBatch(phase.batch);
                  else setPhase({ ...phase, quiz, asked: phase.asked + 1 });
                }}
              />
            </ScrollView>
          );
        })()}

        {phase.name === "done" && (
          <Message
            title={`${phase.learned} new item${phase.learned === 1 ? "" : "s"} learned`}
            body="They're now Apprentice 1. Your first review of them comes in about 4 hours."
          >
            {phase.available > 0 && !phase.limitReached && (
              <Button label="Next lessons" onPress={() => loadMore(false)} />
            )}
            {phase.available > 0 && phase.limitReached && (
              <Button label="Do more anyway" onPress={() => loadMore(true)} />
            )}
            <Button label="Back to home" onPress={() => router.back()} secondary={phase.available > 0} />
          </Message>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Learn({ phase, setPhase }: { phase: Extract<Phase, { name: "learn" }>; setPhase: (p: Phase) => void }) {
  const theme = useTheme();
  const { batch, index, page } = phase;
  const item = batch.items[index];
  const pageCount = lessonPages(item.subject).length;
  const lastItem = index === batch.items.length - 1;
  const lastPage = page === pageCount - 1;
  const atStart = index === 0 && page === 0;

  const next = () => {
    if (!lastPage) setPhase({ ...phase, page: page + 1 });
    else if (!lastItem) setPhase({ ...phase, index: index + 1, page: 0 });
    else {
      const quiz = createQuiz(batch.items.map((i) => ({ id: i.subject.id, hasReading: hasReading(i.subject) })));
      setPhase({ name: "quiz", batch, quiz, asked: 0 });
    }
  };

  const back = () => {
    if (page > 0) setPhase({ ...phase, page: page - 1 });
    else if (index > 0) {
      const prev = batch.items[index - 1];
      setPhase({ ...phase, index: index - 1, page: lessonPages(prev.subject).length - 1 });
    }
  };

  return (
    <View style={{ flex: 1 }}>
      <View style={{ flex: 1 }}>
        <LessonView
          key={item.assignmentId}
          item={item}
          components={batch.components[item.subject.id] ?? []}
          page={page}
          onPageChange={(p) => setPhase({ ...phase, page: p })}
        />
      </View>
      <View style={[styles.footer, { borderColor: theme.border, backgroundColor: theme.surface }]}>
        <Button label="Back" onPress={back} disabled={atStart} secondary flex />
        <Button label={lastItem && lastPage ? "Start quiz" : "Next"} onPress={next} flex />
      </View>
    </View>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return <View style={styles.centered}>{children}</View>;
}

function Message({ title, body, children }: { title: string; body: string; children: React.ReactNode }) {
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

function Button({ label, onPress, secondary, disabled, flex }: {
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
  safe: { flex: 1 },
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderBottomWidth: 1,
  },
  title: { fontSize: 17, fontWeight: "700" },
  content: { padding: spacing.lg, width: "100%", maxWidth: 640, alignSelf: "center" },
  footer: {
    flexDirection: "row", gap: spacing.md, padding: spacing.md, borderTopWidth: 1,
    width: "100%", maxWidth: 640, alignSelf: "center",
  },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.lg },
  message: { width: "100%", maxWidth: 480, gap: spacing.md, alignItems: "center" },
  messageTitle: { fontSize: 22, fontWeight: "700", textAlign: "center" },
  messageBody: { fontSize: 15, lineHeight: 22, textAlign: "center" },
  button: { borderRadius: radius.sm, paddingVertical: 14, alignItems: "center", minHeight: 50, justifyContent: "center" },
});
