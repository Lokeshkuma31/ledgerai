import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      // Authenticated app surface and internal API/webhook routes — no
      // public content behind them, and they should never be crawled.
      disallow: [
        "/dashboard",
        "/transactions",
        "/budgets",
        "/analytics",
        "/banks",
        "/connections",
        "/documents",
        "/email",
        "/feed",
        "/forecast",
        "/goals",
        "/insights",
        "/merchants",
        "/plugins",
        "/recurring",
        "/search",
        "/settings",
        "/sync",
        "/workflows",
        "/ai-coach",
        "/api/",
        "/jobs",
        "/observability",
      ],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
