/**
 * Money utilities.
 *
 * Amounts are always integers in minor units (cents) — the same representation
 * the database stores (bigint). We never do arithmetic on floating-point
 * currency values: parsing works on strings, formatting passes an exact decimal
 * string to Intl, and rate calculations go through decimal.js.
 */
import Decimal from "decimal.js";

export type Minor = number;

export const DEFAULT_CURRENCY = "TTD";
export const DEFAULT_LOCALE = "en-TT";

/** Symbols we prefer over Intl's defaults (Intl renders TTD as "TTD" or "$"). */
const SYMBOL_OVERRIDES: Record<string, string> = {
  TTD: "TT$",
  USD: "US$",
  CAD: "CA$",
  BBD: "BDS$",
  JMD: "J$",
  XCD: "EC$",
  GYD: "GY$",
};

const decimalsCache = new Map<string, number>();

/** Number of minor-unit digits for a currency (2 for TTD, 0 for JPY...). */
export function currencyDecimals(currency: string = DEFAULT_CURRENCY): number {
  const cached = decimalsCache.get(currency);
  if (cached !== undefined) return cached;
  const digits =
    new Intl.NumberFormat("en", { style: "currency", currency }).resolvedOptions()
      .maximumFractionDigits ?? 2;
  decimalsCache.set(currency, digits);
  return digits;
}

export function currencySymbol(currency: string = DEFAULT_CURRENCY): string {
  if (SYMBOL_OVERRIDES[currency]) return SYMBOL_OVERRIDES[currency];
  const part = new Intl.NumberFormat(DEFAULT_LOCALE, {
    style: "currency",
    currency,
    currencyDisplay: "narrowSymbol",
  })
    .formatToParts(0)
    .find((p) => p.type === "currency");
  return part?.value ?? currency;
}

export function assertMinor(value: number): asserts value is Minor {
  if (!Number.isSafeInteger(value)) {
    throw new RangeError(`Money values must be safe integers in minor units, got ${value}`);
  }
}

/** Exact decimal string for a minor amount, e.g. 123456 -> "1234.56". */
export function toDecimalString(minor: Minor, currency: string = DEFAULT_CURRENCY): string {
  assertMinor(minor);
  const decimals = currencyDecimals(currency);
  const negative = minor < 0;
  const digits = Math.abs(minor).toString().padStart(decimals + 1, "0");
  const whole = decimals === 0 ? digits : digits.slice(0, -decimals);
  const frac = decimals === 0 ? "" : digits.slice(-decimals);
  return `${negative ? "-" : ""}${whole}${frac ? `.${frac}` : ""}`;
}

/**
 * Parse user input into minor units. Accepts "1234", "1,234.5", "TT$ 12.30",
 * "$0.99". Returns null for anything ambiguous or malformed (including more
 * decimal places than the currency allows) — never guesses.
 */
export function parseMoney(input: string, currency: string = DEFAULT_CURRENCY): Minor | null {
  const decimals = currencyDecimals(currency);
  let s = input.trim();
  if (!s) return null;
  let negative = false;
  if (s.startsWith("-")) {
    negative = true;
    s = s.slice(1).trim();
  } else if (s.startsWith("(") && s.endsWith(")")) {
    negative = true;
    s = s.slice(1, -1).trim();
  }
  s = s.replace(/^(?:[A-Z]{2,3}\$|[A-Z]{3}|\$)\s*/i, "");
  // Commas are only valid as thousands separators.
  if (s.includes(",")) {
    if (!/^\d{1,3}(,\d{3})*(\.\d*)?$/.test(s)) return null;
    s = s.replace(/,/g, "");
  }
  const pattern = decimals === 0 ? /^\d+$/ : new RegExp(`^(\\d+)(?:\\.(\\d{0,${decimals}}))?$|^\\.(\\d{1,${decimals}})$`);
  const m = s.match(pattern);
  if (!m) return null;
  const whole = decimals === 0 ? s : (m[1] ?? "0");
  const frac = decimals === 0 ? "" : (m[2] ?? m[3] ?? "").padEnd(decimals, "0");
  const minor = Number(`${whole}${frac}`.replace(/^0+(?=\d)/, ""));
  if (!Number.isSafeInteger(minor)) return null;
  return negative ? -minor : minor;
}

type FormatOptions = {
  currency?: string;
  locale?: string;
  /** "auto" (default), "always" (+/-), "exceptZero", "never" */
  signDisplay?: "auto" | "always" | "exceptZero" | "never";
  /** Hide the minor units when they are zero (TT$1,200 instead of TT$1,200.00). */
  trimZeroCents?: boolean;
  compact?: boolean;
};

const formatterCache = new Map<string, Intl.NumberFormat>();

function getFormatter(key: string, factory: () => Intl.NumberFormat): Intl.NumberFormat {
  let f = formatterCache.get(key);
  if (!f) {
    f = factory();
    formatterCache.set(key, f);
  }
  return f;
}

/** Format minor units for display, e.g. 123456 -> "TT$1,234.56". */
export function formatMoney(minor: Minor, options: FormatOptions = {}): string {
  const currency = options.currency ?? DEFAULT_CURRENCY;
  const locale = options.locale ?? DEFAULT_LOCALE;
  const decimals = currencyDecimals(currency);
  const trim = options.trimZeroCents && minor % 10 ** decimals === 0;
  const key = [locale, currency, options.signDisplay, trim, options.compact].join("|");
  const formatter = getFormatter(
    key,
    () =>
      new Intl.NumberFormat(locale, {
        style: "currency",
        currency,
        currencyDisplay: "narrowSymbol",
        signDisplay: options.signDisplay ?? "auto",
        minimumFractionDigits: options.compact || trim ? 0 : decimals,
        maximumFractionDigits: options.compact ? 1 : decimals,
        notation: options.compact ? "compact" : "standard",
      }),
  );
  const symbol = currencySymbol(currency);
  // Intl accepts exact decimal strings; no float conversion involved.
  const value = toDecimalString(minor, currency) as unknown as number;
  return formatter
    .formatToParts(value)
    .map((p) => (p.type === "currency" ? symbol : p.value))
    .join("");
}

/** Plain number formatting for an input field: 123456 -> "1234.56". */
export function minorToInput(minor: Minor | null | undefined, currency: string = DEFAULT_CURRENCY): string {
  if (minor === null || minor === undefined) return "";
  return toDecimalString(minor, currency);
}

export function sumMinor(values: Iterable<Minor | null | undefined>): Minor {
  let total = 0;
  for (const v of values) {
    if (v === null || v === undefined) continue;
    assertMinor(v);
    total += v;
    assertMinor(total);
  }
  return total;
}

/** Percentage (0-100+, one decimal) for display — not used for money math. */
export function percentOf(part: Minor, whole: Minor): number {
  if (whole === 0) return part > 0 ? 100 : 0;
  return new Decimal(part).div(whole).times(100).toDecimalPlaces(1).toNumber();
}

/**
 * Multiply a minor amount by a percentage rate, rounding half-up to the nearest
 * minor unit. e.g. applyRate(1_000_000, "7.25") -> 72_500.
 */
export function applyRate(minor: Minor, ratePercent: Decimal.Value): Minor {
  assertMinor(minor);
  const result = new Decimal(minor)
    .times(new Decimal(ratePercent))
    .div(100)
    .toDecimalPlaces(0, Decimal.ROUND_HALF_UP)
    .toNumber();
  assertMinor(result);
  return result;
}

/** Split an amount into n parts that add up exactly (remainder to the first parts). */
export function allocateEvenly(minor: Minor, parts: number): Minor[] {
  assertMinor(minor);
  if (!Number.isInteger(parts) || parts <= 0) throw new RangeError("parts must be a positive integer");
  const sign = minor < 0 ? -1 : 1;
  const abs = Math.abs(minor);
  const base = Math.floor(abs / parts);
  const remainder = abs - base * parts;
  return Array.from({ length: parts }, (_, i) => sign * (base + (i < remainder ? 1 : 0)));
}
