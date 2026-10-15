import { ProtectedLayout } from "@/components/protected-layout";
import { StatusesPage } from "@/components/statuses-page";

export default function StatusesRoute() {
  return <ProtectedLayout><StatusesPage /></ProtectedLayout>;
}
