"use client";

import { useTransition } from "react";
import { CheckIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { chooseDietPlan } from "../actions/diet";

export function ChoosePlanButton({ planKey, current, className }: { planKey: string; current: boolean; className?: string }) {
  const [pending, start] = useTransition();
  if (current) {
    return (
      <Button variant="secondary" disabled className={className}>
        <CheckIcon aria-hidden /> Your current plan
      </Button>
    );
  }
  return (
    <Button
      className={className}
      disabled={pending}
      onClick={() =>
        start(async () => {
          const r = await chooseDietPlan(planKey);
          if (r.ok) toast.success(r.message);
          else toast.error(r.error);
        })
      }
    >
      {pending ? <Spinner /> : null}
      Use this plan
    </Button>
  );
}
