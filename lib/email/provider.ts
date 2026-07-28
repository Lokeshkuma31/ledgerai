/**
 * The Email Provider contract — every mailbox integration (real or mock)
 * implements exactly this interface. engine.ts and registry.ts only ever
 * talk to a provider through these methods; neither imports a specific
 * provider's own module, so a provider is a drop-in the rest of the
 * framework never has to change for. The same shape a real Gmail API,
 * Microsoft Graph, IMAP, Exchange, Yahoo Mail, or webhook-based provider
 * would implement against unchanged — only fetchEmails()'s internals
 * differ between a mock and a real provider.
 */
import type { EmailProviderHealth, EmailProviderMetadata, EmailProviderStatusSnapshot, EmailSyncType, RawEmail } from "@/lib/email/types";

export interface EmailProvider {
  readonly id: string;
  readonly name: string;
  readonly version: string;

  /** Establishes a connection. In this milestone every provider is a mock
   * with no real OAuth/credential flow — see plugins/gmail/mock-provider.ts
   * — but the signature is what a real provider's auth flow would
   * implement against unchanged. */
  connect(): Promise<void>;
  disconnect(): Promise<void>;

  /** Fetches messages for the given sync type. Must never throw for an
   * expected condition (e.g. no new mail) — that's a successful fetch with
   * zero results, not a failure. Only throw for a genuine fetch failure;
   * engine.ts records that as a failed EmailImportRun. */
  fetchEmails(syncType: EmailSyncType): Promise<RawEmail[]>;

  health(): Promise<EmailProviderHealth>;
  status(): Promise<EmailProviderStatusSnapshot>;
  metadata(): EmailProviderMetadata;
}
