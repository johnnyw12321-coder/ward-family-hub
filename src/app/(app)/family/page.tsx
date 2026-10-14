import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { CakeIcon, UsersIcon } from "lucide-react";
import { cn } from "cn";
import { EmptyState } from "@/components/shared/empty-state";
import { memberColorClass } from "@/components/shared/member-color";
import { PageHeader, SectionHeading } from "@/components/shared/page-header";
import { ListSkeleton } from "@/components/shared/skeletons";
import { ContactList } from "@/features/family/components/contact-list";
import { AddContactButton, NewMemberButton } from "@/features/family/components/family-forms";
import { ageOn, daysUntilBirthday, getFamilyContacts, getFamilyMembers } from "@/features/family/queries";
import { RELATIONSHIP_LABELS } from "@/features/family/schemas";
import { requireHousehold } from "@/lib/auth/context";

export const metadata: Metadata = { title: "Family" };

export default function FamilyPage() {
  return (
    <div>
      <PageHeader title="Family" back={{ href: "/more", label: "More" }} />
      <Suspense fallback={<ListSkeleton rows={4} />}>
        <FamilyView />
      </Suspense>
    </div>
  );
}

async function FamilyView() {
  const ctx = await requireHousehold();
  const [members, householdContacts] = await Promise.all([getFamilyMembers(ctx), getFamilyContacts(ctx, null)]);
  const accounts = ctx.members.map((m) => ({ user_id: m.user_id, display_name: m.display_name }));

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">Private to your household. Health details need a two-factor check.</p>
        {ctx.canWrite ? <NewMemberButton accounts={accounts} /> : null}
      </div>
      {members.length ? (
        <ul className="grid gap-3 sm:grid-cols-2">
          {members.map((m) => {
            const days = m.date_of_birth ? daysUntilBirthday(m.date_of_birth, ctx.today) : null;
            return (
              <li key={m.id}>
                <Link href={`/family/${m.id}`} className="flex items-center gap-3 rounded-2xl bg-card p-4 shadow-card ring-1 ring-border/80 transition-colors hover:bg-muted/40">
                  <span className={cn("flex size-12 shrink-0 items-center justify-center rounded-full text-lg font-semibold", memberColorClass(m.colour))} aria-hidden>
                    {(m.preferred_name ?? m.full_name).slice(0, 1).toUpperCase()}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-semibold">{m.preferred_name ?? m.full_name}</div>
                    <div className="truncate text-xs text-muted-foreground">
                      {[
                        RELATIONSHIP_LABELS[m.relationship as keyof typeof RELATIONSHIP_LABELS],
                        m.date_of_birth ? ageOn(m.date_of_birth, ctx.today) : null,
                        m.school_or_care,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </div>
                    {days !== null && days <= 30 ? (
                      <div className="mt-0.5 flex items-center gap-1 text-xs font-medium text-primary">
                        <CakeIcon className="size-3" aria-hidden /> {days === 0 ? "Birthday today!" : `Birthday in ${days} day${days === 1 ? "" : "s"}`}
                      </div>
                    ) : null}
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      ) : (
        <EmptyState icon={UsersIcon} title="Add your family" description="Profiles for each person, with school, contacts, milestones and protected health details." />
      )}

      <section>
        <SectionHeading title="Household contacts" action={ctx.canWrite ? <AddContactButton /> : undefined} />
        <ContactList contacts={householdContacts} canWrite={ctx.canWrite} />
      </section>
    </div>
  );
}
