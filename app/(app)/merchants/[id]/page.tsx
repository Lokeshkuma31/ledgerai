import Link from "next/link";
import MerchantProfile from "@/components/MerchantProfile";

export default async function MerchantDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <div className="flex flex-col gap-6">
      <Link
        href="/merchants"
        className="text-muted-foreground w-fit text-sm hover:underline"
      >
        ← Back to Merchants
      </Link>
      <MerchantProfile merchantId={id} />
    </div>
  );
}
