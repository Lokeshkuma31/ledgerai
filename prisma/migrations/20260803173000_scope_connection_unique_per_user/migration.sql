-- Connection's (provider, providerAccountId) uniqueness was accidentally
-- global — two different app users legitimately connecting the same
-- external Google/Microsoft/Yahoo account (unlike OAuthAccount's identity
-- link, which correctly must be globally 1:1) should not collide. Scopes
-- the constraint to (userId, provider, providerAccountId) instead.

DROP INDEX "connections_provider_providerAccountId_key";
CREATE UNIQUE INDEX "connections_userId_provider_providerAccountId_key" ON "connections"("userId", "provider", "providerAccountId");
