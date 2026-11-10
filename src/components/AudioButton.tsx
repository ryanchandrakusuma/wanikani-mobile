import { Pressable, Text } from "react-native";
import { useAudioPlayer } from "expo-audio";
import { radius, spacing, useTheme } from "../theme";

/** Plays a pronunciation from its URL (needs internet). Renders nothing without a URL. */
export function AudioButton({ url, label = "Play pronunciation" }: { url: string | null; label?: string }) {
  if (!url) return null;
  return <Player url={url} label={label} />;
}

function Player({ url, label }: { url: string; label: string }) {
  const theme = useTheme();
  const player = useAudioPlayer(url);

  const onPress = () => {
    player.seekTo(0).catch(() => {});
    player.play();
  };

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={8}
      style={({ pressed }) => ({
        borderWidth: 1, borderColor: theme.border, borderRadius: radius.sm,
        paddingHorizontal: spacing.md, paddingVertical: spacing.sm, opacity: pressed ? 0.7 : 1, alignSelf: "flex-start",
      })}
    >
      <Text style={{ color: theme.text, fontWeight: "600" }}>🔊 Play</Text>
    </Pressable>
  );
}
