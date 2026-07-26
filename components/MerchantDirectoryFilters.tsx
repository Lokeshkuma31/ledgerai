"use client";

import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export type MerchantSortKey = "transactions" | "spend";

export interface MerchantDirectoryFilterState {
  search: string;
  sortBy: MerchantSortKey;
  category: string;
  industry: string;
}

const ALL = "all";

export default function MerchantDirectoryFilters({
  state,
  categories,
  industries,
  onChange,
}: {
  state: MerchantDirectoryFilterState;
  categories: string[];
  industries: string[];
  onChange: (next: MerchantDirectoryFilterState) => void;
}) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
      <Input
        placeholder="Search merchants…"
        value={state.search}
        onChange={(e) => onChange({ ...state, search: e.target.value })}
        className="sm:max-w-52"
      />
      <Select
        value={state.sortBy}
        onValueChange={(value) =>
          value && onChange({ ...state, sortBy: value as MerchantSortKey })
        }
      >
        <SelectTrigger className="sm:w-44">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="transactions">Most Transactions</SelectItem>
          <SelectItem value="spend">Highest Spend</SelectItem>
        </SelectContent>
      </Select>
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
      <Select
        value={state.industry}
        onValueChange={(value) => value && onChange({ ...state, industry: value })}
      >
        <SelectTrigger className="sm:w-40">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>All Industries</SelectItem>
          {industries.map((industry) => (
            <SelectItem key={industry} value={industry}>
              {industry}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
