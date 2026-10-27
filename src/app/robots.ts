import type { MetadataRoute } from "next";
import { SITE } from "@/lib/site";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/api/", "/en/admin", "/zh/admin", "/en/submit", "/zh/submit", "/en/sign-in", "/zh/sign-in"] },
    sitemap: `${SITE.url}/sitemap.xml`,
  };
}
