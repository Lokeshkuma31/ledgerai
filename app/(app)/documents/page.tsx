import DataSourceStatusStrip from "@/components/dataSources/DataSourceStatusStrip";
import DocumentIntelligenceDashboard from "@/components/DocumentIntelligenceDashboard";
import { getConnections } from "@/lib/connections/engine";

export default function DocumentsPage() {
  const connections = getConnections();

  return (
    <div className="flex flex-col gap-8">
      <p className="text-muted-foreground max-w-2xl text-sm">
        Deterministic document classification and structured field
        extraction — mock OCR and rule-based classification only, so a real
        OCR provider can replace the mock layer later without changing
        anything else here.
      </p>
      <DataSourceStatusStrip connections={connections} />
      <DocumentIntelligenceDashboard />
    </div>
  );
}
