import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { PageHeader } from "@/components/shared/page-header";
import { CardSkeleton } from "@/components/shared/skeletons";
import { NewDocumentPageForm } from "@/features/documents/components/document-form";
import { getDocumentFormOptions } from "@/features/documents/form-options";
import { requireHousehold } from "@/lib/auth/context";

export const metadata: Metadata = { title: "Add document" };

const uuidRe = /^[0-9a-f-]{36}$/i;

export default function NewDocumentPage({ searchParams }: PageProps<"/documents/new">) {
  return (
    <div>
      <PageHeader title="Add document" back={{ href: "/documents", label: "Documents" }} />
      <Suspense fallback={<CardSkeleton lines={6} />}>
        <Form searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function Form({ searchParams }: { searchParams: PageProps<"/documents/new">["searchParams"] }) {
  const sp = await searchParams;
  const ctx = await requireHousehold();
  if (!ctx.canWrite) redirect("/documents");
  const options = await getDocumentFormOptions(ctx);
  const pick = (k: string) => (typeof sp[k] === "string" && uuidRe.test(sp[k] as string) ? (sp[k] as string) : "");
  const categoryKey = typeof sp.category === "string" ? sp.category : "";
  const categoryId = options.categories.find((c) => c.name.toLowerCase() === categoryKey.toLowerCase())?.id;
  const name = typeof sp.name === "string" ? sp.name.slice(0, 160) : "";

  return (
    <div className="rounded-2xl bg-card p-4 shadow-card ring-1 ring-border/80">
      <NewDocumentPageForm
        options={options}
        aal2={ctx.aal === "aal2"}
        initial={{
          ...(categoryId ? { categoryId } : {}),
          ...(name ? { name } : {}),
          transactionId: pick("transaction"),
          recurringId: pick("recurring"),
          accountId: pick("account"),
          goalId: pick("goal"),
          assetId: pick("asset"),
          familyMemberId: pick("member"),
        }}
      />
    </div>
  );
}
