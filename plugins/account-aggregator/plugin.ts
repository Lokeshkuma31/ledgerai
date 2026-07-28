/**
 * Account Aggregator Plugin — the Plugin Framework extension wrapping this
 * connector, mirroring how plugins/android-sms/plugin.ts is the only file
 * outside its own directory other modules talk to. Registers the
 * BankConnector (via connector.ts's side effect), then contributes exactly
 * the Feed/Index/Coach content the generic Bank Connector Framework
 * integration (lib/banks/sync-engine.ts) doesn't already cover generically
 * for every connector — Consent Granted/Expired feed items and Consent
 * Records in the Financial Semantic Index. "New account connected",
 * "Synchronization complete", "Refresh complete", and "Sync failed" feed
 * items are already produced for this connector by sync-engine.ts's own
 * generic contributor, since registerConnector() covers it; duplicating
 * them here would double the feed.
 */
import { registerFeedContributor } from "@/lib/feed/engine";
import { registerIndexContributor } from "@/lib/index";
import { registerCoachImportSummaryContributor, type CoachImportSummaryContribution } from "@/lib/coach/contributors";
import { setConnectorEnabled } from "@/lib/banks/registry";
import { ACCOUNT_AGGREGATOR_CONNECTOR_ID } from "@/plugins/account-aggregator/connector";
import { getConsent } from "@/plugins/account-aggregator/consent";
import { getLatest } from "@/plugins/account-aggregator/sync";
import type { Plugin, PluginCapability, PluginHealth } from "@/types/plugin";
import type { FeedItem } from "@/types/feed";
import type { IndexedObject } from "@/types/index";

const PLUGIN_ID = "account-aggregator";
const PLUGIN_NAME = "Account Aggregator";

// --- Feed / Search / Coach contributions -----------------------------------

function buildConsentFeedItems(): FeedItem[] {
  const consent = getConsent();
  if (!consent) return [];
  const now = new Date().toISOString();

  if (consent.status === "Granted") {
    return [
      {
        id: `plugin:${PLUGIN_ID}:consent:${consent.id}:granted`,
        type: "system-insight",
        title: "Consent granted",
        summary: `Consent granted for ${consent.linkedAccounts.length} account(s) via ${consent.provider}.`,
        priority: 0, // recomputed by lib/feed/prioritizer.ts
        severity: "info",
        sourceEngine: "feed",
        relatedObjectIds: [],
        explanationId: null,
        confidence: 1,
        createdAt: now,
        expiresAt: null,
        isRead: false,
        isPinned: false,
        isDismissed: false,
        metadata: { pluginId: PLUGIN_ID, consentId: consent.id, linkedAccounts: consent.linkedAccounts.length },
      },
    ];
  }
  if (consent.status === "Expired") {
    return [
      {
        id: `plugin:${PLUGIN_ID}:consent:${consent.id}:expired`,
        type: "system-insight",
        title: "Consent expired",
        summary: `Your Account Aggregator consent has expired — reconnect to keep syncing ${consent.linkedAccounts.length} account(s).`,
        priority: 0,
        severity: "warning",
        sourceEngine: "feed",
        relatedObjectIds: [],
        explanationId: null,
        confidence: 1,
        createdAt: now,
        expiresAt: null,
        isRead: false,
        isPinned: false,
        isDismissed: false,
        metadata: { pluginId: PLUGIN_ID, consentId: consent.id },
      },
    ];
  }
  return [];
}

function buildConsentIndexObjects(): IndexedObject[] {
  const consent = getConsent();
  if (!consent) return [];
  return [
    {
      id: `consent:${consent.id}`,
      type: "consent",
      title: `Account Aggregator consent — ${consent.status}`,
      description: `${consent.purpose}; ${consent.linkedAccounts.length} linked account(s); permissions: ${consent.permissions.join(", ")}.`,
      keywords: ["consent", "account aggregator", consent.status, consent.provider],
      date: consent.createdAt.slice(0, 10),
      tags: ["consent", consent.status.toLowerCase()],
      metadata: { consentId: consent.id, status: consent.status, linkedAccounts: consent.linkedAccounts },
      createdAt: consent.createdAt,
      updatedAt: consent.lastUpdated,
      searchableText: `consent account aggregator ${consent.status} ${consent.purpose}`.toLowerCase(),
    },
  ];
}

/** Structured, pre-computed facts for the AI Financial Coach — it only
 * narrates these, never infers anything from raw consent/sync data itself. */
function getCoachSummary(): CoachImportSummaryContribution | null {
  const consent = getConsent();
  const latest = getLatest();
  if (!consent && !latest) return null;

  const totalMessages = latest
    ? latest.transactionsImported + latest.transactionsUpdated + latest.duplicatesIgnored
    : 0;
  return {
    pluginName: PLUGIN_NAME,
    totalMessages,
    importedCount: latest?.transactionsImported ?? 0,
    duplicateCount: latest?.duplicatesIgnored ?? 0,
    failedCount: latest?.errors.length ?? 0,
    lastImportAt: latest?.completedAt ?? null,
  };
}

// --- Plugin Framework registration ------------------------------------------

class AccountAggregatorPlugin implements Plugin {
  readonly id = PLUGIN_ID;
  readonly name = PLUGIN_NAME;
  readonly version = "1.0.0";
  readonly author = "LedgerAI";
  readonly description =
    "Account Aggregator provider connector — validates the Bank Connector Framework's consent, discovery, and synchronization lifecycle end-to-end using mock provider responses only.";
  enabled = true;

  private unregisterFeed: (() => void) | null = null;
  private unregisterIndex: (() => void) | null = null;
  private unregisterCoach: (() => void) | null = null;

  capabilities(): PluginCapability[] {
    return ["transaction-source", "feed-generator", "search-provider"];
  }

  register(): void {
    this.unregisterFeed = registerFeedContributor(buildConsentFeedItems);
    this.unregisterIndex = registerIndexContributor(buildConsentIndexObjects);
    this.unregisterCoach = registerCoachImportSummaryContributor(getCoachSummary);
  }

  unregister(): void {
    this.unregisterFeed?.();
    this.unregisterIndex?.();
    this.unregisterCoach?.();
    this.unregisterFeed = null;
    this.unregisterIndex = null;
    this.unregisterCoach = null;
  }

  /** Ties the connector's own enabled state to the plugin's, so disabling
   * this plugin from /plugins also stops the connector from being synced
   * (setConnectorEnabled(false) makes runSync() refuse) without the two
   * frameworks otherwise sharing any state. */
  initialize(): void {
    setConnectorEnabled(ACCOUNT_AGGREGATOR_CONNECTOR_ID, true);
  }

  shutdown(): void {
    setConnectorEnabled(ACCOUNT_AGGREGATOR_CONNECTOR_ID, false);
  }

  async health(): Promise<PluginHealth> {
    const checkedAt = new Date().toISOString();
    if (!this.enabled) {
      return { status: "disabled", message: "Plugin is disabled.", checkedAt };
    }
    const consent = getConsent();
    if (!consent) {
      return { status: "warning", message: "No consent requested yet.", checkedAt };
    }
    switch (consent.status) {
      case "Denied":
        return { status: "error", message: "Consent was denied.", checkedAt };
      case "Expired":
        return { status: "warning", message: "Consent has expired — reconnect required.", checkedAt };
      case "Revoked":
        return { status: "warning", message: "Consent was revoked.", checkedAt };
      case "Pending":
        return { status: "warning", message: "Consent is pending approval.", checkedAt };
      case "Granted":
        return { status: "healthy", message: `Consent active for ${consent.linkedAccounts.length} account(s).`, checkedAt };
    }
  }
}

export const accountAggregatorPlugin: Plugin = new AccountAggregatorPlugin();
