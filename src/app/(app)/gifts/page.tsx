import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { CakeIcon, ChevronRightIcon } from "lucide-react";
import { cn } from "cn";
import { memberColorClass } from "@/components/shared/member-color";
import { PageHeader } from "@/components/shared/page-header";
import { ListSkeleton } from "@/components/shared/skeletons";
import { AddWishButton } from "@/features/gifts/components/wish-controls";
import { birthdayText } from "@/features/gifts/format";
import { getWishes, getWishLists } from "@/features/gifts/queries";
import { requireHousehold } from "@/lib/auth/context";

export const metadata: Metadata = { title: "Gift ideas" };

const DESCRIPTION = "Add things you'd like. When a birthday comes round, pick from each other's lists — picks stay secret.";

export default function GiftsPage() {
  return (
    <Suspense
      fallback={
        <>
          <PageHeader title="Gift ideas" description={DESCRIPTION} />
          <ListSkeleton rows={3} />
        </>
      }
    >
      <GiftsView />
    </Suspense>
  );
}

async function GiftsView() {
  const ctx = await requireHousehold();
  const [lists, { items, claims }] = await Promise.all([getWishLists(ctx), getWishes(ctx)]);
  const mine = lists.find((l) => l.isMine);
  return (
    <div>
      <PageHeader
        title="Gift ideas"
        description={DESCRIPTION}
        actions={ctx.canWrite && mine ? <AddWishButton list={mine.key} mode="own" label="Add" /> : null}
      />
      <ul className="space-y-3">
        {lists.map((list) => {
          const open = items.filter(
            (i) =>
              !i.removed_at &&
              !i.received_on &&
              (list.ownerUserId ? i.owner_user_id === list.ownerUserId : i.family_member_id === list.familyMemberId),
          );
          const openIds = new Set(open.map((i) => i.id));
          const myPicks = claims.filter((c) => openIds.has(c.item_id) && c.created_by === ctx.userId && c.status !== "given").length;
          const picked = new Set(claims.filter((c) => openIds.has(c.item_id)).map((c) => c.item_id)).size;
          const soon = list.birthday && list.birthday.days <= 30;
          return (
            <li key={list.key}>
              <Link
                href={`/gifts/${list.key}`}
                className="flex items-center gap-4 rounded-2xl bg-card p-4 shadow-card ring-1 ring-border/80 transition-colors hover:bg-muted/50"
              >
                <span className={cn("flex size-11 shrink-0 items-center justify-center rounded-full font-semibold", memberColorClass(list.color))} aria-hidden>
                  {list.name.slice(0, 1).toUpperCase()}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold">{list.isMine ? "Your list" : `${list.name}'s list`}</span>
                  <span className="block text-sm text-muted-foreground">
                    {list.isMine
                      ? open.length === 1
                        ? "1 thing you'd like"
                        : `${open.length} things you'd like`
                      : `${open.length} ${open.length === 1 ? "idea" : "ideas"}${
                          list.ownerUserId ? (myPicks ? ` · you're getting ${myPicks}` : "") : picked ? ` · ${picked} picked` : ""
                        }`}
                  </span>
                  {birthdayText(list) ? (
                    <span className={cn("mt-0.5 flex items-center gap-1 text-xs", soon ? "font-medium text-warning" : "text-muted-foreground")}>
                      <CakeIcon className="size-3.5" aria-hidden /> {birthdayText(list)}
                    </span>
                  ) : null}
                </span>
                <ChevronRightIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              </Link>
            </li>
          );
        })}
      </ul>
      <p className="mt-4 px-1 text-xs text-muted-foreground">
        Birthdays come from{" "}
        <Link href="/family" className="font-medium text-primary">
          Family
        </Link>{" "}
        profiles. Add a date of birth there to see the countdown here.
      </p>
    </div>
  );
}
