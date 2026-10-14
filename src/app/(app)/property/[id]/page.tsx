import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { CardSkeleton } from "@/components/shared/skeletons";
import { AssetDetail } from "@/features/assets/components/asset-detail";
import { getAsset } from "@/features/assets/queries";
import { requireHousehold } from "@/lib/auth/context";

export const metadata: Metadata = { title: "Home & property" };

export default function Page({ params }: PageProps<"/property/[id]">) {
  return (
    <Suspense fallback={<CardSkeleton lines={6} />}>
      <Detail params={params} />
    </Suspense>
  );
}

async function Detail({ params }: { params: PageProps<"/property/[id]">["params"] }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const ctx = await requireHousehold();
  const asset = await getAsset(ctx, id);
  if (!asset || asset.type !== "property") notFound();
  return <AssetDetail ctx={ctx} asset={asset} />;
}
