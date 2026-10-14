import Link from "next/link";
import { BanknoteIcon, CreditCardIcon, LandmarkIcon, PiggyBankIcon, TrendingUpIcon, WalletIcon, type LucideIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Money } from "@/components/shared/money";
import type { Member } from "@/lib/auth/context";
import { ACCOUNT_TYPE_LABELS, creditUtilisation, displayBalance, isLiability, type AccountType } from "@/lib/finance/calculations";
import type { AccountWithBalance } from "../types";

const ICONS: Partial<Record<AccountType, LucideIcon>> = {
  cash: BanknoteIcon,
  chequing: WalletIcon,
  savings: PiggyBankIcon,
  credit_card: CreditCardIcon,
  investment: TrendingUpIcon,
};

const GROUPS: { title: string; types: AccountType[] }[] = [
  { title: "Everyday", types: ["cash", "chequing"] },
  { title: "Savings & investments", types: ["savings", "investment", "other_asset"] },
  { title: "Credit cards", types: ["credit_card", "line_of_credit"] },
  { title: "Loans & mortgages", types: ["loan", "mortgage", "other_liability"] },
];

export function AccountRow({ account, members }: { account: AccountWithBalance; members: Member[] }) {
  const Icon = ICONS[account.type] ?? LandmarkIcon;
  const liability = isLiability(account.type);
  const owner = account.owner_scope === "personal" ? members.find((m) => m.user_id === account.owner_user_id)?.display_name : null;
  const utilisation = account.type === "credit_card" ? creditUtilisation(account.balance_minor, account.credit_limit_minor) : null;
  const shown = displayBalance(account.type, account.balance_minor);
  return (
    <li>
      <Link
        href={`/finances/accounts/${account.id}`}
        className="flex min-h-16 items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/60 active:bg-muted"
      >
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground" aria-hidden>
          <Icon className="size-[18px]" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate font-medium">{account.name}</span>
            {account.is_archived ? <Badge variant="outline">Archived</Badge> : null}
          </div>
          <div className="truncate text-xs text-muted-foreground">
            {[
              ACCOUNT_TYPE_LABELS[account.type],
              account.institution,
              account.last4 ? `•••• ${account.last4}` : null,
              owner ? owner : account.owner_scope === "shared" ? "Shared" : null,
              utilisation !== null ? `${utilisation}% of limit used` : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          </div>
        </div>
        <div className="text-right">
          <Money minor={shown} className="font-semibold" currency={account.currency} />
          {liability ? <div className="text-[11px] text-muted-foreground">{shown >= 0 ? "owed" : "in credit"}</div> : null}
        </div>
      </Link>
    </li>
  );
}

export function AccountGroups({ accounts, members }: { accounts: AccountWithBalance[]; members: Member[] }) {
  return (
    <div className="space-y-4">
      {GROUPS.map((g) => {
        const list = accounts.filter((a) => g.types.includes(a.type));
        if (!list.length) return null;
        const total = list.reduce((s, a) => s + displayBalance(a.type, a.balance_minor), 0);
        return (
          <section key={g.title}>
            <div className="mb-1.5 flex items-baseline justify-between px-1 text-xs font-medium text-muted-foreground">
              <span>{g.title}</span>
              <Money minor={total} />
            </div>
            <ul className="divide-y overflow-hidden rounded-2xl bg-card shadow-card ring-1 ring-border/80">
              {list.map((a) => (
                <AccountRow key={a.id} account={a} members={members} />
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
