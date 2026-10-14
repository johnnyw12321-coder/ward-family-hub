"use client";

import { useState } from "react";
import { PencilIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { TransactionInput } from "../schemas";
import type { Category } from "../types";
import { TransactionForm, type AccountOption, type MemberOption } from "./transaction-form";

export function EditTransaction({
  accounts,
  categories,
  members,
  meId,
  currency,
  initial,
}: {
  accounts: AccountOption[];
  categories: Category[];
  members: MemberOption[];
  meId: string;
  currency: string;
  initial: TransactionInput;
}) {
  const [editing, setEditing] = useState(false);
  if (!editing) {
    return (
      <Button variant="outline" size="lg" className="w-full" onClick={() => setEditing(true)}>
        <PencilIcon data-icon="inline-start" /> Edit transaction
      </Button>
    );
  }
  return (
    <section className="rounded-2xl bg-card p-4 shadow-card ring-1 ring-border/80">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="font-semibold">Edit transaction</h2>
        <Button variant="ghost" size="sm" onClick={() => setEditing(false)}>
          Cancel
        </Button>
      </div>
      <TransactionForm
        accounts={accounts}
        categories={categories}
        members={members}
        meId={meId}
        today={initial.date}
        nowTime={initial.time}
        currency={currency}
        initial={initial}
        onSaved={() => setEditing(false)}
      />
    </section>
  );
}
