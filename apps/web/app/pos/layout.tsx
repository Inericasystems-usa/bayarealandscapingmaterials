import type { Metadata } from "next";
import { StaffScreenGuard } from "@/components/StaffScreenGuard";
import { AuthProvider } from "./auth";
import { PosChrome } from "./PosChrome";

export const metadata: Metadata = {
  title: "Inerica POS",
  robots: { index: false, follow: false },
};

export default function PosLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <StaffScreenGuard />
      <PosChrome>{children}</PosChrome>
    </AuthProvider>
  );
}
