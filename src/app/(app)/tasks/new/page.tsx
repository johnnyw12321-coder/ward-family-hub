import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHeader } from "@/components/shared/page-header";
import { CardSkeleton } from "@/components/shared/skeletons";
import { NewTaskPageForm } from "@/features/tasks/components/task-form";
import { requireHousehold } from "@/lib/auth/context";
import { redirect } from "next/navigation";

export const metadata: Metadata = { title: "New task" };

export default function NewTaskPage() {
  return (
    <div>
      <PageHeader title="New task" back={{ href: "/tasks", label: "Tasks" }} />
      <Suspense fallback={<CardSkeleton lines={5} />}>
        <Form />
      </Suspense>
    </div>
  );
}

async function Form() {
  const ctx = await requireHousehold();
  if (!ctx.canWrite) redirect("/tasks");
  return (
    <div className="rounded-2xl bg-card p-4 shadow-card ring-1 ring-border/80">
      <NewTaskPageForm members={ctx.members.map((m) => ({ user_id: m.user_id, display_name: m.display_name }))} />
    </div>
  );
}
