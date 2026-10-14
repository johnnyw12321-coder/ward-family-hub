import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHeader } from "@/components/shared/page-header";
import { ListSkeleton } from "@/components/shared/skeletons";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CategoryManager } from "@/features/finance/components/category-manager";
import { getCategories } from "@/features/finance/queries";
import { requireHousehold } from "@/lib/auth/context";

export const metadata: Metadata = { title: "Categories" };

export default function CategoriesPage() {
  return (
    <div>
      <PageHeader
        title="Categories"
        description="Archiving hides a category from new entries; past transactions and reports keep it. Renaming updates history."
      />
      <Suspense fallback={<ListSkeleton rows={6} />}>
        <CategoriesView />
      </Suspense>
    </div>
  );
}

async function CategoriesView() {
  const ctx = await requireHousehold();
  const categories = await getCategories(ctx, { includeArchived: true });
  return (
    <Tabs defaultValue="expense">
      <TabsList className="mb-4 w-full">
        <TabsTrigger value="expense" className="flex-1">
          Spending
        </TabsTrigger>
        <TabsTrigger value="income" className="flex-1">
          Income
        </TabsTrigger>
      </TabsList>
      <TabsContent value="expense">
        <CategoryManager categories={categories} kind="expense" canWrite={ctx.canWrite} />
      </TabsContent>
      <TabsContent value="income">
        <CategoryManager categories={categories} kind="income" canWrite={ctx.canWrite} />
      </TabsContent>
    </Tabs>
  );
}
