import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";

export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  // Skip static assets, the service worker, the manifest and icons.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|sw.js|manifest.webmanifest|icons/|.*\.(?:png|svg|jpg|jpeg|webp|ico)$).*)",
  ],
};
