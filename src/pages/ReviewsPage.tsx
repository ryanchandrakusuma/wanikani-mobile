import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  ActivityIndicator, Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { randomUUID } from "expo-crypto";
import { Button, Centered, Message, SessionHeader } from "../components/SessionParts";
import { SubjectGlyph } from "../components/SubjectGlyph";
import { useSync } from "../contexts/SyncContext";
import { getDatabase } from "../db/database";
import { completeReview, getReviewQueue, type ReviewItem } from "../db/reviews";
import { QuizCard } from "../quiz/QuizCard";
import { ItemInfo } from "../reviews/ItemInfo";
import {
  answerReview, createReviewSession, isSessionOver, reviewProgress, wrapUp, type FinishedReview, type ReviewSession,
} from "../reviews/reviewSession";
import { hasReading, primaryMeaning } from "../subjects/model";
import { spacing, useTheme } from "../theme";

type Phase =
  | { name: "loading" }
  | { name: "empty" }
  | { name: "review"; items: Map<number, ReviewItem>; session: ReviewSession; asked: number }
  | { name: "done"; items: Map<number, ReviewItem>; finished: FinishedReview[]; moreWaiting: number }
  | { name: "error"; message: string };

async function startSession(): Promise<Phase> {
  try {
    const queue = await getReviewQueue(await getDatabase(), new Date());
    if (queue.length === 0) return { name: "empty" };
    const items = new Map(queue.map((i) => [i.subject.id, i]));
    const session = createReviewSession(queue.map((i) => ({ id: i.subject.id, hasReading: hasReading(i.subject) })));
    return { name: "review", items, session, asked: 0 };
  } catch {
    return { name: "error", message: "Couldn't load your reviews. Try again." };
  }
}

const percent = (correct: number, done: number) => (done === 0 ? "–" : `${Math.round((correct / done) * 100)}%`);

export default function Reviews() {
  const theme = useTheme();
  const { sync } = useSync();
  const [phase, setPhase] = useState<Phase>({ name: "loading" });
  /** Saves run one after another (SQLite allows one transaction at a time). */
  const saving = useRef<Promise<void>>(Promise.resolve());
  const savedAny = useRef(false);
  const saveFailed = useRef(false);

  useEffect(() => {
    let cancelled = false;
    startSession().then((p) => { if (!cancelled) setPhase(p); });
    return () => { cancelled = true; };
  }, []);

  const save = (item: ReviewItem, result: FinishedReview) => {
    const answeredAt = new Date();
    saving.current = saving.current.then(async () => {
      try {
        if (await completeReview(await getDatabase(), item, result, answeredAt, randomUUID)) savedAny.current = true;
      } catch {
        saveFailed.current = true;
      }
    });
  };

  /** Waits for pending saves, then sends results to WaniKani (now if online, otherwise later). */
  const flush = async () => {
    await saving.current;
    if (savedAny.current) void sync();
    savedAny.current = false;
  };

  const finish = async (p: Extract<Phase, { name: "review" }>, session: ReviewSession) => {
    setPhase({ name: "loading" });
    await flush();
    if (saveFailed.current) {
      setPhase({ name: "error", message: "Some answers couldn't be saved on this device. Those items will come back." });
      return;
    }
    setPhase({
      name: "done",
      items: p.items,
      finished: session.finished,
      moreWaiting: session.wrappingUp ? session.backlog.length : 0,
    });
  };

  const onAnswer = (p: Extract<Phase, { name: "review" }>, verdict: "correct" | "incorrect") => {
    const { state, finished } = answerReview(p.session, verdict);
    if (finished) save(p.items.get(finished.id)!, finished);
    if (isSessionOver(state)) void finish(p, state);
    else setPhase({ ...p, session: state, asked: p.asked + 1 });
  };

  const leave = async () => {
    await flush();
    router.back();
  };

  const close = () => {
    if (phase.name !== "review") {
      void leave();
      return;
    }
    Alert.alert(
      "Leave reviews?",
      "Finished items are saved. Items you've only partly answered will come back next time.",
      [{ text: "Stay", style: "cancel" }, { text: "Leave", style: "destructive", onPress: () => void leave() }],
    );
  };

  const restart = () => {
    setPhase({ name: "loading" });
    saveFailed.current = false;
    startSession().then(setPhase);
  };

  let title = "Reviews";
  let right: ReactNode = null;
  if (phase.name === "review") {
    const p = reviewProgress(phase.session);
    title = `${p.done} done · ${p.left} left`;
    right = (
      <Text style={{ color: theme.textMuted, fontWeight: "600" }} accessibilityLabel={`${percent(p.correct, p.done)} correct`}>
        {percent(p.correct, p.done)}
      </Text>
    );
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]}>
      <SessionHeader title={title} closeLabel="Close reviews" onClose={close} right={right} />

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        {phase.name === "loading" && <Centered><ActivityIndicator color={theme.primary} /></Centered>}

        {phase.name === "empty" && (
          <Message title="No reviews waiting" body="You're all caught up. New reviews arrive at the start of each hour.">
            <Button label="Back to home" onPress={() => router.back()} />
          </Message>
        )}

        {phase.name === "error" && (
          <Message title="Something went wrong" body={phase.message}>
            <Button label="Try again" onPress={restart} />
            <Button label="Back to home" onPress={() => router.back()} secondary />
          </Message>
        )}

        {phase.name === "review" && (() => {
          const q = phase.session.current!;
          const item = phase.items.get(q.itemId)!;
          return (
            <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
              <QuizCard
                key={phase.asked}
                subject={item.subject}
                kind={q.kind}
                synonyms={item.study.meaningSynonyms}
                onDone={(verdict) => onAnswer(phase, verdict)}
                info={<ItemInfo item={item} />}
              />
              {phase.session.wrappingUp ? (
                <Text style={[styles.note, { color: theme.textMuted }]}>
                  {`Wrapping up: finishing the ${phase.session.active.length} item${phase.session.active.length === 1 ? "" : "s"} you started.`}
                </Text>
              ) : (
                <Button label="Wrap up" onPress={() => setPhase({ ...phase, session: wrapUp(phase.session) })} secondary />
              )}
            </ScrollView>
          );
        })()}

        {phase.name === "done" && <Summary phase={phase} onMore={restart} />}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Summary({ phase, onMore }: { phase: Extract<Phase, { name: "done" }>; onMore: () => void }) {
  const theme = useTheme();
  const wrong = phase.finished.filter((f) => f.meaningIncorrect + f.readingIncorrect > 0);
  const right = phase.finished.filter((f) => f.meaningIncorrect + f.readingIncorrect === 0);
  const count = phase.finished.length;

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Text style={[styles.summaryTitle, { color: theme.text }]} accessibilityRole="header">
        {`${count} item${count === 1 ? "" : "s"} reviewed`}
      </Text>
      <Text style={[styles.note, { color: theme.textMuted }]}>{`${percent(right.length, count)} correct`}</Text>

      <ItemList title={`Answered wrong (${wrong.length})`} ids={wrong.map((f) => f.id)} items={phase.items} />
      <ItemList title={`Correct (${right.length})`} ids={right.map((f) => f.id)} items={phase.items} />

      {phase.moreWaiting > 0 && (
        <Button label={`Keep reviewing (${phase.moreWaiting} waiting)`} onPress={onMore} />
      )}
      <Button label="Back to home" onPress={() => router.back()} secondary={phase.moreWaiting > 0} />
    </ScrollView>
  );
}

function ItemList({ title, ids, items }: { title: string; ids: number[]; items: Map<number, ReviewItem> }) {
  const theme = useTheme();
  if (ids.length === 0) return null;
  return (
    <View style={{ gap: spacing.sm }}>
      <Text style={[styles.listTitle, { color: theme.textMuted }]}>{title}</Text>
      <View style={styles.grid}>
        {ids.map((id) => {
          const s = items.get(id)!.subject;
          return (
            <View key={id} style={styles.cell}>
              <SubjectGlyph subject={s} size={28} />
              <Text style={{ color: theme.text, fontSize: 12, textAlign: "center" }} numberOfLines={1}>
                {primaryMeaning(s)}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  content: { padding: spacing.lg, gap: spacing.md, width: "100%", maxWidth: 640, alignSelf: "center" },
  note: { fontSize: 15, textAlign: "center" },
  summaryTitle: { fontSize: 22, fontWeight: "700", textAlign: "center" },
  listTitle: { fontSize: 13, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  cell: { width: 76, gap: 2 },
});
