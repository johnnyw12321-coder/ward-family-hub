/**
 * Server-side file validation for the document vault. The declared content
 * type and file extension are never trusted on their own: the first bytes of
 * the stored object must match an allowed format. SVG, HTML, Office files and
 * executables are not accepted.
 */

export const ALLOWED_MIME_TYPES = ["application/pdf", "image/jpeg", "image/png", "image/webp", "image/heic"] as const;
export type AllowedMime = (typeof ALLOWED_MIME_TYPES)[number];

/** Matches the storage bucket limit (25 MiB). */
export const MAX_FILE_BYTES = 25 * 1024 * 1024;

export const ACCEPT_ATTRIBUTE = ".pdf,.jpg,.jpeg,.png,.webp,.heic,application/pdf,image/jpeg,image/png,image/webp,image/heic";

function ascii(bytes: Uint8Array, start: number, length: number): string {
  return String.fromCharCode(...bytes.subarray(start, start + length));
}

const HEIC_BRANDS = new Set(["heic", "heix", "hevc", "hevx", "heim", "heis", "mif1", "msf1"]);

/** Identify an allowed file type from its leading bytes, or null. */
export function sniffFileType(bytes: Uint8Array): AllowedMime | null {
  if (bytes.length < 12) return null;
  if (ascii(bytes, 0, 5) === "%PDF-") return "application/pdf";
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes[0] === 0x89 && ascii(bytes, 1, 3) === "PNG" && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a) {
    return "image/png";
  }
  if (ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 4) === "WEBP") return "image/webp";
  if (ascii(bytes, 4, 4) === "ftyp" && HEIC_BRANDS.has(ascii(bytes, 8, 4))) return "image/heic";
  return null;
}

export function isAllowedMime(value: string): value is AllowedMime {
  return (ALLOWED_MIME_TYPES as readonly string[]).includes(value);
}

/** Normalise the declared type (browsers report HEIF variants differently). */
export function normaliseDeclaredType(type: string): string {
  const t = type.toLowerCase().trim();
  if (t === "image/jpg" || t === "image/pjpeg") return "image/jpeg";
  if (t === "image/heif" || t === "image/heic-sequence" || t === "image/heif-sequence") return "image/heic";
  return t;
}

/**
 * A safe display/download file name: no paths, control characters or
 * reserved characters, at most 120 characters, keeping the extension.
 */
export function sanitizeFileName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "";
  let clean = base.replace(/[\u0000-\u001f\u007f<>:"|?*]/g, "").replace(/\s+/g, " ").trim();
  clean = clean.replace(/^\.+/, "");
  if (!clean) return "document";
  if (clean.length <= 120) return clean;
  const dot = clean.lastIndexOf(".");
  const ext = dot > 0 && clean.length - dot <= 10 ? clean.slice(dot) : "";
  return clean.slice(0, 120 - ext.length) + ext;
}

/** Name suggestion from a file name: "IMG_2041.jpg" -> "IMG 2041". */
export function suggestDocumentName(fileName: string): string {
  const base = sanitizeFileName(fileName).replace(/\.[a-z0-9]{1,6}$/i, "");
  return base.replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 160) || "Document";
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export async function sha256Hex(data: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
