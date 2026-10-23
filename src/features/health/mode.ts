import type { NextRequest } from "next/server";

/**
 * Which app the person was last using on this device: Ward Hub or Ward Health.
 * Switching is always explicit (a button that calls a Server Action), so a
 * prefetch or a visit to a Hub page from a notification never flips it.
 */
export const MODE_COOKIE = "ward-mode";
export type AppMode = "hub" | "health";

export const MODE_COOKIE_OPTIONS = {
  path: "/",
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  maxAge: 60 * 60 * 24 * 400,
};

/**
 * Opening the app at its start page ("/", e.g. from the home-screen icon)
 * goes back to Ward Health if that's where the person left off. Only full page
 * loads are redirected: in-app navigation to Home (an RSC request) always
 * shows Ward Hub, and URLs with a query (shortcuts like /?add=expense) are
 * left alone.
 */
export function shouldOpenWardHealth(request: NextRequest): boolean {
  return (
    request.nextUrl.pathname === "/" &&
    request.nextUrl.search === "" &&
    request.headers.get("sec-fetch-dest") === "document" &&
    request.cookies.get(MODE_COOKIE)?.value === "health"
  );
}
