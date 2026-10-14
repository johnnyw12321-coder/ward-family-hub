import type { Metadata } from "next";
import { Suspense } from "react";
import { WarehouseIcon } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { ListSkeleton } from "@/components/shared/skeletons";
import { AssetListPage } from "@/features/assets/components/asset-list-page";
import { requireHousehold } from "@/lib/auth/context";

export const metadata: Metadata = { title: "Home & property" };

export default function Page({ searchParams }: PageProps<"/property">) {
  return (
    <Suspense
      fallback={
        <>
          <PageHeader title="Home & property" />
          <ListSkeleton rows={3} />
        </>
      }
    >
      <View searchParams={searchParams} />
    </Suspense>
  );
}

async function View({ searchParams }: { searchParams: PageProps<"/property">["searchParams"] }) {
  const showArchived = (await searchParams).archived === "1";
  const ctx = await requireHousehold();
  return (
    <AssetListPage
      ctx={ctx}
      type="property"
      title="Home & property"
      icon={WarehouseIcon}
      emptyText="Add your home to track its value, mortgage, maintenance, appliances and warranties."
      showArchived={showArchived}
    />
  );
}
