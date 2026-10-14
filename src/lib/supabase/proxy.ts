import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { supabasePublishableKey, supabaseUrl } from "@/lib/env";

/** Paths reachable without a session. Everything else requires sign-in. */
const PUBLIC_PATHS = ["/login", "/forgot-password", "/auth/confirm", "/offline", "/setup"];

export function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

/**
 * Refreshes the Supabase session cookie on every request and performs an
 * optimistic redirect to /login for unauthenticated visitors. This is a
 * convenience only: every page, Server Action and Route Handler verifies the
 * session again, and RLS enforces access in the database.
 */
export async function updateSession(request: NextRequest) {
  const url = supabaseUrl();
  const key = supabasePublishableKey();
  const { pathname } = request.nextUrl;

  if (!url || !key) {
    // Not configured yet: send everything to the setup explanation page.
    if (pathname === "/setup" || pathname === "/offline") return NextResponse.next();
    return NextResponse.redirect(new URL("/setup", request.url));
  }

  let response = NextResponse.next({ request });
  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) response.cookies.set(name, value, options);
      },
    },
  });

  // Do not run code between createServerClient and getClaims(): it refreshes the session.
  const { data } = await supabase.auth.getClaims();
  const signedIn = Boolean(data?.claims?.sub);

  if (!signedIn && !isPublicPath(pathname)) {
    const login = request.nextUrl.clone();
    login.pathname = "/login";
    login.search = pathname !== "/" ? `?next=${encodeURIComponent(pathname)}` : "";
    const redirect = NextResponse.redirect(login);
    for (const cookie of response.cookies.getAll()) redirect.cookies.set(cookie);
    return redirect;
  }
  if (signedIn && pathname === "/login") {
    return NextResponse.redirect(new URL("/", request.url));
  }
  return response;
}
