"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { authClient } from "@/lib/auth/auth-client";
import { toAppError } from "@/lib/auth/auth-error-mapper";
import { queryKeys } from "@/lib/react-query/keys";

export interface SignupInput {
  email: string;
  password: string;
  name: string;
}

/** Wraps authClient.signUp.email — see use-login.ts for why there's no
 * separate custom Route Handler. A successful sign-up also runs
 * lib/auth/better-auth.ts's databaseHooks.user.create.after (personal
 * Organization + OWNER Membership + the 4 built-in workflows seeded),
 * which is exactly why onSuccess refetches /api/me rather than
 * constructing a user object locally — the organizationId doesn't exist
 * until that hook runs server-side. */
export function useSignup() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: SignupInput) => {
      const result = await authClient.signUp.email(input);
      if (result.error) throw toAppError(result.error);
      return result.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.auth.currentUser() });
    },
  });
}
