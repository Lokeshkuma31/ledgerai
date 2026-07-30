import DashboardLayout from "@/components/DashboardLayout";
import { getConnections } from "@/lib/connections/engine";

export default async function DashboardPage() {
  const connections = getConnections();
  return <DashboardLayout connections={connections} />;
}
