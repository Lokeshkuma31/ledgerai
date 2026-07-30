import DashboardProvider from "@/components/DashboardProvider";
import { AppShell } from "@/components/app-shell/AppShell";

export default function AppGroupLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <DashboardProvider>
      <AppShell>{children}</AppShell>
    </DashboardProvider>
  );
}
