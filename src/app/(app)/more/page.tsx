import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRightIcon } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { Badge } from "@/components/ui/badge";
import { MORE_NAV } from "@/components/layout/nav-items";
import { MODULE_STATUS } from "@/features/module-status";

export const metadata: Metadata = { title: "More" };

export default function MorePage() {
  return (
    <div>
      <PageHeader title="More" description="Everything else for running the household." />
      <ul className="divide-y overflow-hidden rounded-2xl bg-card shadow-card ring-1 ring-border/80">
        {MORE_NAV.map((item) => {
          const status = MODULE_STATUS[item.href];
          return (
            <li key={item.href}>
              <Link href={item.href} className="flex min-h-[68px] items-center gap-4 px-4 py-3 transition-colors hover:bg-muted/60">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-accent text-accent-foreground">
                  <item.icon className="size-5" aria-hidden />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2 font-medium">
                    {item.label}
                    {status && status !== "available" ? (
                      <Badge variant="outline" className="text-[10px]">
                        {status}
                      </Badge>
                    ) : null}
                  </span>
                  <span className="block truncate text-sm text-muted-foreground">{item.description}</span>
                </span>
                <ChevronRightIcon className="size-4 text-muted-foreground" aria-hidden />
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
