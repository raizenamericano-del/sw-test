import { ProtectedLayout } from "@/components/protected-layout";
import { ConnectPage } from "@/components/connect-page";

export default function ConnectRoute() {
  return <ProtectedLayout><ConnectPage /></ProtectedLayout>;
}
