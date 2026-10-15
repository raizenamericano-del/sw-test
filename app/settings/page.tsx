import { ProtectedLayout } from "@/components/protected-layout";
import { SettingsPage } from "@/components/settings-page";

export default function SettingsRoute() {
  return <ProtectedLayout><SettingsPage /></ProtectedLayout>;
}
