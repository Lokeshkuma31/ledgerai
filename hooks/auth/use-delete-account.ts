"use client";

import { useRouter } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/react-query/api-client";

/**
 * DELETE /api/me — same cache-clearing/redirect shape as useLogout, since a
 * deleted account is also, necessarily, a signed-out one. See the route
 * handler's doc comment for what actually gets deleted.
 */
export function useDeleteAccount() {
  const queryClient = useQueryClient();
  const router = useRouter();

  return useMutation({
    mutationFn: (confirmEmail: string) =>
      apiClient<void>("/api/me", { method: "DELETE", body: { confirm: confirmEmail } }),
    onSuccess: () => {
      queryClient.clear();
      router.push("/sign-in");
    },
  });
}
