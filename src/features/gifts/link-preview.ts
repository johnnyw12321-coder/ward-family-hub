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

function webUrl(raw: string | undefined | null, base: string): string | null {
  if (!raw) return null;
  try {
    const u = new URL(decodeEntities(raw.trim()), base);
    return u.protocol === "https:" || u.protocol === "http:" ? u.href : null;
  } catch {
    return null;
  }
}

type Structured = { name?: string; image?: string; price?: string; currency?: string };

/** schema.org Product data that many shops embed as JSON-LD. */
function structuredProduct(html: string): Structured {
  const out: Structured = {};
  for (const m of html.matchAll(/<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    let json: unknown;
    try {
      json = JSON.parse(m[1].trim());
    } catch {
      continue;
    }
    const nodes: unknown[] = [];
    const walk = (n: unknown) => {
      if (Array.isArray(n)) n.forEach(walk);
      else if (n && typeof n === "object") {
        nodes.push(n);
        const graph = (n as Record<string, unknown>)["@graph"];
        if (graph) walk(graph);
      }
    };
    walk(json);
    for (const node of nodes as Record<string, unknown>[]) {
      const type = node["@type"];
      if (!(type === "Product" || (Array.isArray(type) && type.includes("Product")))) continue;
      const image = node.image;
      const firstImage = Array.isArray(image) ? image[0] : image;
      const imageUrl = typeof firstImage === "string" ? firstImage : (firstImage as Record<string, unknown> | undefined)?.url;
      const offers = Array.isArray(node.offers) ? node.offers[0] : node.offers;
      const offer = (offers ?? {}) as Record<string, unknown>;
      out.name ??= typeof node.name === "string" ? node.name : undefined;
      out.image ??= typeof imageUrl === "string" ? imageUrl : undefined;
      out.price ??= offer.price !== undefined ? String(offer.price) : offer.lowPrice !== undefined ? String(offer.lowPrice) : undefined;
      out.currency ??= typeof offer.priceCurrency === "string" ? offer.priceCurrency : undefined;
    }
  }
  return out;
}

/** Amazon puts its main product photo in the page body rather than in preview tags. */
function amazonImage(html: string): string | undefined {
  return (
    html.match(/data-old-hires\s*=\s*"(https:\/\/[^"]+)"/i)?.[1] ??
    html.match(/"hiRes"\s*:\s*"(https:\/\/[^"]+)"/)?.[1] ??
    html.match(/id\s*=\s*"landingImage"[^>]*\bsrc\s*=\s*"(https:\/\/[^"]+)"/i)?.[1]
  );
}

/** "Amazon.com: Tan Crossbody Bag : Clothing, Shoes & Jewelry" → "Tan Crossbody Bag". */
function tidyTitle(title: string | null, host: string): string | null {
  if (!title) return null;
  let t = title;
  if (/(^|\.)amazon\./.test(host)) t = t.replace(/^Amazon(\.[a-z.]+)?\s*:\s*/i, "").replace(/\s+:\s+[^:]+$/, "");
  return t.trim() || title;
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
  const product = structuredProduct(html);
  let host = "";
  try {
    host = new URL(pageUrl).hostname.replace(/^www\./, "");
  } catch {
    host = "";
  }

  const imageUrl =
    webUrl(first("og:image:secure_url", "og:image", "og:image:url", "twitter:image", "twitter:image:src", "image"), pageUrl) ??
    webUrl(imageLink ? attr(imageLink, "href") : undefined, pageUrl) ??
    webUrl(product.image, pageUrl) ??
    webUrl(amazonImage(html), pageUrl);

  let priceMinor: number | null = null;
  const currency = (first("product:price:currency", "og:price:currency", "pricecurrency") ?? product.currency)?.trim().toUpperCase();
  const amount = first("product:price:amount", "og:price:amount", "price") ?? product.price;
  if (amount && (currency === "TTD" || currency === "TT$")) priceMinor = parseMoney(amount.trim());

  const site = clean(first("og:site_name", "application-name"), 120) ?? (host || null);
  const title = tidyTitle(clean(first("og:title", "twitter:title") ?? product.name ?? docTitle, 200), host);
  return { title, site, imageUrl, priceMinor };
}
