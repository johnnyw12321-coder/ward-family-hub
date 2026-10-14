import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ArchiveIcon, ArchiveRestoreIcon, BookmarkIcon, BookmarkXIcon, Trash2Icon } from "lucide-react";
import { ConfirmAction } from "@/components/shared/confirm-action";
import { PageHeader } from "@/components/shared/page-header";
import { ListSkeleton } from "@/components/shared/skeletons";
import { Badge } from "@/components/ui/badge";
import { deleteShoppingList, updateShoppingList } from "@/features/tasks/actions";
import { CopyListButton, ShoppingListView } from "@/features/tasks/components/shopping";
import { getShoppingItems, getShoppingList } from "@/features/tasks/shopping-queries";
import { requireHousehold } from "@/lib/auth/context";
import { formatDate } from "@/lib/dates";

export const metadata: Metadata = { title: "Shopping list" };

export default function ShoppingListPage({ params }: PageProps<"/shopping/[id]">) {
  return (
    <Suspense fallback={<ListSkeleton rows={6} />}>
      <ListDetail params={params} />
    </Suspense>
  );
}

async function ListDetail({ params }: { params: PageProps<"/shopping/[id]">["params"] }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const ctx = await requireHousehold();
  const list = await getShoppingList(ctx, id);
  if (!list) notFound();
  const items = await getShoppingItems(ctx, [id]);

  return (
    <div className="space-y-4">
      <PageHeader
        title={list.name}
        back={{ href: "/shopping", label: "Shopping" }}
        actions={list.is_template ? <Badge variant="secondary">Reusable</Badge> : list.is_archived ? <Badge variant="outline">Archived</Badge> : null}
      />
      <ShoppingListView listId={list.id} items={items} canWrite={ctx.canWrite && !list.is_archived} currency={ctx.household.base_currency} />
      {ctx.canWrite ? (
        <div className="flex flex-wrap gap-2 pt-2">
          {list.is_template ? <CopyListButton listId={list.id} name={`${list.name} · ${formatDate(ctx.today)}`} /> : null}
          <ConfirmAction
            action={updateShoppingList.bind(null, list.id, { isTemplate: !list.is_template })}
            trigger={
              list.is_template ? (
                <>
                  <BookmarkXIcon data-icon="inline-start" /> Not reusable
                </>
              ) : (
                <>
                  <BookmarkIcon data-icon="inline-start" /> Save as reusable
                </>
              )
            }
            title={list.is_template ? "Stop reusing this list?" : "Save as a reusable list?"}
            description={list.is_template ? "It becomes an ordinary list." : "You can start new lists from it with all its items unchecked."}
            confirmLabel="Confirm"
            destructive={false}
          />
          <ConfirmAction
            action={updateShoppingList.bind(null, list.id, { isArchived: !list.is_archived })}
            trigger={
              list.is_archived ? (
                <>
                  <ArchiveRestoreIcon data-icon="inline-start" /> Restore
                </>
              ) : (
                <>
                  <ArchiveIcon data-icon="inline-start" /> Archive
                </>
              )
            }
            title={list.is_archived ? "Restore this list?" : "Archive this list?"}
            description="Archived lists are kept but hidden from the main view."
            confirmLabel={list.is_archived ? "Restore" : "Archive"}
            destructive={false}
          />
          <ConfirmAction
            action={deleteShoppingList.bind(null, list.id)}
            trigger={
              <>
                <Trash2Icon data-icon="inline-start" /> Delete
              </>
            }
            title="Delete this list?"
            description="All its items are deleted."
            confirmLabel="Delete"
            redirectTo="/shopping"
            variant="destructive"
          />
        </div>
      ) : null}
    </div>
  );
}
