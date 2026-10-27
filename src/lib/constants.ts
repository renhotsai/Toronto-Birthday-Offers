// Shared enums, kept free of database imports so client components can use them.
export const CATEGORIES = ["food", "drink", "dessert", "beauty", "retail", "entertainment", "other"] as const;
export const BRAND_KINDS = ["chain", "local", "online"] as const;
export const WINDOWS = ["day", "week", "month", "custom"] as const;
export const VOTE_KINDS = ["valid", "expired"] as const;
export const REPORT_KINDS = ["not_participating", "closed", "wrong_location"] as const;
export const ROLES = ["user", "moderator", "admin"] as const;

export type Category = (typeof CATEGORIES)[number];

export const CATEGORY_ICON: Record<Category, string> = {
  food: "🍔", drink: "☕", dessert: "🍦", beauty: "💄", retail: "🛍️", entertainment: "🎟️", other: "🎁",
};
export type BrandKind = (typeof BRAND_KINDS)[number];
export type Window = (typeof WINDOWS)[number];
export type ReportKind = (typeof REPORT_KINDS)[number];
export type Role = (typeof ROLES)[number];

// Admin tabs in display order. `count` names the pending count shown on the label (see getModerationCounts);
// /[lang]/admin redirects to the first counted tab with pending items.
export const ADMIN_TABS = [
  { key: "queue", minRole: "moderator", count: "queue" },
  { key: "stale", minRole: "moderator", count: "stale" },
  { key: "reports", minRole: "moderator", count: "reports" },
  { key: "users", minRole: "admin", count: null },
] as const satisfies readonly { key: string; minRole: Role; count: "queue" | "stale" | "reports" | null }[];
export type AdminTab = (typeof ADMIN_TABS)[number]["key"];
