import { NextResponse, type NextRequest } from "next/server";
import { match } from "@formatjs/intl-localematcher";
import Negotiator from "negotiator";
import { DEFAULT_LOCALE, LOCALES } from "@/i18n";

function preferredLocale(request: NextRequest) {
  const cookie = request.cookies.get("locale")?.value;
  if (cookie && (LOCALES as readonly string[]).includes(cookie)) return cookie;
  const languages = new Negotiator({
    headers: { "accept-language": request.headers.get("accept-language") ?? "" },
  }).languages();
  try {
    // Map any Chinese variant (zh-TW, zh-HK, zh-CN…) to our single "zh".
    return match(languages.map((l) => (l.toLowerCase().startsWith("zh") ? "zh" : l)), [...LOCALES], DEFAULT_LOCALE);
  } catch {
    return DEFAULT_LOCALE;
  }
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const hasLocale = LOCALES.some((l) => pathname === `/${l}` || pathname.startsWith(`/${l}/`));
  if (hasLocale) return;
  request.nextUrl.pathname = `/${preferredLocale(request)}${pathname === "/" ? "" : pathname}`;
  return NextResponse.redirect(request.nextUrl);
}

export const config = {
  matcher: ["/((?!api|_next|favicon.ico|icon|manifest|robots.txt|sitemap.xml|.*\\..*).*)"],
};
