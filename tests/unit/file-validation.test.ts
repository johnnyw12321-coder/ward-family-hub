import { describe, expect, it } from "vitest";
import {
  formatBytes,
  normaliseDeclaredType,
  sanitizeFileName,
  sha256Hex,
  sniffFileType,
  suggestDocumentName,
} from "@/features/documents/file-validation";

const bytes = (...parts: (string | number[])[]) => {
  const out: number[] = [];
  for (const p of parts) out.push(...(typeof p === "string" ? [...p].map((c) => c.charCodeAt(0)) : p));
  while (out.length < 16) out.push(0);
  return new Uint8Array(out);
};

describe("file type sniffing", () => {
  it("recognises allowed formats from their content", () => {
    expect(sniffFileType(bytes("%PDF-1.7\n"))).toBe("application/pdf");
    expect(sniffFileType(bytes([0xff, 0xd8, 0xff, 0xe0]))).toBe("image/jpeg");
    expect(sniffFileType(bytes([0x89], "PNG", [0x0d, 0x0a, 0x1a, 0x0a]))).toBe("image/png");
    expect(sniffFileType(bytes("RIFF", [1, 2, 3, 4], "WEBPVP8 "))).toBe("image/webp");
    expect(sniffFileType(bytes([0, 0, 0, 24], "ftypheic"))).toBe("image/heic");
    expect(sniffFileType(bytes([0, 0, 0, 24], "ftypmif1"))).toBe("image/heic");
  });

  it("rejects everything else, including disguised files", () => {
    expect(sniffFileType(bytes("<svg xmlns=\"http://www.w3.org/2000/svg\">"))).toBeNull();
    expect(sniffFileType(bytes("<!doctype html><script>"))).toBeNull();
    expect(sniffFileType(bytes("MZ", [0x90, 0]))).toBeNull(); // Windows executable
    expect(sniffFileType(bytes("PK", [3, 4]))).toBeNull(); // zip / docx
    expect(sniffFileType(bytes([0, 0, 0, 24], "ftypmp42"))).toBeNull(); // mp4
    expect(sniffFileType(new Uint8Array([0x25, 0x50]))).toBeNull(); // too short
    expect(sniffFileType(bytes(" %PDF-1.7"))).toBeNull(); // must start with the signature
  });

  it("normalises declared types", () => {
    expect(normaliseDeclaredType("IMAGE/JPG")).toBe("image/jpeg");
    expect(normaliseDeclaredType("image/heif")).toBe("image/heic");
  });
});

describe("file names", () => {
  it("strips paths, control and reserved characters", () => {
    expect(sanitizeFileName("C:\\Users\\me\\Passport scan.pdf")).toBe("Passport scan.pdf");
    expect(sanitizeFileName("../../etc/passwd")).toBe("passwd");
    expect(sanitizeFileName('bad<>:"|?*\u0007name.png')).toBe("badname.png");
    expect(sanitizeFileName("...hidden.pdf")).toBe("hidden.pdf");
    expect(sanitizeFileName("   ")).toBe("document");
  });

  it("truncates long names but keeps the extension", () => {
    const long = `${"a".repeat(200)}.pdf`;
    const clean = sanitizeFileName(long);
    expect(clean).toHaveLength(120);
    expect(clean.endsWith(".pdf")).toBe(true);
  });

  it("suggests readable document names", () => {
    expect(suggestDocumentName("IMG_2041.JPG")).toBe("IMG 2041");
    expect(suggestDocumentName("car-insurance_2026.pdf")).toBe("car insurance 2026");
  });

  it("formats sizes and hashes content", async () => {
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(2048)).toBe("2 KB");
    expect(formatBytes(5 * 1024 * 1024)).toBe("5.0 MB");
    expect(await sha256Hex(new TextEncoder().encode("abc").buffer as ArrayBuffer)).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });
});
