/**
 * Gmail Provider — the first (and, in this milestone, only) EmailProvider
 * implementation. Demo data only: no OAuth, no Gmail API call, no network
 * request. Every method matches lib/email/provider.ts's EmailProvider
 * contract exactly, so a real Gmail API/Microsoft Graph/IMAP/Exchange/
 * Yahoo Mail provider can replace this file's internals without lib/email/
 * changing at all.
 */
import { registerEmailProvider } from "@/lib/email/registry";
import type { EmailProvider } from "@/lib/email/provider";
import type {
  EmailConnectionStatus,
  EmailProviderHealth,
  EmailProviderMetadata,
  EmailProviderStatusSnapshot,
  EmailSyncType,
  RawEmail,
} from "@/lib/email/types";
import { GMAIL_PROVIDER_ID, getAllMockEmails, getIncrementalMockEmails } from "@/plugins/gmail/mock-provider";

export { GMAIL_PROVIDER_ID };

/** Test-only scenario toggles — no real provider would expose these; they
 * let tests exercise connection/fetch failure paths without a second
 * class, mirroring lib/banks/providers.ts's DemoBankB. */
export interface GmailProviderOptions {
  failConnect?: boolean;
  failFetch?: boolean;
}

class GmailProvider implements EmailProvider {
  readonly id = GMAIL_PROVIDER_ID;
  readonly name = "Gmail (Mock)";
  readonly version = "1.0.0";

  private connection: EmailConnectionStatus = "disconnected";
  private connectionMessage = "Not yet connected.";

  constructor(private readonly options: GmailProviderOptions = {}) {}

  async connect(): Promise<void> {
    if (this.options.failConnect) {
      this.connection = "error";
      this.connectionMessage = "Simulated connection failure.";
      throw new Error("Gmail (Mock): connection failed (simulated).");
    }
    this.connection = "connected";
    this.connectionMessage = "Connected.";
  }

  async disconnect(): Promise<void> {
    this.connection = "disconnected";
    this.connectionMessage = "Disconnected by user.";
  }

  async fetchEmails(syncType: EmailSyncType): Promise<RawEmail[]> {
    if (this.connection !== "connected") {
      throw new Error("Gmail (Mock): not connected. Call connect() before fetching.");
    }
    if (this.options.failFetch) {
      throw new Error("Gmail (Mock): fetch failed (simulated upstream outage).");
    }
    return syncType === "incremental" ? getIncrementalMockEmails() : getAllMockEmails();
  }

  async health(): Promise<EmailProviderHealth> {
    const checkedAt = new Date().toISOString();
    if (this.connection === "connected") return { status: "healthy", message: "Connected.", checkedAt };
    if (this.connection === "error") return { status: "error", message: this.connectionMessage, checkedAt };
    return { status: "disconnected", message: this.connectionMessage, checkedAt };
  }

  async status(): Promise<EmailProviderStatusSnapshot> {
    return { connection: this.connection, message: this.connectionMessage, updatedAt: new Date().toISOString() };
  }

  metadata(): EmailProviderMetadata {
    return { description: "Mock Gmail connector — demo data only, validates the Email Intelligence Framework end-to-end.", websiteUrl: "https://mail.google.com" };
  }
}

export function createGmailProvider(options?: GmailProviderOptions): EmailProvider {
  return new GmailProvider(options);
}

/** The singleton instance the app registers — a provider holds mutable
 * connection state, so the app needs to keep talking to the same object it
 * registered. Tests needing failure injection should use
 * createGmailProvider() instead (see lib/banks/providers.ts's identical
 * singleton-vs-factory split). */
const gmailProvider = createGmailProvider();
registerEmailProvider(gmailProvider);
