import { ExternalLinkIcon, EyeOffIcon, HeartIcon, LinkIcon, MapPinIcon } from "lucide-react";
import { Money } from "@/components/shared/money";
import { Badge } from "@/components/ui/badge";
import { memberName, type Member } from "@/lib/auth/context";
import { formatDate } from "@/lib/dates";
import { minorToInput } from "@/lib/money";
import type { WishClaim, WishItem, WishList } from "../queries";
import { CLAIM_STATUS_LABELS, OCCASION_LABELS, type Occasion } from "../schemas";
import { RetryPreviewButton } from "./preview-filler";
import { ClaimControls, ItemControls } from "./wish-controls";

/** One idea on a list, with what the viewer is allowed to see and do. */
export function ItemCard({
  item,
  list,
  viewer,
  claims,
  mode,
  occasion,
}: {
  item: WishItem;
  list: WishList;
  viewer: { userId: string; canWrite: boolean; members: Member[] };
  claims: WishClaim[];
  mode: "own" | "surprise" | "shared";
  occasion: Occasion;
}) {
  const mine = claims.find((c) => c.item_id === item.id && c.created_by === viewer.userId) ?? null;
  const theirs = claims.filter((c) => c.item_id === item.id && c.created_by !== viewer.userId);
  // You edit your own items, and surprise or shared ideas; never someone's own items.
  const editable = viewer.canWrite && (list.isMine || item.is_surprise || !list.ownerUserId);
  const initial = {
    id: item.id,
    list: list.key,
    title: item.title,
    details: item.details ?? "",
    link: item.link_url ?? "",
    store: item.store ?? "",
    price: minorToInput(item.price_minor),
    priority: item.priority,
  };
  return (
    <li className="space-y-3 rounded-2xl bg-card p-4 shadow-card ring-1 ring-border/80">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <h3 className="font-semibold">{item.title}</h3>
          <div className="flex flex-wrap gap-1.5">
            {item.priority === "love" ? (
              <Badge variant="secondary" className="gap-1">
                <HeartIcon className="size-3" aria-hidden /> Love it
              </Badge>
            ) : null}
            {item.is_surprise ? (
              <Badge variant="outline" className="gap-1">
                <EyeOffIcon className="size-3" aria-hidden /> Surprise · {list.name} can&apos;t see this
              </Badge>
            ) : null}
            {item.received_on ? <Badge variant="outline">Received {formatDate(item.received_on)}</Badge> : null}
            {item.removed_at ? <Badge variant="outline">Removed from the list</Badge> : null}
          </div>
        </div>
        {item.price_minor !== null ? <Money minor={item.price_minor} trimZeroCents className="shrink-0 font-semibold" /> : null}
      </div>
      {item.details ? <p className="text-sm whitespace-pre-line text-muted-foreground">{item.details}</p> : null}
      {item.store ? (
        <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <MapPinIcon className="size-3.5 shrink-0" aria-hidden /> {item.store}
        </p>
      ) : null}
      {item.link_url ? (
        <a
          href={item.link_url}
          target="_blank"
          rel="noopener noreferrer nofollow"
          className="flex items-center gap-2 rounded-xl bg-muted/60 px-3 py-2 text-sm transition-colors hover:bg-muted"
        >
          <LinkIcon className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
          <span className="min-w-0 flex-1">
            <span className="block truncate font-medium">{item.link_site ?? new URL(item.link_url).hostname.replace(/^www\./, "")}</span>
            {item.link_title && item.link_title !== item.title ? (
              <span className="line-clamp-2 text-xs text-muted-foreground">{item.link_title}</span>
            ) : null}
          </span>
          <ExternalLinkIcon className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
        </a>
      ) : null}
      {item.link_url && item.link_checked_at && !item.link_title ? (
        <div className="flex flex-wrap items-center justify-between gap-x-2 text-xs text-muted-foreground">
          <span>
            {new URL(item.link_url).hostname.replace(/^www\./, "")} doesn&apos;t share its product name.
          </span>
          {viewer.canWrite ? <RetryPreviewButton list={list.key} itemId={item.id} /> : null}
        </div>
      ) : null}

      {mode !== "own" && (mine || theirs.length) ? (
        <ul className="space-y-1 rounded-xl bg-accent/60 px-3 py-2 text-sm text-accent-foreground">
          {mine ? (
            <li>
              <span className="font-medium">You&apos;re getting this</span> for {OCCASION_LABELS[mine.occasion]} · {CLAIM_STATUS_LABELS[mine.status]}
              {mine.price_paid_minor !== null ? (
                <>
                  {" "}
                  · <Money minor={mine.price_paid_minor} trimZeroCents />
                </>
              ) : null}
              {mine.note ? <span className="block text-xs opacity-80">{mine.note}</span> : null}
            </li>
          ) : null}
          {theirs.map((c) => (
            <li key={c.id}>
              {memberName(viewer.members, c.created_by) ?? "Someone"} is getting this for {OCCASION_LABELS[c.occasion]} · {CLAIM_STATUS_LABELS[c.status]}
            </li>
          ))}
        </ul>
      ) : null}

      {viewer.canWrite ? (
        <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3">
          {mode !== "own" && !item.received_on ? (
            <ClaimControls
              itemId={item.id}
              myClaim={mine ? { id: mine.id, status: mine.status } : null}
              defaultOccasion={occasion}
              price={minorToInput(item.price_minor)}
            />
          ) : (
            <span />
          )}
          {editable && !item.removed_at ? <ItemControls id={item.id} initial={initial} mode={mode} received={Boolean(item.received_on)} /> : null}
        </div>
      ) : null}
    </li>
  );
}
