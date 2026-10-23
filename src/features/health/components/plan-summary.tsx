import { AlertTriangleIcon, InfoIcon, StethoscopeIcon } from "lucide-react";
import { cn } from "cn";
import { formatDate } from "@/lib/dates";
import type { EnergyPlan } from "../calc/energy";
import { formatWeight } from "../calc/units";
import type { Units } from "../types";

const kcal = (v: number) => v.toLocaleString("en-GB");

/** BMR → TDEE → target, with the expected pace and any safety warnings. */
export function PlanSummary({ plan, units, className }: { plan: EnergyPlan; units: Units; className?: string }) {
  const pace = plan.weeklyChangeKg;
  return (
    <div className={cn("space-y-3", className)}>
      <div className="rounded-2xl bg-primary p-4 text-primary-foreground shadow-card">
        <div className="text-xs font-medium text-primary-foreground/80">Your daily calorie target</div>
        <div className="mt-1 flex items-baseline gap-1.5">
          <span className="text-4xl font-semibold tracking-tight tabular">{kcal(plan.target)}</span>
          <span className="text-sm font-medium text-primary-foreground/80">kcal</span>
        </div>
        <div className="mt-1 text-sm text-primary-foreground/85">
          {Math.abs(pace) < 0.02
            ? "Holds your weight steady"
            : `About ${formatWeight(Math.abs(pace), units)} ${pace < 0 ? "lost" : "gained"} a week`}
          {plan.projectedDate ? ` · goal around ${formatDate(plan.projectedDate)}` : null}
        </div>
      </div>
      <dl className="grid grid-cols-3 gap-2 text-center">
        {[
          { label: "BMR", value: plan.bmr, hint: "at rest" },
          { label: "TDEE", value: plan.tdee, hint: "maintenance" },
          { label: plan.adjustment < 0 ? "Deficit" : "Surplus", value: Math.abs(plan.adjustment), hint: "per day" },
        ].map((s) => (
          <div key={s.label} className="rounded-xl bg-muted/60 px-2 py-2.5">
            <dt className="text-[11px] font-medium text-muted-foreground">{s.label}</dt>
            <dd className="text-base font-semibold tabular">{kcal(s.value)}</dd>
            <dd className="text-[11px] text-muted-foreground">{s.hint}</dd>
          </div>
        ))}
      </dl>
      {plan.warnings.map((w) => (
        <p
          key={w.message}
          role={w.level === "caution" ? "alert" : undefined}
          className={cn(
            "flex gap-2 rounded-xl px-3 py-2.5 text-sm",
            w.level === "caution" ? "bg-warning-soft text-foreground" : "bg-muted/60 text-muted-foreground",
          )}
        >
          {w.level === "caution" ? (
            <AlertTriangleIcon className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
          ) : (
            <InfoIcon className="mt-0.5 size-4 shrink-0" aria-hidden />
          )}
          {w.message}
        </p>
      ))}
    </div>
  );
}

export function MedicalNote({ className }: { className?: string }) {
  return (
    <p className={cn("flex gap-2 text-xs text-muted-foreground", className)}>
      <StethoscopeIcon className="mt-0.5 size-3.5 shrink-0" aria-hidden />
      <span>
        <strong className="font-medium text-foreground">General guidance, not medical advice.</strong> Targets are estimates from
        standard formulas. Check with a doctor before big changes, especially if you&apos;re pregnant, under 18, or managing a
        health condition.
      </span>
    </p>
  );
}
