import DashboardLayout from "@/components/DashboardLayout";
import { getConnections } from "@/lib/connections/engine";
import { getCurrentUserId } from "@/lib/auth/session";

export default async function DashboardPage() {
  const userId = await getCurrentUserId();
  const connections = userId ? await getConnections(userId) : [];
  return <DashboardLayout connections={connections} />;
}
