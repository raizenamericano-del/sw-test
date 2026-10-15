import { ProtectedLayout } from "@/components/protected-layout";
import { HistoryPage } from "@/components/history-page";

export default function HistoryRoute() {
  return <ProtectedLayout><HistoryPage /></ProtectedLayout>;
}
