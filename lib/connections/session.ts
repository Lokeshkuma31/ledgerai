/**
 * Session — the short-lived, single-use cookie that bridges the two
 * separate HTTP requests an OAuth redirect round-trip spans (the
 * authorize Route Handler's redirect out, and the callback Route
 * Handler's redirect back in). Holds only a CSRF `state` value and a PKCE
 * `codeVerifier` — never a token, never a client secret — but is still
 * set httpOnly + secure + sameSite=lax so it's inaccessible to page
 * JavaScript and never sent cross-site.
 *
 * This app has no user-account/login system (every framework here assumes
 * a single local user), so this is deliberately narrower than a general
 * "user session" — it exists only for the duration of one OAuth attempt
 * and is deleted the moment it's read.
 */
import { cookies } from "next/headers";
import type { ProviderId } from "@/lib/connections/types";

const COOKIE_NAME = "ch_oauth_session";
const MAX_AGE_SECONDS = 600; // 10 minutes — generous for a user to complete consent

export interface OAuthSessionPayload {
  provider: ProviderId;
  state: string;
  codeVerifier: string;
  /** Set when this attempt is a Reconnect for an existing connection. */
  reconnectId?: string;
  /** Where the callback should send the browser back to. */
  redirectAfter: string;
}

export async function createOAuthSessionCookie(payload: OAuthSessionPayload): Promise<void> {
  const store = await cookies();
  store.set(COOKIE_NAME, JSON.stringify(payload), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  });
}

/** Reads and immediately deletes the cookie — single use, exactly like
 * the `state`/`code_verifier` it carries. Returns null if missing or
 * malformed rather than throwing, so the callback route can render a
 * clear "session expired, try connecting again" outcome. */
export async function readAndClearOAuthSessionCookie(): Promise<OAuthSessionPayload | null> {
  const store = await cookies();
  const raw = store.get(COOKIE_NAME)?.value;
  store.delete(COOKIE_NAME);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as OAuthSessionPayload;
  } catch {
    return null;
  }
}
