import {
  BarChart3Icon,
  CalculatorIcon,
  CalendarDaysIcon,
  CarIcon,
  FileLockIcon,
  HouseIcon,
  LayoutGridIcon,
  ListChecksIcon,
  SettingsIcon,
  TargetIcon,
  UsersIcon,
  WalletIcon,
  WarehouseIcon,
  type LucideIcon,
} from "lucide-react";

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  description?: string;
  /** "planned" sections exist as honest placeholders until their phase ships. */
  status?: "available" | "planned";
  phase?: number;
};

export const PRIMARY_NAV: NavItem[] = [
  { href: "/", label: "Home", icon: HouseIcon },
  { href: "/finances", label: "Finances", icon: WalletIcon },
  { href: "/calendar", label: "Calendar", icon: CalendarDaysIcon },
  { href: "/goals", label: "Goals", icon: TargetIcon },
  { href: "/more", label: "More", icon: LayoutGridIcon },
];

export const MORE_NAV: NavItem[] = [
  { href: "/tasks", label: "Tasks & shopping", icon: ListChecksIcon, description: "Chores, to-dos and the shared shopping list" },
  { href: "/documents", label: "Documents", icon: FileLockIcon, description: "Private vault for important papers" },
  { href: "/property", label: "Home & property", icon: WarehouseIcon, description: "Property, maintenance, appliances and warranties" },
  { href: "/vehicles", label: "Vehicles", icon: CarIcon, description: "Servicing, insurance, registration and costs" },
  { href: "/family", label: "Family", icon: UsersIcon, description: "Profiles, school, contacts and milestones" },
  { href: "/finances/planner", label: "Planner", icon: CalculatorIcon, description: "Play with income and spending what-ifs" },
  { href: "/reports", label: "Reports", icon: BarChart3Icon, description: "Spending, income and net worth over time" },
  { href: "/settings", label: "Settings", icon: SettingsIcon, description: "Profile, household, security and data" },
];

export function isActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  if (href === "/more")
    return (
      // The Planner lives under Finances, so the Finances tab owns it.
      MORE_NAV.some((i) => !i.href.startsWith("/finances") && pathname.startsWith(i.href)) ||
      ["/more", "/shopping", "/notifications"].some((p) => pathname.startsWith(p))
    );
  if (href === "/tasks") return pathname.startsWith("/tasks") || pathname.startsWith("/shopping");
  return pathname === href || pathname.startsWith(`${href}/`);
}
