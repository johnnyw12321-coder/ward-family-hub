import type { Metadata } from "next";
import { ShieldAlertIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { signOut } from "@/features/auth/actions";

export const metadata: Metadata = { title: "No household access" };

export default function NoAccessPage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col items-center justify-center gap-5 px-4 text-center">
      <div className="flex size-14 items-center justify-center rounded-2xl bg-warning-soft text-warning">
        <ShieldAlertIcon className="size-7" aria-hidden />
      </div>
      <div>
        <h1 className="text-xl font-semibold">This account isn&apos;t linked to a household</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          You&apos;re signed in, but no household has been set up for you yet. Ask the household owner to run the
          provisioning step for your email address.
        </p>
      </div>
      <form action={signOut}>
        <Button type="submit" variant="outline" size="lg">
          Sign out
        </Button>
      </form>
    </main>
  );
}
