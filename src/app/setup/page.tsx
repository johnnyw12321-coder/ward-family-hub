import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { DatabaseIcon } from "lucide-react";
import { Logo } from "@/components/shared/logo";
import { isSupabaseConfigured } from "@/lib/env";

export const metadata: Metadata = { title: "Setup required" };

/** Shown only while the Supabase environment variables are missing. */
export default function SetupPage() {
  return (
    <Suspense>
      <SetupContent />
    </Suspense>
  );
}

async function SetupContent() {
  await connection();
  if (isSupabaseConfigured()) redirect("/");
  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center gap-6 px-4 py-10">
      <Logo className="size-12" />
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Connect the database</h1>
        <p className="mt-2 text-muted-foreground">
          Ward Family Hub needs a Supabase project before anyone can sign in. No data is stored until it is connected.
        </p>
      </div>
      <ol className="space-y-3 rounded-2xl bg-card p-5 text-sm shadow-card ring-1 ring-border/80">
        <li className="flex gap-3">
          <DatabaseIcon className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
          <span>
            Create a Supabase project and apply the migrations in <code className="font-mono">supabase/migrations</code>.
          </span>
        </li>
        <li className="ml-7">
          Set <code className="font-mono">NEXT_PUBLIC_SUPABASE_URL</code> and{" "}
          <code className="font-mono">NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY</code> in <code className="font-mono">.env.local</code>{" "}
          (or in Vercel project settings).
        </li>
        <li className="ml-7">Restart the app, then provision Jonathan and Adanna with the provisioning script.</li>
      </ol>
      <p className="text-sm text-muted-foreground">Full instructions are in the project README.</p>
    </main>
  );
}
