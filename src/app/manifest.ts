import type { MetadataRoute } from "next";
import { SITE } from "@/lib/site";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: SITE.name.en,
    short_name: "Bday Offers",
    description: "Community map of birthday freebies in Toronto",
    start_url: "/",
    display: "standalone",
    background_color: "#fffaf5",
    theme_color: "#d93a5e",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml" }],
  };
}
