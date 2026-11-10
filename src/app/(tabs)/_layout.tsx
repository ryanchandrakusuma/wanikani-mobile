import { Redirect } from "expo-router";
import { NativeTabs } from "expo-router/native-tabs";
import { useAuth } from "../../auth/AuthContext";
import { useTheme } from "../../theme";

// Bottom tabs. Material icons on Android, SF Symbols on iPad/iPhone.
// Signed-out users are sent to the login screen from here, for every tab.
export default function TabsLayout() {
  const theme = useTheme();
  const { status } = useAuth();

  if (status === "signedOut") return <Redirect href="/login" />;

  return (
    <NativeTabs
      backgroundColor={theme.surface}
      tintColor={theme.primary}
      iconColor={{ default: theme.textMuted, selected: theme.primary }}
      labelStyle={{ default: { color: theme.textMuted }, selected: { color: theme.primary } }}
    >
      <NativeTabs.Trigger name="home">
        <NativeTabs.Trigger.Label>Home</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: "house", selected: "house.fill" }} md="home" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="dashboard">
        <NativeTabs.Trigger.Label>Dashboard</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: "chart.bar", selected: "chart.bar.fill" }} md="bar_chart" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="settings">
        <NativeTabs.Trigger.Label>Settings</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: "gearshape", selected: "gearshape.fill" }} md="settings" />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
