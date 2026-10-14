import Link from "next/link";
import { Money } from "@/components/shared/money";
import { dayHeading, formatDate, instantToLocalTime, type CalendarDate } from "@/lib/dates";
import type { Member } from "@/lib/auth/context";
import type { Category, TransactionRow } from "../types";
import { CategoryIcon } from "./category-icon";

function rowCategory(tx: TransactionRow, byId: Map<string, Category>): Category | undefined {
  if (!tx.category_id) return undefined;
  const c = byId.get(tx.category_id);
  if (c && !c.icon && c.parent_id) return byId.get(c.parent_id) ?? c;
  return c;
}

function subtitle(tx: TransactionRow, members: Member[], timezone: string): string {
  const parts: string[] = [];
  if (tx.kind === "transfer") parts.push(`${tx.account_name ?? "?"} → ${tx.to_account_name ?? "?"}`);
  else if (tx.kind === "opening_balance") parts.push(tx.account_name ?? "");
  else if (tx.kind === "adjustment") parts.push(`Adjustment · ${tx.account_name ?? ""}`);
  else {
    parts.push(tx.category_name ?? "Uncategorised");
    if (tx.account_name) parts.push(tx.account_name);
  }
  const who = members.find((m) => m.user_id === tx.person_user_id)?.display_name;
  if (who && members.length > 1) parts.push(who);
  parts.push(instantToLocalTime(tx.occurred_at, timezone));
  return parts.filter(Boolean).join(" · ");
}

export function TransactionItem({
  tx,
  categoriesById,
  members,
  timezone,
  showDate,
}: {
  tx: TransactionRow;
  categoriesById: Map<string, Category>;
  members: Member[];
  timezone: string;
  showDate?: boolean;
}) {
  const cat = rowCategory(tx, categoriesById);
  const amount = tx.kind === "transfer" ? tx.amount_minor : tx.signed_amount_minor;
  return (
    <li>
      <Link
        href={`/finances/transactions/${tx.id}`}
        className="flex min-h-16 items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/60 active:bg-muted"
      >
        <CategoryIcon
          icon={cat?.icon}
          color={cat?.color}
          kind={tx.kind === "transfer" ? "transfer" : tx.kind === "adjustment" || tx.kind === "opening_balance" ? "adjustment" : null}
        />
        <div className="min-w-0 flex-1">
          <div className="truncate font-medium">{tx.description}</div>
          <div className="truncate text-xs text-muted-foreground">
            {showDate ? `${formatDate(tx.occurred_on)} · ` : ""}
            {subtitle(tx, members, timezone)}
          </div>
        </div>
        <Money
          minor={amount}
          currency={tx.currency}
          tone={tx.kind === "transfer" ? "muted" : "signed"}
          className="text-[15px] font-semibold"
        />
      </Link>
    </li>
  );
}

/** Transactions grouped under day headings, newest first. */
export function TransactionList({
  rows,
  categories,
  members,
  timezone,
}: {
  rows: TransactionRow[];
  categories: Category[];
  members: Member[];
  timezone: string;
}) {
  const byId = new Map(categories.map((c) => [c.id, c]));
  const groups = new Map<CalendarDate, TransactionRow[]>();
  for (const r of rows) {
    const list = groups.get(r.occurred_on) ?? [];
    list.push(r);
    groups.set(r.occurred_on, list);
  }
  return (
    <div className="space-y-4">
      {[...groups.entries()].map(([day, list]) => {
        const net = list.reduce((sum, t) => sum + (t.kind === "transfer" ? 0 : t.signed_amount_minor), 0);
        return (
          <section key={day} aria-label={formatDate(day)}>
            <div className="mb-1.5 flex items-baseline justify-between px-1 text-xs font-medium text-muted-foreground">
              <span>
                {dayHeading(day)} <span className="opacity-70">· {formatDate(day)}</span>
              </span>
              {net !== 0 ? <Money minor={net} tone="muted" /> : null}
            </div>
            <ul className="divide-y overflow-hidden rounded-2xl bg-card shadow-card ring-1 ring-border/80">
              {list.map((tx) => (
                <TransactionItem key={tx.id} tx={tx} categoriesById={byId} members={members} timezone={timezone} />
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
