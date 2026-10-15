import "server-only";
import { safeFetch } from "@/lib/safe-fetch";
import { parsePreview, type LinkPreview } from "./link-preview";

/** Read a shop page's preview details. Best effort: any failure means "no preview". */
export async function fetchLinkPreview(url: string): Promise<LinkPreview | null> {
  try {
    const res = await safeFetch(url, { maxBytes: 1_200_000, accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.5" });
    if (res.status < 200 || res.status >= 300 || !/html/i.test(res.contentType)) return null;
    return parsePreview(res.body.toString("utf8"), res.url);
  } catch (e) {
    console.warn("[linkPreview]", { message: e instanceof Error ? e.message : String(e) });
    return null;
  }
}
