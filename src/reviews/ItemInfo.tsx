import { StyleSheet, Text, View } from "react-native";
import type { LessonItem } from "../db/lessons";
import { PageContent } from "../lessons/LessonView";
import { lessonPages } from "../lessons/lessonTabs";
import { primaryMeaning, SUBJECT_LABEL } from "../subjects/model";
import { spacing, subjectColor, useTheme } from "../theme";

/** Meanings, readings and mnemonics of an item, shown after a wrong review answer. */
export function ItemInfo({ item }: { item: LessonItem }) {
  const theme = useTheme();
  const { subject } = item;
  const pages = lessonPages(subject).filter((p) => p === "meaning" || p === "reading");

  return (
    <View style={styles.box} testID="item-info">
      <Text style={[styles.meaning, { color: theme.text }]}>{primaryMeaning(subject)}</Text>
      <Text style={[styles.type, { color: subjectColor(subject.object) }]}>
        {`${SUBJECT_LABEL[subject.object]} · Level ${subject.data.level}`}
      </Text>
      {pages.map((p) => (
        <View key={p} style={styles.box}>
          <PageContent page={p} item={item} components={[]} />
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { gap: spacing.md },
  meaning: { fontSize: 22, fontWeight: "700", textAlign: "center" },
  type: { fontSize: 14, fontWeight: "600", textAlign: "center", marginTop: -spacing.sm },
});
