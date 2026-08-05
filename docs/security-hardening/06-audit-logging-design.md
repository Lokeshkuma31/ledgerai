# Audit Logging Design

## Data model: reuse the existing `AuditLog` Prisma model, don't create a new one

`prisma/schema.prisma:118-136` already defines a complete, well-designed model with zero writers (confirmed in the production-readiness audit). This design builds on it rather than adding a parallel structure:

```prisma
model AuditLog {
  id             String   @id @default(cuid())
  organizationId String?
  userId         String?
  action         String
  entityType     String
  entityId       String
  before         Json?
  after          Json?
  ip             String?
  createdAt      DateTime @default(now())

  organization Organization? @relation(fields: [organizationId], references: [id], onDelete: SetNull)
  user         User?         @relation(fields: [userId], references: [id], onDelete: SetNull)

  @@index([organizationId, createdAt])
  @@index([entityType, entityId])
  @@map("audit_logs")
}
```

Field mapping for this pass: `actor` → `userId` (nullable to allow logging failed-auth attempts where no user is resolved yet, e.g. a bad login with an unrecognized email); `action` → a fixed taxonomy string (below); `resource` → `entityType` + `entityId`; `outcome` → encoded as part of `action` (e.g., `auth.login.failed` vs `auth.login.succeeded`) rather than a separate column, since Prisma's schema is already fixed and adding a column is an out-of-scope migration for this pass — the action-string taxonomy achieves the same queryability. `timestamp` → `createdAt` (already present, indexed). `before`/`after` carry a redacted snapshot (never token material — see redaction rule below).

## Action taxonomy

Namespaced `domain.entity.outcome` strings, matching the model's `action: String` free-text field but used consistently so queries like `WHERE action LIKE 'auth.%'` are meaningful:

| Action | entityType | Logged on |
|---|---|---|
| `auth.session.created` | `session` | Successful sign-in (email/password or Google) |
| `auth.session.failed` | `session` | Failed sign-in attempt |
| `auth.user.registered` | `user` | New account creation |
| `connection.created` | `connection` | New OAuth connection completed |
| `connection.reconnected` | `connection` | Existing connection re-authorized |
| `connection.disconnected` | `connection` | Connection removed |
| `connection.renamed` | `connection` | Display name changed |
| `connection.token_refreshed` | `connection` | Token refresh succeeded |
| `connection.token_refresh_failed` | `connection` | Token refresh failed |
| `connection.permission_revoked` | `connection` | Provider reported the grant was revoked |
| `connection.access_denied` | `connection` | An ownership check rejected an attempt to act on a connection not belonging to the caller — **the security-failure case this whole pass exists to catch** |
| `membership.role_changed` | `membership` | Role change on a membership *(taxonomy reserved for when role mutation exists — see Scope note below)* |
| `user.deleted` | `user` | Account deletion *(taxonomy reserved — see Scope note below)* |
| `security.rate_limited` | varies | A rate limiter rejected a request on a sensitive endpoint (auth, OAuth, connection mutation) |

## Redaction rule (non-negotiable)

`before`/`after` snapshots **never** include `tokens`, `accessToken`, `refreshToken`, or any field from `StoredConnection.tokens` — only the same shape `toConnectionRecord()` already produces (`lib/connections/registry.ts:68-72`), which is the app's existing, established "safe to expose" projection. The audit log service's connection-logging helper takes a `ConnectionRecord`, never a `StoredConnection`, enforced at the TypeScript level so a future call site can't accidentally pass token material in.

## Service design

`lib/audit/log.ts` (new, server-only, following the same layering as `lib/cache/redis.ts`/`lib/api/error-handler.ts`) exposes one function:

```ts
interface AuditEventInput {
  action: string;
  entityType: string;
  entityId: string;
  userId?: string | null;
  organizationId?: string | null;
  before?: unknown;
  after?: unknown;
  ip?: string | null;
}

export async function recordAuditEvent(event: AuditEventInput): Promise<void>
```

Backed by `repositories/audit-log-repository.ts` (new, mirrors `repositories/connection-repository.ts`'s pattern — the only file that imports the generated Prisma client for this model). `recordAuditEvent` **never throws** — a logging failure must not break the user-facing operation it's attached to (wrapped in try/catch internally, failure logged via `console.error("[audit]", ...)` matching the existing `lib/api/error-handler.ts` convention, since Pino isn't wired yet per the production-readiness audit). This mirrors how `lib/connections/engine.ts` already treats its own cache-refresh as best-effort (`void refreshConnectionCache().catch(() => undefined)`, `engine.ts:196`) — audit logging follows the same "never let an observability side-effect break the primary operation" principle already established in this codebase.

## What gets wired in this pass (Priority 4 implementation)

Concrete call sites added, scoped to what the task requires (authentication, OAuth connections, token refresh, connection removal, permission changes, account deletion, security failures) **and actually exists in the codebase to hook into**:

- **Authentication** — better-auth `databaseHooks` (`lib/auth/better-auth.ts`) gains `session.create.after` (logs `auth.session.created`) alongside the existing `user.create.after` hook (logs `auth.user.registered`); a login-failure hook is added if better-auth exposes one for this version, otherwise logged from the auth-route rate-limit wrapper as a fallback signal.
- **OAuth connections / token refresh / connection removal** — `lib/connections/engine.ts`'s `completeConnection`, `disconnectConnection`, `refreshConnection` (both success and failure branches), `renameConnection` each call `recordAuditEvent` with the relevant action, right after the state-mutating `upsertStoredConnection`/`deleteStoredConnection` call, using the now-available `userId` parameter (Priority 1) as the actor and the `toConnectionRecord()` projection as `before`/`after`.
- **Security failures** — the new ownership-check helper (`lib/auth/authorize.ts`, Priority 1) calls `recordAuditEvent` with `connection.access_denied` whenever it rejects a mismatched `userId`, and the new rate limiters (Priority 3) call it with `security.rate_limited` whenever they reject a request on `authRateLimit`/`oauthCallbackRateLimit`/`connectionMutationRateLimit` specifically (not the generic `apiRateLimit`, to avoid flooding the log with routine traffic-shaping noise — only the *sensitive* limiters are audit-worthy).

## Scope note: permission changes and account deletion

**No code path in the current application changes a `Membership.role` or deletes a `User`** — confirmed by grep; these are legitimately unbuilt features (the production-readiness audit flagged both "RBAC enforcement" and "data deletion flow" as launch gaps in their own right, not something this security-hardening pass adds). The taxonomy above reserves `membership.role_changed` and `user.deleted` action strings now, so whoever builds those flows has a pre-defined, consistent event name to log against — this pass does not fabricate call sites for operations that don't exist, per the "no feature additions" constraint.

## Querying

No admin UI is built in this pass (out of scope — "no feature additions"). The model's existing indexes (`[organizationId, createdAt]`, `[entityType, entityId]`) support the two access patterns that matter operationally: "show me this org's recent activity" and "show me everything that happened to this specific connection" — both directly answerable via `prisma.auditLog.findMany(...)` from a future admin dashboard or an ad hoc investigation query, without new indexes.
