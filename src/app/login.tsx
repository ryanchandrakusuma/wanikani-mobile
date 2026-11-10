import { useState } from "react";
import {
  ActivityIndicator, KeyboardAvoidingView, Linking, Platform,
  Pressable, StyleSheet, Text, TextInput, View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { useAuth } from "../auth/AuthContext";
import { WKApiError } from "../api/client";
import { itemColors, radius, spacing, useTheme } from "../theme";

const TOKEN_PAGE = "https://www.wanikani.com/settings/personal_access_tokens";

export default function Login() {
  const theme = useTheme();
  const { signIn } = useAuth();
  const [token, setToken] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const onSubmit = async () => {
    if (!token.trim()) {
      setError("Paste your API token first.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await signIn(token);
      router.replace("/home");
    } catch (e) {
      setError(e instanceof WKApiError ? e.message : "Something went wrong. Try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.center}>
        <View style={styles.card}>
          <View style={styles.badges}>
            <Text style={[styles.badge, { backgroundColor: itemColors.radical }]}>部</Text>
            <Text style={[styles.badge, { backgroundColor: itemColors.kanji }]}>字</Text>
            <Text style={[styles.badge, { backgroundColor: itemColors.vocabulary }]}>語</Text>
          </View>

          <Text style={[styles.title, { color: theme.text }]}>Connect your WaniKani account</Text>
          <Text style={[styles.body, { color: theme.textMuted }]}>
            Create a token with permission to start assignments and create reviews,
            then paste it below. It stays on this device.
          </Text>

          <Pressable onPress={() => Linking.openURL(TOKEN_PAGE)} accessibilityRole="link">
            <Text style={[styles.link, { color: itemColors.radical }]}>Open WaniKani token settings</Text>
          </Pressable>

          <TextInput
            value={token}
            onChangeText={setToken}
            placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
            placeholderTextColor={theme.textMuted}
            autoCapitalize="none"
            autoCorrect={false}
            secureTextEntry
            editable={!busy}
            onSubmitEditing={onSubmit}
            style={[styles.input, { color: theme.text, borderColor: error ? theme.danger : theme.border, backgroundColor: theme.surface }]}
            accessibilityLabel="WaniKani API token"
          />

          {error && <Text style={[styles.error, { color: theme.danger }]}>{error}</Text>}

          <Pressable
            onPress={onSubmit}
            disabled={busy}
            style={({ pressed }) => [styles.button, { backgroundColor: theme.primary, opacity: pressed || busy ? 0.8 : 1 }]}
            accessibilityRole="button"
          >
            {busy ? <ActivityIndicator color={theme.onPrimary} /> : <Text style={[styles.buttonText, { color: theme.onPrimary }]}>Connect</Text>}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  center: { flex: 1, justifyContent: "center", padding: spacing.lg },
  card: { width: "100%", maxWidth: 480, alignSelf: "center", gap: spacing.md },
  badges: { flexDirection: "row", gap: spacing.sm, marginBottom: spacing.sm },
  badge: { color: "#fff", fontSize: 22, width: 44, height: 44, lineHeight: 44, textAlign: "center", borderRadius: radius.sm, overflow: "hidden" },
  title: { fontSize: 24, fontWeight: "700" },
  body: { fontSize: 15, lineHeight: 22 },
  link: { fontSize: 15, fontWeight: "600" },
  input: { borderWidth: 1, borderRadius: radius.sm, paddingHorizontal: spacing.md, paddingVertical: 14, fontSize: 16 },
  error: { fontSize: 14 },
  button: { borderRadius: radius.sm, paddingVertical: 14, alignItems: "center", minHeight: 50, justifyContent: "center" },
  buttonText: { fontSize: 16, fontWeight: "700" },
});
