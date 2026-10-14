import type { Metadata } from "next";
import { FileLockIcon } from "lucide-react";
import { PlannedModule } from "@/components/shared/planned-module";

export const metadata: Metadata = { title: "Documents" };

export default function Page() {
  return (
    <PlannedModule
      title="Documents"
      icon={FileLockIcon}
      phase={4}
      summary="A private vault for important papers, stored in a private bucket with short-lived links and extra verification for sensitive files."
      features={[
    "Passports, IDs, insurance, property and more",
    "Expiry reminders",
    "Search, tags and categories",
    "Two-factor check for sensitive documents",
    "Link documents to accounts, assets and family",
      ]}
    />
  );
}
