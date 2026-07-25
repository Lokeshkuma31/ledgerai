"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { getMemoryEntries } from "@/lib/ai/memory";
import { getBudgets } from "@/lib/budget/storage";
import { buildFinancialState } from "@/lib/intelligence/orchestrator";
import { getTransactions } from "@/lib/storage";
import type { FinancialState } from "@/types/financial-state";

interface DashboardContextValue {
  state: FinancialState | null;
  isLoading: boolean;
  /** Reloads raw data from storage and rebuilds the FinancialState. */
  refresh: () => void;
}

const DashboardContext = createContext<DashboardContextValue | null>(null);

export function useDashboard(): DashboardContextValue {
  const context = useContext(DashboardContext);
  if (!context) {
    throw new Error("useDashboard must be used within a DashboardProvider");
  }
  return context;
}

/**
 * Owns the Dashboard's only round trip through storage and the Financial
 * Intelligence Orchestrator. Everything downstream — DashboardLayout,
 * DashboardSections, and every card/list under them — reads exclusively
 * from the FinancialState this provides; none of them touch an engine or
 * localStorage directly.
 */
export default function DashboardProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [state, setState] = useState<FinancialState | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const refresh = useCallback(() => {
    setIsLoading(true);
    const transactions = getTransactions();
    const budgets = getBudgets();
    const memory = getMemoryEntries();
    buildFinancialState({ transactions, budgets, memory })
      .then((next) => setState(next))
      .finally(() => setIsLoading(false));
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return (
    <DashboardContext.Provider value={{ state, isLoading, refresh }}>
      {children}
    </DashboardContext.Provider>
  );
}
