"use client";

// Side-effect import: registers the Bank Connector Framework's demo
// connectors, the same reason loadPlugins() is awaited below — without
// it, a Feed/Search/Coach contribution from a connector the user
// connected on /banks would only show up here if /banks happened to load
// first in the same session, since this whole orchestrator run (like
// everything reading localStorage) is client-side, not shared with a
// server-rendered page.
import "@/lib/banks/providers";

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
import { loadPlugins } from "@/lib/plugins/engine";
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
    // Plugins (e.g. feed/search contributors) must be registered before the
    // first FinancialState build so their contributions show up from the
    // very first render, not just after a later refresh().
    loadPlugins().finally(refresh);
  }, [refresh]);

  return (
    <DashboardContext.Provider value={{ state, isLoading, refresh }}>
      {children}
    </DashboardContext.Provider>
  );
}
