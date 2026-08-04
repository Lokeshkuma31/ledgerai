/**
 * Centralized React Query key factory — one namespace per domain, so
 * `queryClient.invalidateQueries({ queryKey: queryKeys.transactions.all })`
 * reads the same way everywhere and a typo can't silently create a
 * second, never-invalidated cache entry. Every future domain's hooks add
 * their own top-level key here, following the auth section's shape:
 * a `.all` root plus specific sub-keys nested under it.
 */
export const queryKeys = {
  auth: {
    all: ["auth"] as const,
    currentUser: () => [...queryKeys.auth.all, "currentUser"] as const,
  },
  // Next domain (Transactions) adds, e.g.:
  // transactions: {
  //   all: ["transactions"] as const,
  //   list: (organizationId: string, filters?: TransactionFilters) =>
  //     [...queryKeys.transactions.all, "list", organizationId, filters] as const,
  //   detail: (organizationId: string, id: string) =>
  //     [...queryKeys.transactions.all, "detail", organizationId, id] as const,
  // },
};
