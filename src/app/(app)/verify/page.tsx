import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { ShieldCheckIcon } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { CardSkeleton } from "@/components/shared/skeletons";
import { Button } from "@/components/ui/button";
import { getMfaState } from "@/features/documents/queries";
import { safeNextPath } from "@/features/auth/safe-redirect";
import { VerifyForm } from "@/features/security/components";
import { requireHousehold } from "@/lib/auth/context";

export const metadata: Metadata = { title: "Verify" };

export default function VerifyPage({ searchParams }: PageProps<"/verify">) {
  return (
    <div className="mx-auto max-w-sm">
      <PageHeader title="Two-factor check" />
      <Suspense fallback={<CardSkeleton lines={3} />}>
        <Verify searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function Verify({ searchParams }: { searchParams: PageProps<"/verify">["searchParams"] }) {
  const next = safeNextPath((await searchParams).next, "/documents");
  const ctx = await requireHousehold();
  if (ctx.aal === "aal2") redirect(next);
  const mfa = await getMfaState(ctx);
  return (
    <div className="space-y-4 rounded-2xl bg-card p-5 shadow-card ring-1 ring-border/80">
      <div className="flex items-center gap-3">
        <span className="flex size-10 items-center justify-center rounded-xl bg-accent text-accent-foreground">
          <ShieldCheckIcon className="size-5" aria-hidden />
        </span>
        <p className="text-sm text-muted-foreground">Sensitive documents need a code from your authenticator app, once per session.</p>
      </div>
      {mfa.enrolled ? (
        <VerifyForm next={next} />
      ) : (
        <div className="space-y-3 text-sm">
          <p>You haven&apos;t set up two-factor authentication yet.</p>
          <Button asChild className="w-full">
            <Link href="/settings#security">Set it up in Settings</Link>
          </Button>
        </div>
      )}
    </div>
  );
}
