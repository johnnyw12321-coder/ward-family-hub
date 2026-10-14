"use client";

import Link from "next/link";
import { LogOutIcon, MonitorIcon, MoonIcon, SettingsIcon, SunIcon } from "lucide-react";
import { useTheme } from "next-themes";
import { cn } from "cn";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { signOut } from "@/features/auth/actions";
import { memberColorClass } from "@/components/shared/member-color";

export function UserMenu({ name, email, color, householdName }: { name: string; email: string | null; color: string; householdName: string }) {
  const { theme, setTheme } = useTheme();
  const initials = name
    .split(/\s+/)
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="Account menu"
        className={cn(
          "flex size-10 items-center justify-center rounded-full text-sm font-semibold ring-2 ring-background transition-transform outline-none focus-visible:ring-ring active:scale-95",
          memberColorClass(color),
        )}
      >
        {initials}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel className="font-normal">
          <div className="font-medium">{name}</div>
          {email ? <div className="truncate text-xs text-muted-foreground">{email}</div> : null}
          <div className="mt-1 text-xs text-muted-foreground">{householdName}</div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="text-xs text-muted-foreground">Appearance</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={theme ?? "system"} onValueChange={setTheme}>
          <DropdownMenuRadioItem value="light">
            <SunIcon aria-hidden /> Light
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="dark">
            <MoonIcon aria-hidden /> Dark
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="system">
            <MonitorIcon aria-hidden /> System
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/settings">
            <SettingsIcon aria-hidden /> Settings
          </Link>
        </DropdownMenuItem>
        <form action={signOut}>
          <DropdownMenuItem asChild>
            <button type="submit" className="w-full">
              <LogOutIcon aria-hidden /> Sign out
            </button>
          </DropdownMenuItem>
        </form>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
