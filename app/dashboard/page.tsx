import { ProtectedLayout } from "@/components/protected-layout";
import { DashboardPage } from "@/components/dashboard";

export default function DashboardRoute() {
  return <ProtectedLayout><DashboardPage /></ProtectedLayout>;
}
