import type { Metadata } from "next";
import { Suspense } from "react";
import { CarIcon } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { ListSkeleton } from "@/components/shared/skeletons";
import { AssetListPage } from "@/features/assets/components/asset-list-page";
import { requireHousehold } from "@/lib/auth/context";

export const metadata: Metadata = { title: "Vehicles" };

export default function Page({ searchParams }: PageProps<"/vehicles">) {
  return (
    <Suspense
      fallback={
        <>
          <PageHeader title="Vehicles" />
          <ListSkeleton rows={3} />
        </>
      }
    >
      <View searchParams={searchParams} />
    </Suspense>
  );
}

async function View({ searchParams }: { searchParams: PageProps<"/vehicles">["searchParams"] }) {
  const showArchived = (await searchParams).archived === "1";
  const ctx = await requireHousehold();
  return (
    <AssetListPage
      ctx={ctx}
      type="vehicle"
      title="Vehicles"
      icon={CarIcon}
      emptyText="Add each vehicle to track servicing, insurance and registration renewals, mileage and running costs."
      showArchived={showArchived}
    />
  );
}
