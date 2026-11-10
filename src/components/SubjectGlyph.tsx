import { StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";
import { primaryMeaning, radicalImageUrl, type Subject } from "../subjects/model";
import { radius, subjectColor } from "../theme";

/**
 * The item's characters on its type colour. Radicals without a Unicode
 * character show WaniKani's image instead (cached on disk after the first view).
 */
export function SubjectGlyph({ subject, size = 96 }: { subject: Subject; size?: number }) {
  const image = radicalImageUrl(subject);
  const fontSize = subject.data.characters && subject.data.characters.length > 2 ? size * 0.5 : size * 0.7;
  return (
    <View
      style={[styles.box, { backgroundColor: subjectColor(subject.object), minHeight: size * 1.4, paddingHorizontal: size * 0.3 }]}
      accessible
      accessibilityLabel={`${subject.data.characters ?? primaryMeaning(subject)}`}
      testID="subject-glyph"
    >
      {image ? (
        <Image
          source={{ uri: image }}
          style={{ width: size, height: size }}
          contentFit="contain"
          tintColor="#FFFFFF"
          cachePolicy="disk"
        />
      ) : (
        <Text style={[styles.chars, { fontSize, lineHeight: fontSize * 1.25 }]}>
          {subject.data.characters ?? primaryMeaning(subject)}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { borderRadius: radius.md, alignItems: "center", justifyContent: "center", alignSelf: "stretch" },
  chars: { color: "#FFFFFF", fontWeight: "500", textAlign: "center" },
});
