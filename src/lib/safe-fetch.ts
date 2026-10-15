import "server-only";
import { lookup as dnsLookup, type LookupAddress } from "node:dns";
import http from "node:http";
import https from "node:https";
import net from "node:net";
import zlib from "node:zlib";

/**
 * Fetch a URL a user pasted, without letting it reach anything private.
 *
 * Every address a host name resolves to must be public, and the check happens
 * inside the connection's own DNS lookup, so the address that's checked is
 * the one that's used (no DNS-rebinding window). Redirects are followed by
 * hand and re-checked. Only ports 80/443, a hard timeout and a byte limit.
 */

export class SafeFetchError extends Error {}

const BLOCKED_V4: [string, number][] = [
  ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8], ["169.254.0.0", 16],
  ["172.16.0.0", 12], ["192.0.0.0", 24], ["192.0.2.0", 24], ["192.88.99.0", 24], ["192.168.0.0", 16],
  ["198.18.0.0", 15], ["198.51.100.0", 24], ["203.0.113.0", 24], ["224.0.0.0", 4], ["240.0.0.0", 4],
];

function v4ToInt(ip: string): number {
  return ip.split(".").reduce((n, part) => (n << 8) + Number(part), 0) >>> 0;
}

export function isPublicAddress(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const n = v4ToInt(ip);
    return !BLOCKED_V4.some(([base, bits]) => (n >>> (32 - bits)) === (v4ToInt(base) >>> (32 - bits)));
  }
  if (net.isIPv6(ip)) {
    const v = ip.toLowerCase();
    const mapped = v.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isPublicAddress(mapped[1]);
    // Any other IPv4-mapped/compatible form, unspecified and loopback.
    if (v.startsWith("::")) return false;
    // Unique-local, link-local, multicast, documentation, Teredo, and NAT64/6to4 wrappers.
    return !/^(f[cd]|fe[89ab]|ff|2001:db8|2001:0?:|64:ff9b|2002:)/.test(v);
  }
  return false;
}

function guardedLookup(
  hostname: string,
  options: { all?: boolean; family?: number },
  callback: (err: NodeJS.ErrnoException | null, address: string | LookupAddress[], family?: number) => void,
) {
  dnsLookup(hostname, { all: true, family: options.family ?? 0 }, (err, addresses) => {
    if (err) return callback(err, "");
    const list = addresses as LookupAddress[];
    if (!list.length || list.some((a) => !isPublicAddress(a.address))) {
      return callback(Object.assign(new Error("Blocked address"), { code: "EBLOCKED" }), "");
    }
    if (options.all) return callback(null, list);
    callback(null, list[0].address, list[0].family);
  });
}

export type SafeResponse = { status: number; contentType: string; body: Buffer; url: string };

function requestOnce(url: URL, maxBytes: number, signal: AbortSignal, accept: string): Promise<SafeResponse & { location?: string }> {
  return new Promise((resolve, reject) => {
    if (net.isIP(url.hostname.replace(/^\[|\]$/g, "")) && !isPublicAddress(url.hostname.replace(/^\[|\]$/g, ""))) {
      return reject(new SafeFetchError("Blocked address"));
    }
    const lib = url.protocol === "https:" ? https : http;
    const req = lib.request(
      url,
      {
        method: "GET",
        lookup: guardedLookup as unknown as typeof dnsLookup,
        signal,
        headers: {
          "user-agent": "Mozilla/5.0 (compatible; WardFamilyHub/1.0; link preview)",
          accept,
          "accept-encoding": "gzip, deflate, br",
          "accept-language": "en-TT,en;q=0.9",
        },
      },
      (res) => {
        const status = res.statusCode ?? 0;
        if (status >= 300 && status < 400 && res.headers.location) {
          res.resume();
          return resolve({ status, contentType: "", body: Buffer.alloc(0), url: url.href, location: res.headers.location });
        }
        const encoding = String(res.headers["content-encoding"] ?? "").toLowerCase();
        const stream =
          encoding === "gzip" ? res.pipe(zlib.createGunzip()) : encoding === "deflate" ? res.pipe(zlib.createInflate()) : encoding === "br" ? res.pipe(zlib.createBrotliDecompress()) : res;
        const chunks: Buffer[] = [];
        let size = 0;
        stream.on("data", (chunk: Buffer) => {
          size += chunk.length;
          if (size > maxBytes) {
            // Enough for a preview: keep what we have and stop reading.
            chunks.push(chunk.subarray(0, Math.max(0, chunk.length - (size - maxBytes))));
            req.destroy();
            resolve({ status, contentType: String(res.headers["content-type"] ?? ""), body: Buffer.concat(chunks), url: url.href });
            return;
          }
          chunks.push(chunk);
        });
        stream.on("end", () => resolve({ status, contentType: String(res.headers["content-type"] ?? ""), body: Buffer.concat(chunks), url: url.href }));
        stream.on("error", reject);
      },
    );
    req.on("error", reject);
    req.end();
  });
}

export function checkUrl(raw: string, base?: string): URL {
  let url: URL;
  try {
    url = new URL(raw, base);
  } catch {
    throw new SafeFetchError("Not a valid link");
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new SafeFetchError("Only web links");
  if (url.username || url.password) throw new SafeFetchError("Links with passwords aren't fetched");
  if (url.port && url.port !== "80" && url.port !== "443") throw new SafeFetchError("Unusual port");
  return url;
}

export async function safeFetch(
  raw: string,
  { maxBytes, timeoutMs = 6000, accept = "*/*", maxRedirects = 4 }: { maxBytes: number; timeoutMs?: number; accept?: string; maxRedirects?: number },
): Promise<SafeResponse> {
  const signal = AbortSignal.timeout(timeoutMs);
  let url = checkUrl(raw);
  for (let hop = 0; hop <= maxRedirects; hop++) {
    const res = await requestOnce(url, maxBytes, signal, accept);
    if (!res.location) return res;
    url = checkUrl(res.location, url.href);
  }
  throw new SafeFetchError("Too many redirects");
}
