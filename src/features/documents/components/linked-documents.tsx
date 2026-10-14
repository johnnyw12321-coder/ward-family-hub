import Link from "next/link";
import { PaperclipIcon } from "lucide-react";
import { SectionHeading } from "@/components/shared/page-header";
import type { HouseholdContext } from "@/lib/auth/context";
import { getDocumentCategories, getDocuments } from "../queries";
import { DocumentItem } from "./document-list";

/** Documents attached to a transaction, bill, account or goal, with an "attach" link. */
export async function LinkedDocuments({
  ctx,
  filter,
  title,
  attachHref,
  attachLabel,
}: {
  ctx: HouseholdContext;
  filter: { transactionId?: string; recurringId?: string; accountId?: string; goalId?: string; assetId?: string; familyMemberId?: string };
  title: string;
  attachHref: string;
  attachLabel: string;
}) {
  const [docs, categories] = await Promise.all([getDocuments(ctx, filter), getDocumentCategories(ctx)]);
  const byId = new Map(categories.map((c) => [c.id, c]));
  return (
    <section>
      <SectionHeading
        title={title}
        action={
          ctx.canWrite ? (
            <Link href={attachHref} className="flex items-center gap-1 text-sm font-medium text-primary">
              <PaperclipIcon className="size-3.5" aria-hidden /> {attachLabel}
            </Link>
          ) : undefined
        }
      />
      {docs.length ? (
        <ul className="divide-y rounded-2xl bg-card shadow-card ring-1 ring-border/80">
          {docs.map((d) => (
            <DocumentItem key={d.id} doc={d} category={byId.get(d.category_id)} today={ctx.today} />
          ))}
        </ul>
      ) : (
        <p className="rounded-2xl bg-card p-4 text-sm text-muted-foreground shadow-card ring-1 ring-border/80">Nothing attached.</p>
      )}
    </section>
  );
}
