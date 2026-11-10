import { ActivityIndicator, View } from "react-native";
import { Redirect } from "expo-router";
import { useAuth } from "../contexts/AuthContext";
import { useTheme } from "../theme";

// Entry point: decides where to send the user based on saved token.
export default function Index() {
  const { status } = useAuth();
  const theme = useTheme();

  if (status === "loading") {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: theme.background }}>
        <ActivityIndicator color={theme.primary} />
      </View>
    );
  }
  return <Redirect href={status === "signedIn" ? "/home" : "/login"} />;
}
