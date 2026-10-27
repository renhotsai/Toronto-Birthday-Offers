import { en, type Dictionary } from "./en";
import { zh } from "./zh";

export const LOCALES = ["en", "zh"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "en";

const dictionaries: Record<Locale, Dictionary> = { en, zh };

export const hasLocale = (value: string): value is Locale => (LOCALES as readonly string[]).includes(value);
export const getDictionary = (locale: Locale): Dictionary => dictionaries[locale];
export const otherLocale = (locale: Locale): Locale => (locale === "en" ? "zh" : "en");
export const htmlLang = (locale: Locale) => (locale === "zh" ? "zh-Hant" : "en-CA");

export type { Dictionary };
