import Link from "next/link";
import { AlertTriangleIcon, FileImageIcon, FileTextIcon, LockIcon, TriangleAlertIcon } from "lucide-react";
import { cn } from "cn";
import { diffDays, formatDate, type CalendarDate } from "@/lib/dates";
import type { DocumentCategory, DocumentRow } from "../queries";

export function expiryState(expiry: CalendarDate | null, today: CalendarDate, reminderDays: number): "expired" | "soon" | "ok" | null {
  if (!expiry) return null;
  const d = diffDays(expiry, today);
  if (d < 0) return "expired";
  if (d <= reminderDays) return "soon";
  return "ok";
}

export function DocumentItem({ doc, category, today }: { doc: DocumentRow; category?: DocumentCategory; today: CalendarDate }) {
  const image = doc.current_file?.mime_type.startsWith("image/");
  const Icon = image ? FileImageIcon : FileTextIcon;
  const exp = expiryState(doc.expiry_date, today, doc.expiry_reminder_days);
  return (
    <li>
      <Link href={`/documents/${doc.id}`} className="flex min-h-16 items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/60">
        <span className="relative flex size-10 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground" aria-hidden>
          <Icon className="size-5" />
          {doc.is_sensitive ? (
            <span className="absolute -right-1 -bottom-1 flex size-5 items-center justify-center rounded-full bg-card ring-1 ring-border">
              <LockIcon className="size-3 text-primary" />
            </span>
          ) : null}
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate font-medium">
            {doc.name}
            {doc.is_sensitive ? <span className="sr-only"> (sensitive)</span> : null}
          </div>
          <div className="flex flex-wrap gap-x-2 text-xs text-muted-foreground">
            <span>{category?.name ?? "Document"}</span>
            {!doc.current_file ? (
              <span className="inline-flex items-center gap-0.5 text-warning">
                <TriangleAlertIcon className="size-3" aria-hidden /> upload incomplete
              </span>
            ) : null}
            {doc.tags.length ? <span>#{doc.tags.slice(0, 3).join(" #")}</span> : null}
          </div>
        </div>
        {exp && exp !== "ok" ? (
          <span className={cn("inline-flex shrink-0 items-center gap-1 text-xs font-medium", exp === "expired" ? "text-destructive" : "text-warning")}>
            <AlertTriangleIcon className="size-3.5" aria-hidden />
            {exp === "expired" ? "Expired" : `Expires ${formatDate(doc.expiry_date)}`}
          </span>
        ) : doc.expiry_date ? (
          <span className="shrink-0 text-xs text-muted-foreground">to {formatDate(doc.expiry_date)}</span>
        ) : null}
      </Link>
    </li>
  );
}
