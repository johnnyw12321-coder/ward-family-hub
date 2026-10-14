"use client";

import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { ResponsiveModal } from "./responsive-modal";

/**
 * A button that opens a responsive modal. `children` receives a close()
 * callback so forms can dismiss the modal after saving.
 */
export function ModalButton({
  label,
  title,
  description,
  children,
  variant = "default",
  size = "default",
  className,
}: {
  label: ReactNode;
  title: string;
  description?: string;
  children: (close: () => void) => ReactNode;
  variant?: "default" | "outline" | "secondary" | "ghost";
  size?: "default" | "sm" | "lg" | "icon";
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant={variant} size={size} className={className} onClick={() => setOpen(true)}>
        {label}
      </Button>
      <ResponsiveModal open={open} onOpenChange={setOpen} title={title} description={description}>
        {open ? children(() => setOpen(false)) : null}
      </ResponsiveModal>
    </>
  );
}
