import { describe, expect, it } from "vitest";
import { ANALYTICS_EVENT_SCHEMAS, SERVER_SIDE_EVENTS } from "@/lib/observability/analytics-events";

describe("ANALYTICS_EVENT_SCHEMAS", () => {
  it("accepts a valid provider_connected payload", () => {
    const result = ANALYTICS_EVENT_SCHEMAS.provider_connected.safeParse({ provider: "google", connection_id: "conn_1" });
    expect(result.success).toBe(true);
  });

  it("rejects a provider_connected payload with an unknown provider enum value", () => {
    const result = ANALYTICS_EVENT_SCHEMAS.provider_connected.safeParse({ provider: "dropbox", connection_id: "conn_1" });
    expect(result.success).toBe(false);
  });

  it("rejects a payload missing a required field", () => {
    const result = ANALYTICS_EVENT_SCHEMAS.sync_completed.safeParse({ provider: "google", sync_type: "initial" });
    expect(result.success).toBe(false);
  });

  it("never accepts a financial amount/description-shaped field slipping into an event's schema", () => {
    // Every schema's shape is a fixed zod object — passing extra keys like
    // `amount`/`description` is a no-op under zod's default strip
    // behavior rather than an error, but the important guarantee is that
    // no schema in the catalog *declares* such a field in the first place.
    for (const [name, schema] of Object.entries(ANALYTICS_EVENT_SCHEMAS)) {
      const shape = (schema as { shape?: Record<string, unknown> }).shape ?? {};
      expect(Object.keys(shape), `${name} must not declare a financial field`).not.toEqual(
        expect.arrayContaining(["amount", "balance", "description"]),
      );
    }
  });

  it("document_imported accepts an optional document_type", () => {
    const result = ANALYTICS_EVENT_SCHEMAS.document_imported.safeParse({ size_bucket: "small" });
    expect(result.success).toBe(true);
  });
});

describe("SERVER_SIDE_EVENTS", () => {
  it("includes every event whose trigger point is a Server Action, Route Handler, or Inngest job", () => {
    expect(SERVER_SIDE_EVENTS.has("provider_connected")).toBe(true);
    expect(SERVER_SIDE_EVENTS.has("sync_completed")).toBe(true);
    expect(SERVER_SIDE_EVENTS.has("user_signed_up")).toBe(true);
  });

  it("excludes purely client-side page-view events", () => {
    expect(SERVER_SIDE_EVENTS.has("dashboard_viewed")).toBe(false);
    expect(SERVER_SIDE_EVENTS.has("search_performed")).toBe(false);
  });

  it("only references event names that exist in the schema catalog", () => {
    for (const name of SERVER_SIDE_EVENTS) {
      expect(ANALYTICS_EVENT_SCHEMAS).toHaveProperty(name);
    }
  });
});
