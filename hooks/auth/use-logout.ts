"use client";

import { useRouter } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { authClient } from "@/lib/auth/auth-client";
import { toAppError } from "@/lib/auth/auth-error-mapper";

/**
 * Wraps authClient.signOut. Clears the *entire* React Query cache on
 * success (not just the auth query) — every cached domain query
 * (transactions, budgets, ...) belongs to the now-signed-out user and
 * must not be visible if a different user signs in next in the same tab,
 * the same reason lib/connections/registry.ts never lets tokens leak
 * across users.
 */
export function useLogout() {
  const queryClient = useQueryClient();
  const router = useRouter();

  return useMutation({
    mutationFn: async () => {
      const result = await authClient.signOut();
      if (result.error) throw toAppError(result.error);
    },
    onSuccess: () => {
      queryClient.clear();
      router.push("/sign-in");
    },
  });
}
