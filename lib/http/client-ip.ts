/**
 * Best-effort client IP extraction for rate-limiting/audit purposes only —
 * never for authorization decisions. `x-forwarded-for` can be a
 * comma-separated chain (client, proxy1, proxy2, ...); the first entry is
 * the original client per the standard convention Vercel's edge network
 * also follows.
 */
export function getClientIp(request: Request): string {
  const forwardedFor = request.headers.get("x-forwarded-for");
  const first = forwardedFor?.split(",")[0]?.trim();
  return first || "unknown";
}
