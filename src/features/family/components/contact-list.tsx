import { MailIcon, PhoneIcon, SirenIcon, Trash2Icon } from "lucide-react";
import { ConfirmAction } from "@/components/shared/confirm-action";
import { deleteContact } from "../actions";
import type { FamilyContact } from "../queries";
import { EditContactButton } from "./family-forms";

export function ContactList({ contacts, canWrite }: { contacts: FamilyContact[]; canWrite: boolean }) {
  if (!contacts.length) {
    return <p className="rounded-2xl bg-card p-4 text-sm text-muted-foreground shadow-card ring-1 ring-border/80">No contacts yet.</p>;
  }
  return (
    <ul className="divide-y rounded-2xl bg-card shadow-card ring-1 ring-border/80">
      {contacts.map((c) => (
        <li key={c.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
          {c.is_emergency ? <SirenIcon className="size-4 shrink-0 text-destructive" aria-label="Emergency contact" /> : <span className="w-4" aria-hidden />}
          <div className="min-w-0 flex-1">
            <div className="font-medium">{c.name}</div>
            <div className="truncate text-xs text-muted-foreground">{[c.relationship, c.notes].filter(Boolean).join(" · ") || " "}</div>
          </div>
          {c.phone ? (
            <a href={`tel:${c.phone.replace(/[^\d+]/g, "")}`} className="flex size-10 items-center justify-center rounded-full text-primary hover:bg-muted" aria-label={`Call ${c.name}`}>
              <PhoneIcon className="size-4" />
            </a>
          ) : null}
          {c.email ? (
            <a href={`mailto:${c.email}`} className="flex size-10 items-center justify-center rounded-full text-primary hover:bg-muted" aria-label={`Email ${c.name}`}>
              <MailIcon className="size-4" />
            </a>
          ) : null}
          {canWrite ? (
            <>
              <EditContactButton
                initial={{
                  id: c.id,
                  familyMemberId: c.family_member_id ?? "",
                  name: c.name,
                  relationship: c.relationship ?? "",
                  phone: c.phone ?? "",
                  email: c.email ?? "",
                  isEmergency: c.is_emergency,
                  notes: c.notes ?? "",
                }}
              />
              <ConfirmAction
                action={deleteContact.bind(null, c.id)}
                trigger={<Trash2Icon aria-label={`Remove ${c.name}`} />}
                title={`Remove ${c.name}?`}
                description="This can't be undone."
                confirmLabel="Remove"
                variant="ghost"
                size="icon"
              />
            </>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
