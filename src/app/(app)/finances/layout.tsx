import type { ReactNode } from "react";
import { FinanceTabs } from "@/features/finance/components/finance-tabs";

export default function FinanceLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <FinanceTabs />
      {children}
    </>
  );
}
