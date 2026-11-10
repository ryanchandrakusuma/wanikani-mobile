import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { AuthProvider } from "../auth/AuthContext";
import { useTheme } from "../theme";

export default function RootLayout() {
  const theme = useTheme();
  return (
    <AuthProvider>
      <StatusBar style="auto" />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: theme.background },
        }}
      />
    </AuthProvider>
  );
}
