import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { CakeIcon, GiftIcon } from "lucide-react";
import { cn } from "cn";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader, SectionHeading } from "@/components/shared/page-header";
import { CardSkeleton } from "@/components/shared/skeletons";
import { ItemCard } from "@/features/gifts/components/item-card";
import { AddWishButton } from "@/features/gifts/components/wish-controls";
import { birthdayText } from "@/features/gifts/format";
import { findList, getWishes, getWishLists, type WishItem, type WishList } from "@/features/gifts/queries";
import type { Occasion } from "@/features/gifts/schemas";
import { requireHousehold } from "@/lib/auth/context";
import { diffDays, formatDate } from "@/lib/dates";

export const metadata: Metadata = { title: "Gift ideas" };

export default function WishListPage({ params }: PageProps<"/gifts/[list]">) {
  return (
    <Suspense fallback={<CardSkeleton lines={6} />}>
      <ListView params={params} />
    </Suspense>
  );
}

/** Pre-select whichever is sooner: their birthday or Christmas. */
function defaultOccasion(list: WishList, today: string): Occasion {
  const year = Number(today.slice(0, 4));
  const christmas = `${today.slice(5) > "12-25" ? year + 1 : year}-12-25`;
  const toChristmas = diffDays(christmas, today);
  return list.birthday && list.birthday.days <= toChristmas ? "birthday" : "christmas";
}

async function ListView({ params }: { params: PageProps<"/gifts/[list]">["params"] }) {
  const { list: key } = await params;
  const ctx = await requireHousehold();
  const lists = await getWishLists(ctx);
  const list = findList(lists, key);
  if (!list) notFound();
  const { items, claims } = await getWishes(ctx, list);
  const mode = list.isMine ? "own" : list.ownerUserId ? "surprise" : "shared";
  const myClaim = (id: string) => claims.find((c) => c.item_id === id && c.created_by === ctx.userId) ?? null;

  // Your own list never shows what's been picked; you see removed items only if you'd picked them.
  const visible = items.filter((i) => !i.removed_at || (!list.isMine && myClaim(i.id)));
  const done = (i: WishItem) => Boolean(i.received_on) || myClaim(i.id)?.status === "given";
  const open = visible.filter((i) => !done(i) && !i.removed_at).sort((a, b) => Number(b.priority === "love") - Number(a.priority === "love"));
  const finished = visible.filter((i) => done(i) || i.removed_at);
  const others = ctx.members.filter((m) => m.user_id !== ctx.userId && m.role !== "viewer").map((m) => m.display_name);
  const occasion = defaultOccasion(list, ctx.today);

  return (
    <div className="space-y-5">
      <PageHeader
        title={list.isMine ? "Your wishlist" : `${list.name}'s list`}
        back={{ href: "/gifts", label: "Gift ideas" }}
        description={
          list.isMine
            ? `Add things you'd like. ${others.join(" and ") || "Others"} can see them, but not what they pick.`
            : list.ownerUserId
              ? `Pick what you'll get — ${list.name} won't see your picks or your surprise ideas.`
              : `Ideas for ${list.name}. You both see everything, including who's getting what.`
        }
        actions={
          ctx.canWrite ? <AddWishButton list={list.key} mode={mode} label={mode === "surprise" ? "Surprise idea" : "Add"} /> : null
        }
      />

      {birthdayText(list) ? (
        <p
          className={cn(
            "flex items-center gap-2 rounded-2xl px-4 py-3 text-sm ring-1",
            list.birthday && list.birthday.days <= 30 ? "bg-warning-soft ring-warning/30" : "bg-card ring-border/80",
          )}
        >
          <CakeIcon className="size-4 shrink-0" aria-hidden />
          <span>
            <span className="font-medium">{birthdayText(list)}</span>
            {list.birthday ? <span className="text-muted-foreground"> · {formatDate(list.birthday.date)}</span> : null}
          </span>
        </p>
      ) : null}

      {open.length ? (
        <ul className="space-y-3">
          {open.map((item) => (
            <ItemCard key={item.id} item={item} list={list} viewer={{ userId: ctx.userId, canWrite: ctx.canWrite, members: ctx.members }} claims={claims} mode={mode} occasion={occasion} />
          ))}
        </ul>
      ) : (
        <EmptyState
          icon={GiftIcon}
          title={list.isMine ? "Your list is empty" : "Nothing on this list yet"}
          description={
            list.isMine
              ? "Seen something you like? Add it with a link, the store and the price."
              : list.ownerUserId
                ? `When ${list.name} adds things, they'll appear here. You can also add surprise ideas only you can see.`
                : `Add ideas for ${list.name} as you spot them.`
          }
          action={ctx.canWrite ? <AddWishButton list={list.key} mode={mode} label={mode === "surprise" ? "Add a surprise idea" : "Add something"} /> : undefined}
        />
      )}

      {finished.length ? (
        <section>
          <SectionHeading title="Done" />
          <ul className="space-y-3 opacity-80">
            {finished.map((item) => (
              <ItemCard key={item.id} item={item} list={list} viewer={{ userId: ctx.userId, canWrite: ctx.canWrite, members: ctx.members }} claims={claims} mode={mode} occasion={occasion} />
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
