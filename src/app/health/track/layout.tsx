import type { ReactNode } from "react";
import { SubTabs } from "@/features/health/components/sub-tabs";

const TABS = [
  { href: "/health/track", label: "Food & water" },
  { href: "/health/track/weight", label: "Weight" },
  { href: "/health/track/body", label: "Body" },
  { href: "/health/track/badges", label: "Badges" },
];

export default function TrackLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <SubTabs label="Track" tabs={TABS} />
      {children}
    </>
  );
}
