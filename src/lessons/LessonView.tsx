import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { AudioButton } from "../components/AudioButton";
import { Mnemonic } from "../components/Mnemonic";
import { SubjectGlyph } from "../components/SubjectGlyph";
import type { LessonItem } from "../db/lessons";
import {
  primaryMeaning, pronunciationUrl, SUBJECT_LABEL, type Reading, type Subject,
} from "../subjects/model";
import { radius, spacing, subjectColor, useTheme } from "../theme";
import { lessonPages, pageLabel, type LessonPage } from "./lessonTabs";

interface Props {
  item: LessonItem;
  /** Radicals of a kanji / kanji of a vocabulary word, already loaded. */
  components: Subject[];
  page: number;
  onPageChange: (page: number) => void;
}

export function LessonView({ item, components, page, onPageChange }: Props) {
  const theme = useTheme();
  const { subject } = item;
  const pages = lessonPages(subject);
  const current = pages[Math.min(page, pages.length - 1)];

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <SubjectGlyph subject={subject} />
      <Text style={[styles.meaning, { color: theme.text }]}>{primaryMeaning(subject)}</Text>
      <Text style={[styles.type, { color: subjectColor(subject.object) }]}>
        {`${SUBJECT_LABEL[subject.object]} · Level ${subject.data.level}`}
      </Text>

      {pages.length > 1 && (
        <View style={[styles.tabs, { borderColor: theme.border }]} accessibilityRole="tablist">
          {pages.map((p, i) => {
            const selected = p === current;
            return (
              <Pressable
                key={p}
                onPress={() => onPageChange(i)}
                accessibilityRole="tab"
                accessibilityState={{ selected }}
                style={[styles.tab, selected && { backgroundColor: theme.highlight }]}
              >
                <Text style={{ color: selected ? theme.text : theme.textMuted, fontWeight: selected ? "700" : "500" }}>
                  {pageLabel(p, subject)}
                </Text>
              </Pressable>
            );
          })}
        </View>
      )}

      <PageContent page={current} item={item} components={components} />
    </ScrollView>
  );
}

function PageContent({ page, item, components }: { page: LessonPage; item: LessonItem; components: Subject[] }) {
  const theme = useTheme();
  const { subject, study } = item;
  const d = subject.data;
  switch (page) {
    case "composition":
      return (
        <Section title={subject.object === "kanji" ? "Made of these radicals" : "Made of these kanji"}>
          {components.map((c) => (
            <View key={c.id} style={styles.componentRow}>
              <View style={{ width: 56 }}><SubjectGlyph subject={c} size={28} /></View>
              <Text style={[styles.componentMeaning, { color: theme.text }]}>{primaryMeaning(c)}</Text>
            </View>
          ))}
        </Section>
      );

    case "meaning": {
      const others = d.meanings.filter((m) => !m.primary && m.accepted_answer).map((m) => m.meaning);
      return (
        <>
          {others.length > 0 && <Line label="Also accepted" value={others.join(", ")} />}
          {study.meaningSynonyms.length > 0 && <Line label="Your synonyms" value={study.meaningSynonyms.join(", ")} />}
          {d.parts_of_speech && d.parts_of_speech.length > 0 && (
            <Line label="Word type" value={d.parts_of_speech.join(", ")} />
          )}
          <Section title="Mnemonic"><Mnemonic text={d.meaning_mnemonic} /></Section>
          {d.meaning_hint ? <Section title="Hint"><Mnemonic text={d.meaning_hint} /></Section> : null}
          {study.meaningNote ? <Section title="Your note"><Mnemonic text={study.meaningNote} /></Section> : null}
        </>
      );
    }

    case "reading":
      return (
        <>
          {subject.object === "kanji"
            ? <KanjiReadings readings={d.readings ?? []} />
            : <Line label="Reading" value={(d.readings ?? []).filter((r) => r.accepted_answer).map((r) => r.reading).join(", ")} big />}
          <AudioButton url={pronunciationUrl(subject)} />
          <Section title="Mnemonic"><Mnemonic text={d.reading_mnemonic} /></Section>
          {d.reading_hint ? <Section title="Hint"><Mnemonic text={d.reading_hint} /></Section> : null}
          {study.readingNote ? <Section title="Your note"><Mnemonic text={study.readingNote} /></Section> : null}
        </>
      );

    case "context":
      return (
        <Section title="Example sentences">
          {(d.context_sentences ?? []).length === 0 && <MutedText text="No example sentences for this word." />}
          {(d.context_sentences ?? []).map((s, i) => (
            <View key={i} style={{ gap: 2 }}>
              <BodyText text={s.ja} large />
              <MutedText text={s.en} />
            </View>
          ))}
          {subject.object === "kana_vocabulary" && <AudioButton url={pronunciationUrl(subject)} />}
        </Section>
      );
  }
}

const READING_TYPES = [
  ["onyomi", "On'yomi"],
  ["kunyomi", "Kun'yomi"],
  ["nanori", "Nanori"],
] as const;

function KanjiReadings({ readings }: { readings: Reading[] }) {
  return (
    <View style={{ gap: spacing.sm }}>
      {READING_TYPES.map(([type, label]) => {
        const list = readings.filter((r) => r.type === type);
        if (list.length === 0) return null;
        const taught = list.some((r) => r.accepted_answer);
        return (
          <Line
            key={type}
            label={taught ? `${label} (learn this one)` : label}
            value={list.map((r) => r.reading).join(", ")}
            big={taught}
          />
        );
      })}
    </View>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const theme = useTheme();
  return (
    <View style={[styles.section, { borderColor: theme.border, backgroundColor: theme.surface }]}>
      <Text style={[styles.sectionTitle, { color: theme.textMuted }]}>{title}</Text>
      {children}
    </View>
  );
}

function Line({ label, value, big }: { label: string; value: string; big?: boolean }) {
  const theme = useTheme();
  return (
    <View style={{ gap: 2 }}>
      <Text style={{ color: theme.textMuted, fontSize: 13 }}>{label}</Text>
      <Text style={{ color: theme.text, fontSize: big ? 22 : 16, fontWeight: big ? "700" : "500" }}>{value}</Text>
    </View>
  );
}

function BodyText({ text, large }: { text: string; large?: boolean }) {
  const theme = useTheme();
  return <Text style={{ color: theme.text, fontSize: large ? 18 : 16, lineHeight: large ? 26 : 22 }}>{text}</Text>;
}

function MutedText({ text }: { text: string }) {
  const theme = useTheme();
  return <Text style={{ color: theme.textMuted, fontSize: 14, lineHeight: 20 }}>{text}</Text>;
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg, gap: spacing.md, width: "100%", maxWidth: 640, alignSelf: "center" },
  meaning: { fontSize: 26, fontWeight: "700", textAlign: "center" },
  type: { fontSize: 14, fontWeight: "600", textAlign: "center", marginTop: -spacing.sm },
  tabs: { flexDirection: "row", borderWidth: 1, borderRadius: radius.sm, overflow: "hidden" },
  tab: { flex: 1, paddingVertical: 10, alignItems: "center", minHeight: 44, justifyContent: "center" },
  section: { borderWidth: 1, borderRadius: radius.md, padding: spacing.md, gap: spacing.sm },
  sectionTitle: { fontSize: 13, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5 },
  componentRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  componentMeaning: { fontSize: 16, fontWeight: "600", flexShrink: 1 },
});
