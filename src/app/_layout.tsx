import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { AuthProvider } from "../auth/AuthContext";
import { SyncProvider } from "../sync/SyncContext";
import { useTheme } from "../theme";

export default function RootLayout() {
  const theme = useTheme();
  return (
    <AuthProvider>
      <SyncProvider>
        <StatusBar style="auto" />
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: theme.background },
          }}
        />
      </SyncProvider>
    </AuthProvider>
  );
}
