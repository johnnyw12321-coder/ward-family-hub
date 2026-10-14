"use client";

import { useActionState } from "react";
import { AlertCircleIcon } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { updatePassword, type AuthFormState } from "@/features/auth/actions";

export function UpdatePasswordForm() {
  const [state, action, pending] = useActionState<AuthFormState, FormData>(updatePassword, null);
  return (
    <form action={action} className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold">Choose a password</h2>
        <p className="text-sm text-muted-foreground">You&apos;ll use this with your email to sign in.</p>
      </div>
      {state?.error ? (
        <Alert variant="destructive">
          <AlertCircleIcon />
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      ) : null}
      <FieldGroup>
        <Field data-invalid={Boolean(state?.fieldErrors?.password)}>
          <FieldLabel htmlFor="password">New password</FieldLabel>
          <Input id="password" name="password" type="password" autoComplete="new-password" required minLength={12} />
          <FieldDescription>At least 12 characters, with letters and a number. A passphrase works well.</FieldDescription>
          {state?.fieldErrors?.password ? <FieldError>{state.fieldErrors.password}</FieldError> : null}
        </Field>
        <Field data-invalid={Boolean(state?.fieldErrors?.confirm)}>
          <FieldLabel htmlFor="confirm">Confirm password</FieldLabel>
          <Input id="confirm" name="confirm" type="password" autoComplete="new-password" required />
          {state?.fieldErrors?.confirm ? <FieldError>{state.fieldErrors.confirm}</FieldError> : null}
        </Field>
      </FieldGroup>
      <Button type="submit" size="lg" className="w-full" disabled={pending}>
        {pending ? <Spinner /> : null}
        Save password
      </Button>
    </form>
  );
}
