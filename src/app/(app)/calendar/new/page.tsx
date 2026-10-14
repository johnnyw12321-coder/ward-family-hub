import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { PageHeader } from "@/components/shared/page-header";
import { CardSkeleton } from "@/components/shared/skeletons";
import { NewEventPageForm } from "@/features/calendar/components/event-form";
import { requireHousehold } from "@/lib/auth/context";

export const metadata: Metadata = { title: "New event" };

export default function NewEventPage() {
  return (
    <div>
      <PageHeader title="New event" back={{ href: "/calendar", label: "Calendar" }} />
      <Suspense fallback={<CardSkeleton lines={6} />}>
        <Form />
      </Suspense>
    </div>
  );
}

async function Form() {
  const ctx = await requireHousehold();
  if (!ctx.canWrite) redirect("/calendar");
  return (
    <div className="rounded-2xl bg-card p-4 shadow-card ring-1 ring-border/80">
      <NewEventPageForm members={ctx.members.map((m) => ({ user_id: m.user_id, display_name: m.display_name }))} defaultDate={ctx.today} />
    </div>
  );
}
