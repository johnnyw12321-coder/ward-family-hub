"use client";

import { useDeferredValue, useMemo, useState } from "react";
import Link from "next/link";
import { ChevronRightIcon, SearchIcon, SearchXIcon } from "lucide-react";
import { cn } from "cn";
import { EmptyState } from "@/components/shared/empty-state";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { NativeSelect } from "@/components/ui/native-select";
import { EQUIPMENT, EXERCISES, MUSCLE_GROUPS, type Equipment, type MuscleGroup } from "../catalog/exercises";
import { searchFoods as searchByName } from "../catalog/foods";

export function ExerciseLibrary() {
  const [q, setQ] = useState("");
  const [muscle, setMuscle] = useState<MuscleGroup | "">("");
  const [equipment, setEquipment] = useState<Equipment | "home" | "">("");
  const query = useDeferredValue(q);
  const list = useMemo(() => {
    const filtered = EXERCISES.filter(
      (e) =>
        (!muscle || e.primary === muscle || e.secondary.includes(muscle)) &&
        (!equipment || (equipment === "home" ? ["bodyweight", "dumbbell", "kettlebell", "band"].includes(e.equipment) : e.equipment === equipment)),
    ).map((e) => ({ ...e, aliases: `${MUSCLE_GROUPS[e.primary]} ${EQUIPMENT[e.equipment]}` }));
    return query ? searchByName(filtered, query, 200) : filtered.sort((a, b) => a.name.localeCompare(b.name));
  }, [query, muscle, equipment]);

  return (
    <div className="space-y-4">
      <div className="space-y-2 rounded-2xl bg-card p-4 shadow-card ring-1 ring-border/80">
        <InputGroup>
          <InputGroupAddon>
            <SearchIcon aria-hidden />
          </InputGroupAddon>
          <InputGroupInput type="search" placeholder="Search exercises" aria-label="Search exercises" value={q} onChange={(e) => setQ(e.target.value)} />
        </InputGroup>
        <div className="grid grid-cols-2 gap-2">
          <NativeSelect aria-label="Muscle group" value={muscle} onChange={(e) => setMuscle(e.target.value as MuscleGroup | "")}>
            <option value="">All muscles</option>
            {Object.entries(MUSCLE_GROUPS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </NativeSelect>
          <NativeSelect aria-label="Equipment" value={equipment} onChange={(e) => setEquipment(e.target.value as Equipment | "home" | "")}>
            <option value="">Any equipment</option>
            <option value="home">Home-friendly</option>
            {Object.entries(EQUIPMENT).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </NativeSelect>
        </div>
      </div>
      <p className="px-1 text-sm text-muted-foreground" aria-live="polite">
        {list.length} exercises
      </p>
      {list.length ? (
        <ul className="divide-y overflow-hidden rounded-2xl bg-card shadow-card ring-1 ring-border/80">
          {list.map((e) => (
            <li key={e.key}>
              <Link href={`/health/workouts/exercises/${e.key}`} className={cn("flex min-h-14 items-center gap-3 px-4 py-2 transition-colors hover:bg-muted/50")}>
                <span className="min-w-0 flex-1">
                  <span className="block font-medium">{e.name}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {MUSCLE_GROUPS[e.primary]}
                    {e.secondary.length ? ` + ${e.secondary.map((m) => MUSCLE_GROUPS[m].toLowerCase()).join(", ")}` : ""} · {EQUIPMENT[e.equipment]}
                  </span>
                </span>
                <ChevronRightIcon className="size-4 text-muted-foreground" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState icon={SearchXIcon} title="No exercises match" description="Try another search or filter." />
      )}
    </div>
  );
}
