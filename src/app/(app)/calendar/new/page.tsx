import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { PageHeader } from "@/components/shared/page-header";
import { CardSkeleton } from "@/components/shared/skeletons";
import { getAboutOptions } from "@/features/calendar/about-options";
import { NewEventPageForm } from "@/features/calendar/components/event-form";
import { requireHousehold } from "@/lib/auth/context";

export const metadata: Metadata = { title: "New event" };

export default function NewEventPage({ searchParams }: PageProps<"/calendar/new">) {
  return (
    <div>
      <PageHeader title="New event" back={{ href: "/calendar", label: "Calendar" }} />
      <Suspense fallback={<CardSkeleton lines={6} />}>
        <Form searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function Form({ searchParams }: { searchParams: PageProps<"/calendar/new">["searchParams"] }) {
  const sp = await searchParams;
  const ctx = await requireHousehold();
  if (!ctx.canWrite) redirect("/calendar");
  const about = await getAboutOptions(ctx);
  const member = typeof sp.member === "string" && about.familyMembers.some((m) => m.id === sp.member) ? sp.member : "";
  return (
    <div className="rounded-2xl bg-card p-4 shadow-card ring-1 ring-border/80">
      <NewEventPageForm
        members={ctx.members.map((m) => ({ user_id: m.user_id, display_name: m.display_name }))}
        about={about}
        defaultDate={ctx.today}
        initial={member ? { familyMemberId: member, category: "medical" } : undefined}
      />
    </div>
  );
}
