import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ArchiveIcon, ArchiveRestoreIcon, FlagIcon, HeartPulseIcon, LockIcon, StarIcon, Trash2Icon } from "lucide-react";
import { cn } from "cn";
import { ConfirmAction } from "@/components/shared/confirm-action";
import { memberColorClass } from "@/components/shared/member-color";
import { Money } from "@/components/shared/money";
import { PageHeader, SectionHeading } from "@/components/shared/page-header";
import { CardSkeleton } from "@/components/shared/skeletons";
import { Button } from "@/components/ui/button";
import { CalendarItemRow } from "@/features/calendar/components/calendar-items";
import { expandEvents, sortItems } from "@/features/calendar/expand";
import { getEventsBetween } from "@/features/calendar/queries";
import { LinkedDocuments } from "@/features/documents/components/linked-documents";
import { getMfaState } from "@/features/documents/queries";
import { deleteFamilyDate, deleteFamilyMember, setFamilyMemberArchived } from "@/features/family/actions";
import { ContactList } from "@/features/family/components/contact-list";
import { AddContactButton, AddFamilyDateButton, EditHealthButton, EditMemberButton } from "@/features/family/components/family-forms";
import { ageOn, daysUntilBirthday, getFamilyContacts, getFamilyDates, getFamilyHealth, getFamilyMember } from "@/features/family/queries";
import { RELATIONSHIP_LABELS } from "@/features/family/schemas";
import { getAllTransactions } from "@/features/finance/queries";
import { requireHousehold } from "@/lib/auth/context";
import { addDays, formatDate, yearStart } from "@/lib/dates";

export const metadata: Metadata = { title: "Family member" };

export default function FamilyMemberPage({ params }: PageProps<"/family/[id]">) {
  return (
    <Suspense fallback={<CardSkeleton lines={6} />}>
      <Profile params={params} />
    </Suspense>
  );
}

async function Profile({ params }: { params: PageProps<"/family/[id]">["params"] }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const ctx = await requireHousehold();
  const member = await getFamilyMember(ctx, id);
  if (!member) notFound();
  const horizon = addDays(ctx.today, 90);
  const [health, mfa, contacts, dates, spending, events] = await Promise.all([
    getFamilyHealth(ctx, id),
    getMfaState(ctx),
    getFamilyContacts(ctx, id),
    getFamilyDates(ctx, id),
    getAllTransactions(ctx, { member: id, kind: "expense", from: yearStart(ctx.today), to: ctx.today }),
    getEventsBetween(ctx, ctx.today, horizon),
  ]);
  const name = member.preferred_name ?? member.full_name;
  const spent = -spending.reduce((s, t) => s + t.signed_amount_minor, 0);
  const upcoming = sortItems(expandEvents(events.filter((e) => e.family_member_id === id), ctx.today, horizon, ctx.household.timezone)).slice(0, 6);
  const names = Object.fromEntries(ctx.members.map((m) => [m.user_id, m.display_name]));
  const birthdayIn = member.date_of_birth ? daysUntilBirthday(member.date_of_birth, ctx.today) : null;
  const milestones = dates.filter((d) => d.kind === "milestone");
  const important = dates.filter((d) => d.kind === "important_date");
  const accounts = ctx.members.map((m) => ({ user_id: m.user_id, display_name: m.display_name }));

  return (
    <div className="space-y-5">
      <PageHeader title={name} back={{ href: "/family", label: "Family" }} />

      <section className="flex items-center gap-4 rounded-2xl bg-card p-5 shadow-card ring-1 ring-border/80">
        <span className={cn("flex size-16 shrink-0 items-center justify-center rounded-full text-2xl font-semibold", memberColorClass(member.colour))} aria-hidden>
          {name.slice(0, 1).toUpperCase()}
        </span>
        <div className="min-w-0 text-sm">
          <div className="text-base font-semibold">{member.full_name}</div>
          <div className="text-muted-foreground">
            {RELATIONSHIP_LABELS[member.relationship as keyof typeof RELATIONSHIP_LABELS]}
            {member.date_of_birth ? ` · born ${formatDate(member.date_of_birth)} · ${ageOn(member.date_of_birth, ctx.today)}` : ""}
          </div>
          {birthdayIn !== null && birthdayIn <= 60 ? (
            <div className="font-medium text-primary">{birthdayIn === 0 ? "Birthday today!" : `Birthday in ${birthdayIn} days`}</div>
          ) : null}
        </div>
      </section>

      {ctx.canWrite ? (
        <div className="flex flex-wrap gap-2">
          <EditMemberButton
            accounts={accounts}
            initial={{
              id: member.id,
              fullName: member.full_name,
              preferredName: member.preferred_name ?? "",
              relationship: member.relationship as "child",
              dateOfBirth: member.date_of_birth ?? "",
              schoolOrCare: member.school_or_care ?? "",
              schoolDetails: member.school_details ?? "",
              notes: member.notes ?? "",
              colour: member.colour,
              userId: member.user_id ?? "",
            }}
          />
          <Button asChild variant="outline">
            <Link href={`/calendar/new?member=${id}`}>Add appointment</Link>
          </Button>
        </div>
      ) : null}

      {member.school_or_care || member.school_details ? (
        <section className="rounded-2xl bg-card p-4 text-sm shadow-card ring-1 ring-border/80">
          <h2 className="font-semibold">{member.school_or_care ?? "School"}</h2>
          {member.school_details ? <p className="mt-1 whitespace-pre-wrap text-muted-foreground">{member.school_details}</p> : null}
        </section>
      ) : null}

      <section>
        <SectionHeading title="Health" />
        <div className="rounded-2xl bg-card p-4 shadow-card ring-1 ring-border/80">
          {ctx.aal === "aal2" ? (
            health ? (
              <dl className="space-y-2 text-sm">
                {(
                  [
                    ["Blood type", health.blood_type === "unknown" ? "Unknown" : health.blood_type],
                    ["Allergies", health.allergies],
                    ["Conditions", health.conditions],
                    ["Medications", health.medications],
                    ["Doctor", health.doctor],
                    ["Health insurance", health.health_insurance],
                    ["Notes", health.notes],
                  ] as [string, string | null][]
                )
                  .filter(([, v]) => v)
                  .map(([k, v]) => (
                    <div key={k}>
                      <dt className="text-xs text-muted-foreground">{k}</dt>
                      <dd className="whitespace-pre-wrap">{v}</dd>
                    </div>
                  ))}
              </dl>
            ) : (
              <p className="text-sm text-muted-foreground">No health details recorded.</p>
            )
          ) : (
            <div className="flex items-center gap-3 text-sm">
              <LockIcon className="size-5 shrink-0 text-primary" aria-hidden />
              <p className="flex-1 text-muted-foreground">Health details are protected. {mfa.enrolled ? "Verify to view or edit them." : "Turn on two-factor in Settings to add them."}</p>
              <Button asChild size="sm" variant="secondary">
                <Link href={mfa.enrolled ? `/verify?next=/family/${id}` : "/settings#security"}>{mfa.enrolled ? "Verify" : "Set up"}</Link>
              </Button>
            </div>
          )}
          {ctx.aal === "aal2" && ctx.canWrite ? (
            <div className="mt-3 border-t pt-3">
              <EditHealthButton
                initial={{
                  familyMemberId: id,
                  bloodType: (health?.blood_type as "A+") ?? "",
                  allergies: health?.allergies ?? "",
                  conditions: health?.conditions ?? "",
                  medications: health?.medications ?? "",
                  doctor: health?.doctor ?? "",
                  healthInsurance: health?.health_insurance ?? "",
                  notes: health?.notes ?? "",
                }}
              />
            </div>
          ) : null}
        </div>
      </section>

      <section>
        <SectionHeading title="Contacts" action={ctx.canWrite ? <AddContactButton familyMemberId={id} /> : undefined} />
        <ContactList contacts={contacts} canWrite={ctx.canWrite} />
      </section>

      <section>
        <SectionHeading title="Milestones & dates" action={ctx.canWrite ? <AddFamilyDateButton familyMemberId={id} /> : undefined} />
        {dates.length ? (
          <ul className="divide-y rounded-2xl bg-card shadow-card ring-1 ring-border/80">
            {[...important, ...milestones].map((d) => (
              <li key={d.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                {d.kind === "milestone" ? <StarIcon className="size-4 shrink-0 text-warning" aria-hidden /> : <FlagIcon className="size-4 shrink-0 text-primary" aria-hidden />}
                <div className="min-w-0 flex-1">
                  <div className="font-medium">{d.title}</div>
                  <div className="text-xs text-muted-foreground">
                    {formatDate(d.on_date)}
                    {d.is_annual ? " · every year" : ""}
                    {d.notes ? ` · ${d.notes}` : ""}
                  </div>
                </div>
                {ctx.canWrite ? (
                  <ConfirmAction
                    action={deleteFamilyDate.bind(null, d.id)}
                    trigger={<Trash2Icon aria-label={`Remove ${d.title}`} />}
                    title="Remove this entry?"
                    description="This can't be undone."
                    confirmLabel="Remove"
                    variant="ghost"
                    size="icon"
                  />
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="rounded-2xl bg-card p-4 text-sm text-muted-foreground shadow-card ring-1 ring-border/80">Record firsts and the dates that matter.</p>
        )}
      </section>

      <section>
        <SectionHeading title="Coming up" />
        {upcoming.length ? (
          <ul className="divide-y rounded-2xl bg-card shadow-card ring-1 ring-border/80">
            {upcoming.map((item) => (
              <CalendarItemRow key={item.key} item={item} names={names} />
            ))}
          </ul>
        ) : (
          <p className="rounded-2xl bg-card p-4 text-sm text-muted-foreground shadow-card ring-1 ring-border/80">
            No appointments in the next 90 days. Choose {name} under “About” when adding a calendar event.
          </p>
        )}
      </section>

      <section className="rounded-2xl bg-card p-4 shadow-card ring-1 ring-border/80">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold">Spending on {name} this year</h2>
            <p className="text-xs text-muted-foreground">Expenses linked to {name} under “More details”.</p>
          </div>
          <Money minor={spent} className="text-lg font-semibold" />
        </div>
        {spending.length ? (
          <Link href={`/finances/transactions?member=${id}`} className="mt-2 inline-block text-sm text-primary">
            See {spending.length} transaction{spending.length === 1 ? "" : "s"}
          </Link>
        ) : null}
      </section>

      <LinkedDocuments
        ctx={ctx}
        filter={{ familyMemberId: id }}
        title="Documents"
        attachHref={`/documents/new?member=${id}&name=${encodeURIComponent(name)}`}
        attachLabel="Attach"
      />

      {ctx.canWrite ? (
        <div className="flex flex-wrap gap-2 border-t pt-4">
          <ConfirmAction
            action={setFamilyMemberArchived.bind(null, id, !member.is_archived)}
            trigger={
              member.is_archived ? (
                <>
                  <ArchiveRestoreIcon data-icon="inline-start" /> Restore
                </>
              ) : (
                <>
                  <ArchiveIcon data-icon="inline-start" /> Archive
                </>
              )
            }
            title={member.is_archived ? "Restore profile?" : "Archive profile?"}
            description="Archived profiles are hidden from lists and reminders but keep their history."
            confirmLabel={member.is_archived ? "Restore" : "Archive"}
            destructive={false}
          />
          <ConfirmAction
            action={deleteFamilyMember.bind(null, id)}
            trigger={
              <>
                <Trash2Icon data-icon="inline-start" /> Delete
              </>
            }
            title="Delete this profile?"
            description="Contacts, dates and health details for this person are deleted. Transactions, events and documents are kept but unlinked."
            confirmLabel="Delete"
            redirectTo="/family"
            variant="destructive"
          />
        </div>
      ) : null}
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <HeartPulseIcon className="size-3.5" aria-hidden /> Health changes are logged without their contents.
      </p>
    </div>
  );
}
