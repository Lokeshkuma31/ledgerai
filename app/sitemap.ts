import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

/**
 * Only the public, unauthenticated surface belongs here — everything under
 * the authenticated app shell requires a session and shouldn't be crawled
 * or indexed (see app/robots.ts's Disallow list, which must stay in sync).
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const routes = [
    { path: "", changeFrequency: "monthly" as const, priority: 1 },
    { path: "/sign-in", changeFrequency: "yearly" as const, priority: 0.6 },
    { path: "/legal/privacy", changeFrequency: "yearly" as const, priority: 0.3 },
    { path: "/legal/terms", changeFrequency: "yearly" as const, priority: 0.3 },
    { path: "/legal/cookies", changeFrequency: "yearly" as const, priority: 0.3 },
    { path: "/legal/security", changeFrequency: "yearly" as const, priority: 0.3 },
    {
      path: "/legal/responsible-disclosure",
      changeFrequency: "yearly" as const,
      priority: 0.3,
    },
  ];

  return routes.map((route) => ({
    url: `${SITE_URL}${route.path}`,
    lastModified: new Date(),
    changeFrequency: route.changeFrequency,
    priority: route.priority,
  }));
}
