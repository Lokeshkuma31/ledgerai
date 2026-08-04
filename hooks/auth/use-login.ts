"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { authClient } from "@/lib/auth/auth-client";
import { toAppError } from "@/lib/auth/auth-error-mapper";
import { queryKeys } from "@/lib/react-query/keys";

export interface LoginInput {
  email: string;
  password: string;
}

/**
 * Wraps authClient.signIn.email (Better Auth's own client SDK — there is
 * no separate custom Route Handler to build here; Better Auth's catch-all
 * at app/api/auth/[...all]/route.ts already owns login) in a mutation so
 * the rest of the app interacts with it the same way it does every other
 * domain: `mutate`, `isPending`, a typed `error`, and a cache invalidation
 * on success rather than a manual `router.refresh()`.
 */
export function useLogin() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: LoginInput) => {
      const result = await authClient.signIn.email(input);
      if (result.error) throw toAppError(result.error);
      return result.data;
    },
    onSuccess: () => {
      // /api/me now reflects a real session — refetch rather than trust
      // a locally-constructed user object, since it also resolves
      // organizationId/role that signIn's own response doesn't carry.
      queryClient.invalidateQueries({ queryKey: queryKeys.auth.currentUser() });
    },
  });
}
