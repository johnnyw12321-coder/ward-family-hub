import { Logo } from "@/components/shared/logo";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-surface px-4 py-10">
      <div className="mb-8 flex flex-col items-center gap-3 text-center">
        <Logo className="size-14" />
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Ward Family Hub</h1>
          <p className="text-sm text-muted-foreground">Private to our household</p>
        </div>
      </div>
      <div className="w-full max-w-sm rounded-3xl bg-card p-6 shadow-card ring-1 ring-border/80">{children}</div>
      <p className="mt-6 max-w-xs text-center text-xs text-muted-foreground">
        Accounts are created by invitation only. There is no public sign-up.
      </p>
    </div>
  );
}
