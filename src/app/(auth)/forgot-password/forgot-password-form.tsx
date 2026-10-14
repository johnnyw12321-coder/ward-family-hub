"use client";

import Link from "next/link";
import { useActionState } from "react";
import { AlertCircleIcon, MailCheckIcon } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { requestPasswordReset, type AuthFormState } from "@/features/auth/actions";

export function ForgotPasswordForm() {
  const [state, action, pending] = useActionState<AuthFormState, FormData>(requestPasswordReset, null);
  return (
    <form action={action} className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold">Reset your password</h2>
        <p className="text-sm text-muted-foreground">We&apos;ll email you a secure link.</p>
      </div>
      {state?.error ? (
        <Alert variant="destructive">
          <AlertCircleIcon />
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      ) : null}
      {state?.message ? (
        <Alert>
          <MailCheckIcon />
          <AlertDescription>{state.message}</AlertDescription>
        </Alert>
      ) : null}
      <Field>
        <FieldLabel htmlFor="email">Email</FieldLabel>
        <Input id="email" name="email" type="email" autoComplete="email" inputMode="email" required />
      </Field>
      <Button type="submit" size="lg" className="w-full" disabled={pending}>
        {pending ? <Spinner /> : null}
        Send reset link
      </Button>
      <p className="text-center text-sm">
        <Link href="/login" className="text-primary hover:underline">
          Back to sign in
        </Link>
      </p>
    </form>
  );
}
