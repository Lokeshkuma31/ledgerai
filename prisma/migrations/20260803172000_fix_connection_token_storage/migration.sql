-- Fixes two real gaps found while wiring the Connection Hub migration
-- (plan §9, Phase 2):
-- 1. The flat tokenCiphertext/tokenIv/tokenAuthTag columns only had room
--    for ONE encrypted payload, but TokenSet (lib/connections/types.ts)
--    has TWO independently-encrypted payloads (accessToken + refreshToken)
--    plus expiresAt/tokenType/scopes — flat columns would have silently
--    dropped the refresh token. `tokens` now stores the whole TokenSet as
--    JSON, mirroring exactly what the file-backed store already
--    serializes today.
-- 2. ConnectionStatus previously didn't match
--    lib/connections/types.ts's CONNECTION_STATUSES (missing "connecting"
--    and "authentication-failed", had a made-up "degraded" value with no
--    equivalent). Both tables are empty, so this is a clean rebuild.

BEGIN;
CREATE TYPE "ConnectionStatus_new" AS ENUM ('CONNECTING', 'CONNECTED', 'EXPIRED', 'DISCONNECTED', 'AUTHENTICATION_FAILED', 'PERMISSION_REVOKED');
ALTER TABLE "connections" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "connections" ALTER COLUMN "status" TYPE "ConnectionStatus_new" USING ("status"::text::"ConnectionStatus_new");
ALTER TYPE "ConnectionStatus" RENAME TO "ConnectionStatus_old";
ALTER TYPE "ConnectionStatus_new" RENAME TO "ConnectionStatus";
DROP TYPE "ConnectionStatus_old";
ALTER TABLE "connections" ALTER COLUMN "status" SET DEFAULT 'CONNECTED';
COMMIT;

ALTER TABLE "connections" DROP COLUMN "tokenAuthTag",
DROP COLUMN "tokenCiphertext",
DROP COLUMN "tokenIv",
ADD COLUMN     "tokens" JSONB;
