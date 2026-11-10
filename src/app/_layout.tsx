import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { AuthProvider } from "../contexts/AuthContext";
import { SettingsProvider } from "../settings/SettingsContext";
import { SyncProvider } from "../sync/SyncContext";
import { useTheme } from "../theme";

export default function RootLayout() {
  const theme = useTheme();
  return (
    <AuthProvider>
      <SyncProvider>
        <SettingsProvider>
          <StatusBar style="auto" />
          <Stack
            screenOptions={{
              headerShown: false,
              contentStyle: { backgroundColor: theme.background },
            }}
          />
        </SettingsProvider>
      </SyncProvider>
    </AuthProvider>
  );
}
