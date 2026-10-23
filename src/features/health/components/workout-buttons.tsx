"use client";

import { useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { CheckIcon, PlayIcon } from "lucide-react";
import { toast } from "sonner";
import { ConfirmAction } from "@/components/shared/confirm-action";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { startProgram, startWorkout, stopProgram } from "../actions/workouts";

type Start = { kind: "program"; programKey: string; day: number } | { kind: "custom"; customWorkoutId: string } | { kind: "empty" };

export function StartWorkoutButton({
  start: what,
  children,
  variant = "default",
  size = "lg",
  className,
}: {
  start: Start;
  children?: ReactNode;
  variant?: "default" | "outline" | "secondary";
  size?: "default" | "lg";
  className?: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Button
      variant={variant}
      size={size}
      className={className}
      disabled={pending}
      onClick={() =>
        start(async () => {
          const r = await startWorkout(what);
          if (!r.ok) {
            toast.error(r.error);
            return;
          }
          if (r.data.resumed) toast.info(r.message);
          router.push(`/health/workouts/session/${r.data.id}`);
        })
      }
    >
      {pending ? <Spinner /> : <PlayIcon aria-hidden />}
      {children ?? "Start workout"}
    </Button>
  );
}

export function StartProgramButton({ programKey, active, className }: { programKey: string; active: boolean; className?: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  if (active) {
    return (
      <Button variant="secondary" disabled className={className}>
        <CheckIcon aria-hidden /> Your current program
      </Button>
    );
  }
  return (
    <Button
      className={className}
      disabled={pending}
      onClick={() =>
        start(async () => {
          const r = await startProgram(programKey);
          if (!r.ok) toast.error(r.error);
          else {
            toast.success(r.message);
            router.push("/health/workouts");
          }
        })
      }
    >
      {pending ? <Spinner /> : null}
      Start this program
    </Button>
  );
}

export function StopProgramButton() {
  return (
    <ConfirmAction
      action={stopProgram}
      variant="ghost"
      size="sm"
      destructive={false}
      trigger="Stop program"
      title="Stop following this program?"
      description="Your logged workouts are kept. You can start this or another program any time."
      confirmLabel="Stop program"
    />
  );
}
