"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeftRightIcon, CalendarPlusIcon, ListPlusIcon, PlusIcon, ReceiptIcon, TrendingUpIcon, type LucideIcon } from "lucide-react";
import { ResponsiveModal } from "@/components/shared/responsive-modal";
import { instantToLocalTime, todayIn } from "@/lib/dates";
import { TransactionForm, type AccountOption, type MemberOption } from "@/features/finance/components/transaction-form";
import type { Category } from "@/features/finance/types";

export type QuickAddData = {
  accounts: AccountOption[];
  categories: Category[];
  members: MemberOption[];
  meId: string;
  timezone: string;
  currency: string;
  canWrite: boolean;
  /** Extra destinations (tasks, events) registered by modules that are built. */
  links: { href: string; label: string; icon: "task" | "event" }[];
};

type Mode = "menu" | "expense" | "income" | "transfer";

const LINK_ICONS: Record<"task" | "event", LucideIcon> = { task: ListPlusIcon, event: CalendarPlusIcon };

export function QuickAdd({ data }: { data: QuickAddData }) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Mode>("menu");
  const [stamp, setStamp] = useState({ today: "", time: "" });

  if (!data.canWrite) return null;

  const start = (m: Mode) => {
    setStamp({ today: todayIn(data.timezone), time: instantToLocalTime(new Date(), data.timezone) });
    setMode(m);
  };

  const options: { mode: Mode; label: string; hint: string; icon: LucideIcon }[] = [
    { mode: "expense", label: "Expense", hint: "Record spending", icon: ReceiptIcon },
    { mode: "income", label: "Income", hint: "Salary, commissions, other", icon: TrendingUpIcon },
    { mode: "transfer", label: "Transfer", hint: "Between your accounts", icon: ArrowLeftRightIcon },
  ];

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setMode("menu");
          setOpen(true);
        }}
        aria-label="Quick add"
        className="no-print fixed right-4 bottom-[calc(env(safe-area-inset-bottom)+5rem)] z-40 flex size-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-float transition-transform active:scale-95 lg:right-8 lg:bottom-8"
      >
        <PlusIcon className="size-7" strokeWidth={2.2} aria-hidden />
      </button>

      <ResponsiveModal
        open={open}
        onOpenChange={setOpen}
        title={mode === "menu" ? "Add" : `New ${mode}`}
        description={mode === "menu" ? "What would you like to record?" : undefined}
      >
        {mode === "menu" ? (
          <div className="grid gap-2 pb-2">
            {options.map((o) => (
              <button
                key={o.mode}
                type="button"
                onClick={() => start(o.mode)}
                className="flex min-h-16 items-center gap-4 rounded-2xl border bg-card px-4 text-left transition-colors hover:bg-muted"
              >
                <span className="flex size-10 items-center justify-center rounded-xl bg-accent text-accent-foreground">
                  <o.icon className="size-5" aria-hidden />
                </span>
                <span>
                  <span className="block font-medium">{o.label}</span>
                  <span className="block text-sm text-muted-foreground">{o.hint}</span>
                </span>
              </button>
            ))}
            {data.links.map((l) => {
              const Icon = LINK_ICONS[l.icon];
              return (
                <Link
                  key={l.href}
                  href={l.href}
                  onClick={() => setOpen(false)}
                  className="flex min-h-16 items-center gap-4 rounded-2xl border bg-card px-4 transition-colors hover:bg-muted"
                >
                  <span className="flex size-10 items-center justify-center rounded-xl bg-secondary text-secondary-foreground">
                    <Icon className="size-5" aria-hidden />
                  </span>
                  <span className="font-medium">{l.label}</span>
                </Link>
              );
            })}
          </div>
        ) : (
          <TransactionForm
            key={`${mode}-${stamp.time}`}
            accounts={data.accounts}
            categories={data.categories}
            members={data.members}
            meId={data.meId}
            today={stamp.today}
            nowTime={stamp.time}
            currency={data.currency}
            initial={{ kind: mode }}
            autoFocusAmount
            onSaved={() => setOpen(false)}
          />
        )}
      </ResponsiveModal>
    </>
  );
}
