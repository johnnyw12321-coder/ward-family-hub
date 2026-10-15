/**
 * Link previews: the title, site name, picture and (when the page states it in
 * TT$) price that shops publish for WhatsApp/Facebook-style previews. Parsing
 * is pure; fetching goes through safeFetch.
 */
import { parseMoney } from "@/lib/money";

export type LinkPreview = { title: string | null; site: string | null; imageUrl: string | null; priceMinor: number | null };

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, code: string) => {
    if (code[0] === "#") {
      const n = code[1].toLowerCase() === "x" ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : m;
    }
    return ENTITIES[code.toLowerCase()] ?? m;
  });
}

function clean(s: string | undefined | null, max: number): string | null {
  if (!s) return null;
  const v = decodeEntities(s).replace(/\s+/g, " ").trim();
  return v ? v.slice(0, max) : null;
}

function attr(tag: string, name: string): string | undefined {
  const m = tag.match(new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, "i"));
  return m ? (m[2] ?? m[3] ?? m[4]) : undefined;
}

export function parsePreview(html: string, pageUrl: string): LinkPreview {
  const head = html.slice(0, Math.max(html.search(/<\/head>/i), 0) || html.length);
  const meta = new Map<string, string>();
  for (const tag of head.match(/<meta\b[^>]*>/gi) ?? []) {
    const key = (attr(tag, "property") ?? attr(tag, "name") ?? attr(tag, "itemprop"))?.toLowerCase();
    const content = attr(tag, "content");
    if (key && content !== undefined && !meta.has(key)) meta.set(key, content);
  }
  const first = (...keys: string[]) => keys.map((k) => meta.get(k)).find((v) => v && v.trim());
  const docTitle = head.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1];
  const imageLink = (head.match(/<link\b[^>]*rel\s*=\s*["']?image_src["']?[^>]*>/i) ?? [])[0];

  let imageUrl: string | null = null;
  const rawImage = first("og:image:secure_url", "og:image", "og:image:url", "twitter:image", "twitter:image:src", "image") ?? (imageLink ? attr(imageLink, "href") : undefined);
  if (rawImage) {
    try {
      const u = new URL(decodeEntities(rawImage.trim()), pageUrl);
      if (u.protocol === "https:" || u.protocol === "http:") imageUrl = u.href;
    } catch {
      imageUrl = null;
    }
  }

  let priceMinor: number | null = null;
  const currency = first("product:price:currency", "og:price:currency", "pricecurrency")?.trim().toUpperCase();
  const amount = first("product:price:amount", "og:price:amount", "price");
  if (amount && (currency === "TTD" || currency === "TT$")) priceMinor = parseMoney(amount.trim());

  let site = clean(first("og:site_name", "application-name"), 120);
  if (!site) {
    try {
      site = new URL(pageUrl).hostname.replace(/^www\./, "");
    } catch {
      site = null;
    }
  }
  return { title: clean(first("og:title", "twitter:title") ?? docTitle, 200), site, imageUrl, priceMinor };
}

export type PreviewImageType = "image/jpeg" | "image/png" | "image/webp" | "image/gif";

/** Identify a picture by its first bytes; anything else (SVG, HTML…) is refused. */
export function sniffImage(bytes: Uint8Array): PreviewImageType | null {
  if (bytes.length < 12) return null;
  const ascii = (start: number, len: number) => String.fromCharCode(...bytes.subarray(start, start + len));
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes[0] === 0x89 && ascii(1, 3) === "PNG") return "image/png";
  if (ascii(0, 4) === "RIFF" && ascii(8, 4) === "WEBP") return "image/webp";
  if (ascii(0, 6) === "GIF87a" || ascii(0, 6) === "GIF89a") return "image/gif";
  return null;
}
