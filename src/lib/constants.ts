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
