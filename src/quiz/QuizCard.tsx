import { useState, type ReactNode } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { toKana } from "wanakana";
import { SubjectGlyph } from "../components/SubjectGlyph";
import { SUBJECT_LABEL, type Subject } from "../subjects/model";
import { radius, spacing, useTheme } from "../theme";
import { checkMeaning, checkReading, type CheckResult } from "./answerCheck";
import type { QuestionKind } from "./quizQueue";

interface Props {
  subject: Subject;
  kind: QuestionKind;
  synonyms: string[];
  /** Called after the user has seen the result and pressed Next. */
  onDone: (verdict: "correct" | "incorrect") => void;
  /** Optional details (meanings, readings, mnemonics) behind an "Item info" button after a wrong answer. */
  info?: ReactNode;
}

/** Accepted answers, primary first, for showing after a wrong answer. */
function acceptedAnswers(subject: Subject, kind: QuestionKind): string {
  if (kind === "meaning") {
    return [...subject.data.meanings].sort((a, b) => Number(b.primary) - Number(a.primary))
      .filter((m) => m.accepted_answer).map((m) => m.meaning).join(", ");
  }
  return (subject.data.readings ?? []).filter((r) => r.accepted_answer).map((r) => r.reading).join(", ");
}

/** One quiz question. Give it a new `key` per question so its state resets. */
export function QuizCard({ subject, kind, synonyms, onDone, info }: Props) {
  const theme = useTheme();
  const [input, setInput] = useState("");
  const [result, setResult] = useState<CheckResult | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [showInfo, setShowInfo] = useState(false);

  const isReading = kind === "reading";
  const onChange = (text: string) => setInput(isReading ? toKana(text, { IMEMode: true }) : text);

  const submit = () => {
    if (result) {
      onDone(result.verdict === "correct" ? "correct" : "incorrect");
      return;
    }
    const r = isReading ? checkReading(input, subject) : checkMeaning(input, subject, synonyms);
    if (r.verdict === "retry") {
      setHint(r.message ?? null);
      return;
    }
    setHint(null);
    setResult(r);
  };

  const borderColor = !result ? theme.border : result.verdict === "correct" ? theme.success : theme.danger;
  const promptBg = isReading ? "#2E3140" : theme.highlight;
  const promptFg = isReading ? "#FFFFFF" : theme.text;

  return (
    <View style={styles.card}>
      <SubjectGlyph subject={subject} />
      <View style={[styles.prompt, { backgroundColor: promptBg }]}>
        <Text style={{ color: promptFg, fontWeight: "700", fontSize: 16 }}>
          {`${SUBJECT_LABEL[subject.object]} ${isReading ? "Reading" : "Meaning"}`}
        </Text>
      </View>

      <TextInput
        value={input}
        onChangeText={onChange}
        onSubmitEditing={submit}
        submitBehavior="submit"
        editable={!result}
        autoFocus
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="off"
        placeholder={isReading ? "答え (type in romaji)" : "Your answer"}
        placeholderTextColor={theme.textMuted}
        returnKeyType={result ? "next" : "done"}
        accessibilityLabel={isReading ? "Reading answer" : "Meaning answer"}
        style={[styles.input, { color: theme.text, borderColor, backgroundColor: theme.surface }]}
      />

      {hint && <Text style={[styles.message, { color: theme.textMuted }]} accessibilityLiveRegion="polite">{hint}</Text>}

      {result && (
        <View accessibilityLiveRegion="polite" style={{ gap: spacing.xs }}>
          <Text style={[styles.verdict, { color: result.verdict === "correct" ? theme.success : theme.danger }]}>
            {result.verdict === "correct" ? "Correct" : "Not quite"}
          </Text>
          {result.message && <Text style={[styles.message, { color: theme.textMuted }]}>{result.message}</Text>}
          {result.verdict === "incorrect" && (
            <Text style={[styles.message, { color: theme.text }]}>{`Answer: ${acceptedAnswers(subject, kind)}`}</Text>
          )}
        </View>
      )}

      {info && result?.verdict === "incorrect" && (
        <Pressable
          onPress={() => setShowInfo((v) => !v)}
          accessibilityRole="button"
          accessibilityState={{ expanded: showInfo }}
          style={({ pressed }) => [styles.button, { borderWidth: 1, borderColor: theme.border, opacity: pressed ? 0.8 : 1 }]}
        >
          <Text style={{ color: theme.text, fontWeight: "700", fontSize: 16 }}>{showInfo ? "Hide item info" : "Item info"}</Text>
        </Pressable>
      )}

      <Pressable
        onPress={submit}
        accessibilityRole="button"
        style={({ pressed }) => [styles.button, { backgroundColor: theme.primary, opacity: pressed ? 0.8 : 1 }]}
      >
        <Text style={{ color: theme.onPrimary, fontWeight: "700", fontSize: 16 }}>{result ? "Next" : "Check"}</Text>
      </Pressable>

      {showInfo && info}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.md },
  prompt: { borderRadius: radius.sm, paddingVertical: 10, alignItems: "center" },
  input: {
    borderWidth: 2, borderRadius: radius.sm, paddingHorizontal: spacing.md, paddingVertical: 14,
    fontSize: 20, textAlign: "center",
  },
  verdict: { fontSize: 18, fontWeight: "700", textAlign: "center" },
  message: { fontSize: 15, lineHeight: 21, textAlign: "center" },
  button: { borderRadius: radius.sm, paddingVertical: 14, alignItems: "center", minHeight: 50, justifyContent: "center" },
});
