import type { Metadata } from "next";
import { Suspense } from "react";
import { DatabaseBackupIcon, DownloadIcon } from "lucide-react";
import { cn } from "cn";
import { memberColorClass } from "@/components/shared/member-color";
import { PageHeader, SectionHeading } from "@/components/shared/page-header";
import { CardSkeleton } from "@/components/shared/skeletons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getMfaState } from "@/features/documents/queries";
import { TwoFactorCard } from "@/features/security/components";
import { HouseholdForm, ProfileForm } from "@/features/settings/settings-forms";
import { requireHousehold, memberName } from "@/lib/auth/context";
import { formatInstant } from "@/lib/dates";

export const metadata: Metadata = { title: "Settings" };

const COMMON_TIMEZONES = [
  "America/Port_of_Spain",
  "America/Barbados",
  "America/Guyana",
  "America/Jamaica",
  "America/New_York",
  "America/Toronto",
  "Europe/London",
  "UTC",
];

const TABLE_LABELS: Record<string, string> = {
  transactions: "Transaction",
  transaction_entries: "Ledger entry",
  financial_accounts: "Account",
  transaction_categories: "Category",
  budget_allocations: "Budget",
  recurring_items: "Recurring item",
  recurring_payments: "Bill payment",
  household_members: "Member",
  documents: "Document",
  document_files: "Document file",
  goals: "Goal",
  goal_contributions: "Goal contribution",
  calendar_events: "Event",
  tasks: "Task",
};

export default function SettingsPage() {
  return (
    <div>
      <PageHeader title="Settings" back={{ href: "/more", label: "More" }} />
      <Suspense fallback={<CardSkeleton lines={6} />}>
        <SettingsView />
      </Suspense>
    </div>
  );
}

async function SettingsView() {
  const ctx = await requireHousehold();
  const mfa = await getMfaState(ctx);
  const { data: audit } = await ctx.supabase
    .from("audit_logs")
    .select("id, actor_id, table_name, action, changed_fields, created_at")
    .eq("household_id", ctx.household.id)
    .neq("table_name", "transaction_entries")
    .order("created_at", { ascending: false })
    .limit(25);
  const timezones = COMMON_TIMEZONES.includes(ctx.household.timezone) ? COMMON_TIMEZONES : [ctx.household.timezone, ...COMMON_TIMEZONES];

  return (
    <div className="space-y-6">
      <section>
        <SectionHeading title="Your profile" />
        <div className="rounded-2xl bg-card p-4 shadow-card ring-1 ring-border/80">
          <ProfileForm initial={{ displayName: ctx.me.display_name, color: ctx.me.color as "sage" }} />
          {ctx.email ? <p className="mt-4 text-xs text-muted-foreground">Signed in as {ctx.email}</p> : null}
        </div>
      </section>

      <section>
        <SectionHeading title="Household" />
        <div className="space-y-4 rounded-2xl bg-card p-4 shadow-card ring-1 ring-border/80">
          <HouseholdForm initial={{ name: ctx.household.name, timezone: ctx.household.timezone }} timezones={timezones} disabled={!ctx.canWrite} />
          <div className="border-t pt-4">
            <h3 className="mb-2 text-sm font-medium">Members</h3>
            <ul className="space-y-2">
              {ctx.members.map((m) => (
                <li key={m.user_id} className="flex items-center gap-3">
                  <span className={cn("flex size-8 items-center justify-center rounded-full text-xs font-semibold", memberColorClass(m.color))}>
                    {m.display_name.slice(0, 1).toUpperCase()}
                  </span>
                  <span className="flex-1 text-sm">{m.display_name}</span>
                  <Badge variant="secondary" className="capitalize">
                    {m.role}
                  </Badge>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-xs text-muted-foreground">
              Members are added only by the provisioning script — there is no sign-up page. Currency: {ctx.household.base_currency}.
            </p>
          </div>
        </div>
      </section>

      <section id="security" className="scroll-mt-20">
        <SectionHeading title="Security" />
        <div className="space-y-4 rounded-2xl bg-card p-4 shadow-card ring-1 ring-border/80">
          <TwoFactorCard enrolled={mfa.enrolled} verifiedFactorIds={mfa.verifiedFactorIds} aal2={mfa.aal2} />
          <p className="border-t pt-3 text-xs text-muted-foreground">
            Every record is protected by database row-level security: only members of this household can read or change it.
            Sensitive documents additionally require a two-factor check in the current session.
          </p>
        </div>
      </section>

      <section>
        <SectionHeading title="Your data" />
        <div className="space-y-3 rounded-2xl bg-card p-4 shadow-card ring-1 ring-border/80">
          <div className="flex items-start gap-3 text-sm">
            <DatabaseBackupIcon className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden />
            <p>
              Download a complete copy of the household&apos;s records as JSON (for safekeeping or moving to another system), or
              transactions as a spreadsheet. Store downloads somewhere private — they contain financial details.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline">
              <a href="/api/export/backup" download>
                <DownloadIcon data-icon="inline-start" /> Full backup (JSON)
              </a>
            </Button>
            <Button asChild variant="outline">
              <a href="/api/export/transactions" download>
                <DownloadIcon data-icon="inline-start" /> Transactions (CSV)
              </a>
            </Button>
          </div>
        </div>
      </section>

      <section>
        <SectionHeading title="Recent changes" />
        {audit?.length ? (
          <ul className="divide-y overflow-hidden rounded-2xl bg-card text-sm shadow-card ring-1 ring-border/80">
            {audit.map((a) => (
              <li key={a.id} className="px-4 py-2.5">
                <span className="font-medium">{memberName(ctx.members, a.actor_id) ?? "System"}</span>{" "}
                {a.action === "insert" ? "added" : a.action === "update" ? "changed" : "deleted"} a{" "}
                {(TABLE_LABELS[a.table_name] ?? a.table_name.replace(/_/g, " ")).toLowerCase()}
                {a.action === "update" && a.changed_fields?.length ? (
                  <span className="text-muted-foreground"> ({(a.changed_fields as string[]).join(", ").replace(/_/g, " ")})</span>
                ) : null}
                <div className="text-xs text-muted-foreground">{formatInstant(a.created_at as string, ctx.household.timezone)}</div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="rounded-2xl bg-card p-4 text-sm text-muted-foreground shadow-card ring-1 ring-border/80">No changes recorded yet.</p>
        )}
      </section>
    </div>
  );
}
