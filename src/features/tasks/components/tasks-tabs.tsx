import Link from "next/link";
import { cn } from "cn";

export function TasksTabs({ active }: { active: "tasks" | "shopping" }) {
  const tabs = [
    { key: "tasks", href: "/tasks", label: "Tasks" },
    { key: "shopping", href: "/shopping", label: "Shopping" },
  ] as const;
  return (
    <nav aria-label="Tasks and shopping" className="mb-4 grid grid-cols-2 gap-1 rounded-xl bg-muted p-1">
      {tabs.map((t) => (
        <Link
          key={t.key}
          href={t.href}
          aria-current={active === t.key ? "page" : undefined}
          className={cn(
            "flex h-10 items-center justify-center rounded-lg text-sm font-medium transition-colors",
            active === t.key ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
