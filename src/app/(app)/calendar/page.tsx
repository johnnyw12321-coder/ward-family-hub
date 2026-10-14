import type { Metadata } from "next";
import { CalendarDaysIcon } from "lucide-react";
import { PlannedModule } from "@/components/shared/planned-module";

export const metadata: Metadata = { title: "Calendar" };

export default function Page() {
  return (
    <PlannedModule
      title="Calendar"
      icon={CalendarDaysIcon}
      phase={3}
      fromMore={false}
      summary="A shared family calendar with month, week, day and agenda views, showing events alongside bills, tasks and document expiry dates."
      features={[
    "Events for either or both of you",
    "Recurring events and reminders",
    "Family, work, medical, school and more categories",
    "Bills and expiry dates on the calendar",
    "Times shown in Port of Spain time",
    "Ready for Google Calendar sync later",
      ]}
    />
  );
}
