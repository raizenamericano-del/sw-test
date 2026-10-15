import { ProtectedLayout } from "@/components/protected-layout";
import { LibraryPage } from "@/components/library-page";

export default function LibraryRoute() {
  return <ProtectedLayout><LibraryPage /></ProtectedLayout>;
}
