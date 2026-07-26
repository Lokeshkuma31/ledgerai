import Link from "next/link";
import MerchantProfile from "@/components/MerchantProfile";

export default async function MerchantDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-2xl flex-col gap-8 px-6 py-16">
      <Link
        href="/merchants"
        className="text-muted-foreground w-fit text-sm hover:underline"
      >
        ← Back to Merchants
      </Link>
      <MerchantProfile merchantId={id} />
    </main>
  );
}
