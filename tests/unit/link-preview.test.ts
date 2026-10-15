import { describe, expect, it } from "vitest";
import { parsePreview } from "@/features/gifts/link-preview";
import { checkUrl, isPublicAddress } from "@/lib/safe-fetch";

describe("link previews", () => {
  it("reads Open Graph details, resolving a relative picture", () => {
    const html = `<html><head>
      <title>Fallback title</title>
      <meta property="og:title" content="Tan Leather Crossbody &amp; Strap">
      <meta property="og:site_name" content='Shoe Locker TT'>
      <meta content="/img/bag.jpg" property="og:image">
      <meta property="product:price:amount" content="850.00">
      <meta property="product:price:currency" content="TTD">
      </head><body><meta property="og:title" content="ignored body tag"></body></html>`;
    expect(parsePreview(html, "https://shop.example.tt/products/bag")).toEqual({
      title: "Tan Leather Crossbody & Strap",
      site: "Shoe Locker TT",
      imageUrl: "https://shop.example.tt/img/bag.jpg",
      priceMinor: 85000,
    });
  });

  it("falls back to the page title and host, and ignores foreign-currency prices", () => {
    const html = `<head><title> Air Fryer – 5L </title><meta name="twitter:image" content="https://cdn.example.com/a.png">
      <meta property="product:price:amount" content="99.99"><meta property="product:price:currency" content="USD"></head>`;
    expect(parsePreview(html, "https://www.pricesmart.com/x")).toEqual({
      title: "Air Fryer – 5L",
      site: "pricesmart.com",
      imageUrl: "https://cdn.example.com/a.png",
      priceMinor: null,
    });
  });

  it("refuses non-web picture links", () => {
    expect(parsePreview(`<head><meta property="og:image" content="javascript:alert(1)"></head>`, "https://a.tt").imageUrl).toBeNull();
  });
});

describe("safe fetching", () => {
  it("blocks private, loopback, link-local and cloud metadata addresses", () => {
    for (const ip of ["127.0.0.1", "10.1.2.3", "172.16.0.9", "192.168.1.1", "169.254.169.254", "100.64.0.1", "0.0.0.0", "::1", "fe80::1", "fd00::1", "::ffff:127.0.0.1", "::ffff:7f00:1"]) {
      expect(isPublicAddress(ip), ip).toBe(false);
    }
    for (const ip of ["8.8.8.8", "190.213.1.1", "2606:4700::1111", "::ffff:8.8.8.8"]) {
      expect(isPublicAddress(ip), ip).toBe(true);
    }
  });

  it("only fetches plain web links", () => {
    expect(checkUrl("https://shop.example.tt/bag").href).toBe("https://shop.example.tt/bag");
    expect(() => checkUrl("file:///etc/passwd")).toThrow();
    expect(() => checkUrl("https://user:pass@example.com")).toThrow();
    expect(() => checkUrl("http://example.com:8080/")).toThrow();
  });
});
