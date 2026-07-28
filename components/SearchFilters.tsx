"use client";

import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { IndexObjectType, SearchSortMode } from "@/types/index";

export interface SearchFilterState {
  types: IndexObjectType[]; // empty = all types
  category: string; // "all" or a category name
  merchant: string;
  dateStart: string;
  dateEnd: string;
  amountMin: string;
  amountMax: string;
  sortBy: SearchSortMode;
}

export function emptySearchFilterState(): SearchFilterState {
  return {
    types: [],
    category: "all",
    merchant: "",
    dateStart: "",
    dateEnd: "",
    amountMin: "",
    amountMax: "",
    sortBy: "relevance",
  };
}

const ALL = "all";

const TYPE_LABELS: Record<IndexObjectType, string> = {
  transaction: "Transactions",
  merchant: "Merchants",
  "merchant-profile": "Merchant Profiles",
  category: "Categories",
  "timeline-entry": "Timeline",
  budget: "Budgets",
  "financial-event": "Events",
  recommendation: "Recommendations",
  "recurring-transaction": "Recurring",
  "forecast-summary": "Forecast",
  conversation: "Past Questions",
  explanation: "Explanations",
  workflow: "Workflow Runs",
  "bank-account": "Bank Accounts",
  "bank-institution": "Bank Institutions",
  "bank-sync-run": "Bank Syncs",
  consent: "Consents",
  document: "Documents",
  email: "Emails",
};

const SORT_LABELS: Record<SearchSortMode, string> = {
  relevance: "Sort by Relevance",
  date: "Sort by Date",
  amount: "Sort by Amount",
};

function toggleType(types: IndexObjectType[], type: IndexObjectType): IndexObjectType[] {
  return types.includes(type) ? types.filter((t) => t !== type) : [...types, type];
}

export default function SearchFilters({
  state,
  categories,
  onChange,
}: {
  state: SearchFilterState;
  categories: string[];
  onChange: (next: SearchFilterState) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-1.5">
        {(Object.keys(TYPE_LABELS) as IndexObjectType[]).map((type) => {
          const active = state.types.includes(type);
          return (
            <button
              key={type}
              type="button"
              onClick={() => onChange({ ...state, types: toggleType(state.types, type) })}
              className={`rounded-full px-2.5 py-1 text-xs transition-colors ${
                active
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:text-foreground"
              }`}
            >
              {TYPE_LABELS[type]}
            </button>
          );
        })}
      </div>
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
        <Select
          value={state.category}
          onValueChange={(value) => value && onChange({ ...state, category: value })}
        >
          <SelectTrigger className="sm:w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All Categories</SelectItem>
            {categories.map((category) => (
              <SelectItem key={category} value={category}>
                {category}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          placeholder="Merchant…"
          value={state.merchant}
          onChange={(e) => onChange({ ...state, merchant: e.target.value })}
          className="sm:max-w-40"
        />
        <Input
          type="date"
          value={state.dateStart}
          onChange={(e) => onChange({ ...state, dateStart: e.target.value })}
          className="sm:w-36"
        />
        <Input
          type="date"
          value={state.dateEnd}
          onChange={(e) => onChange({ ...state, dateEnd: e.target.value })}
          className="sm:w-36"
        />
        <Input
          type="number"
          placeholder="Min ₹"
          value={state.amountMin}
          onChange={(e) => onChange({ ...state, amountMin: e.target.value })}
          className="sm:w-24"
        />
        <Input
          type="number"
          placeholder="Max ₹"
          value={state.amountMax}
          onChange={(e) => onChange({ ...state, amountMax: e.target.value })}
          className="sm:w-24"
        />
        <Select
          value={state.sortBy}
          onValueChange={(value) => value && onChange({ ...state, sortBy: value as SearchSortMode })}
        >
          <SelectTrigger className="sm:w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(SORT_LABELS) as SearchSortMode[]).map((key) => (
              <SelectItem key={key} value={key}>
                {SORT_LABELS[key]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
