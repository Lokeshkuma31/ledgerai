import Link from "next/link";
import DocumentIntelligenceDashboard from "@/components/DocumentIntelligenceDashboard";

export default function DocumentsPage() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-2xl flex-col gap-8 px-6 py-16">
      <div className="flex flex-col gap-1">
        <Link href="/dashboard" className="text-muted-foreground w-fit text-sm hover:underline">
          ← Back to Dashboard
        </Link>
        <h1 className="text-3xl font-semibold tracking-tight">Documents</h1>
        <p className="text-muted-foreground text-sm">
          Deterministic document classification and structured field extraction — mock OCR and rule-based
          classification only, so a real OCR provider can replace the mock layer later without changing anything
          else here.
        </p>
      </div>
      <DocumentIntelligenceDashboard />
    </main>
  );
}
