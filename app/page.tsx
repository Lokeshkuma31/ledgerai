import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 px-6 text-center">
      <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
        LedgerAI
      </h1>
      <p className="text-muted-foreground max-w-md text-lg">
        Your personal AI financial copilot.
      </p>
      <Button
        size="lg"
        nativeButton={false}
        render={<Link href="/dashboard" />}
      >
        Get Started
      </Button>
    </main>
  );
}
