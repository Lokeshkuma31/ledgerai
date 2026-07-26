import type { IndexedObject, SearchFilters } from "@/types/index";

export function filterByType(objects: IndexedObject[], types?: IndexedObject["type"][]): IndexedObject[] {
  if (!types || types.length === 0) return objects;
  const set = new Set(types);
  return objects.filter((o) => set.has(o.type));
}

export function filterByCategory(objects: IndexedObject[], category?: string): IndexedObject[] {
  if (!category) return objects;
  return objects.filter((o) => o.category?.toLowerCase() === category.toLowerCase());
}

export function filterByMerchant(objects: IndexedObject[], merchant?: string): IndexedObject[] {
  if (!merchant) return objects;
  const lower = merchant.toLowerCase();
  return objects.filter((o) => o.merchant?.toLowerCase() === lower);
}

export function filterByDateRange(
  objects: IndexedObject[],
  dateRange?: { start: string; end: string },
): IndexedObject[] {
  if (!dateRange) return objects;
  return objects.filter((o) => o.date !== undefined && o.date >= dateRange.start && o.date <= dateRange.end);
}

export function filterByAmountRange(
  objects: IndexedObject[],
  amountRange?: { min?: number; max?: number },
): IndexedObject[] {
  if (!amountRange) return objects;
  return objects.filter((o) => {
    if (o.amount === undefined) return false;
    if (amountRange.min !== undefined && o.amount < amountRange.min) return false;
    if (amountRange.max !== undefined && o.amount > amountRange.max) return false;
    return true;
  });
}

/** Composes every filter — order doesn't affect the result since each
 * filter only narrows, but cheapest/most-selective (type) runs first. */
export function applyFilters(objects: IndexedObject[], filters?: SearchFilters): IndexedObject[] {
  if (!filters) return objects;
  let result = filterByType(objects, filters.types);
  result = filterByCategory(result, filters.category);
  result = filterByMerchant(result, filters.merchant);
  result = filterByDateRange(result, filters.dateRange);
  result = filterByAmountRange(result, filters.amountRange);
  return result;
}
