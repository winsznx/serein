import { deployment } from "@/lib/chain";

/** Test USDC has six decimals, like the asset it stands in for. */
export const TOKEN_DECIMALS = 6;

/**
 * On the canonical deployment these are Zama's own registered contracts — `USDCMock` and
 * `cUSDCMock` are their real on-chain `symbol()` values, not names Serein made up. `tUSDC`/`ptUSDC`
 * only apply on the legacy, Serein-owned token pair, which the local test fixtures and `deploy.ts`
 * still use. The manifest is static and bundled at build time, so this is exactly as safe as the
 * `TOKEN_DECIMALS` constant above it — one deployment per build, decided before any of this runs.
 */
export const TOKEN_SYMBOL = deployment().isZamaCanonical ? "USDCMock" : "tUSDC";
export const PRIVATE_TOKEN_SYMBOL = deployment().isZamaCanonical ? "cUSDCMock" : "ptUSDC";

export function formatTokenAmount(
  raw: bigint,
  options: { maximumFractionDigits?: number } = {},
): string {
  const negative = raw < 0n;
  const value = negative ? -raw : raw;
  const base = 10n ** BigInt(TOKEN_DECIMALS);
  const whole = value / base;
  const fraction = value % base;

  const maxDigits = options.maximumFractionDigits ?? 2;
  const scaled = fraction / 10n ** BigInt(TOKEN_DECIMALS - maxDigits);
  const fractionText = maxDigits > 0 ? `.${scaled.toString().padStart(maxDigits, "0")}` : "";

  return `${negative ? "-" : ""}${whole.toLocaleString("en-US")}${fractionText}`;
}

export function parseTokenAmount(input: string): bigint | null {
  const trimmed = input.trim().replace(/,/g, "");
  if (trimmed === "") return null;
  if (!/^\d*\.?\d*$/.test(trimmed)) return null;

  const [wholeText = "0", fractionText = ""] = trimmed.split(".");
  if (fractionText.length > TOKEN_DECIMALS) return null;

  const padded = fractionText.padEnd(TOKEN_DECIMALS, "0");
  try {
    return BigInt(wholeText || "0") * 10n ** BigInt(TOKEN_DECIMALS) + BigInt(padded || "0");
  } catch {
    return null;
  }
}

export function truncateAddress(address: string, lead = 6, tail = 4): string {
  if (address.length <= lead + tail + 2) return address;
  return `${address.slice(0, lead)}…${address.slice(-tail)}`;
}

/**
 * A countdown that stays readable when it is long and precise when it is short.
 *
 * Draws run on a short cadence, so "4m 12s" matters more than "in a few minutes"; but a draw that
 * is 3 days out should not render as "4,412m".
 */
export function formatCountdown(seconds: number): string {
  if (seconds <= 0) return "due now";
  const days = Math.floor(seconds / 86_400);
  const hours = Math.floor((seconds % 86_400) / 3_600);
  const minutes = Math.floor((seconds % 3_600) / 60);
  const secs = Math.floor(seconds % 60);

  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${String(secs).padStart(2, "0")}s`;
  return `${secs}s`;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * Format a chain timestamp identically on the server and in the browser.
 *
 * `toLocaleString` resolves against the runtime's timezone, so the server renders UTC and the client
 * renders local — a hydration mismatch that React reports as an opaque minified error and that only
 * shows up once something drives a real browser. Formatting explicitly in UTC removes the ambiguity,
 * and labelling it UTC removes the ambiguity for the reader too.
 */
export function formatTimestamp(seconds: bigint | number): string {
  const millis = Number(seconds) * 1000;
  if (!Number.isFinite(millis) || millis <= 0) return "—";
  const date = new Date(millis);
  const pad = (value: number): string => String(value).padStart(2, "0");
  return (
    `${pad(date.getUTCDate())} ${MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()} ` +
    `${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())} UTC`
  );
}

/**
 * Draw weight is balance-seconds — a large number with no natural unit.
 *
 * The proof view shows it in full because a judge is checking an exact value against the chain.
 * Everywhere else it is grouped, because an ungrouped 18-digit integer is unreadable and invites the
 * reader to assume it is a token amount, which it is not.
 */
export function formatWeight(weight: bigint): string {
  return weight.toLocaleString("en-US");
}

export function formatCompactWeight(weight: bigint): string {
  const units: [bigint, string][] = [
    [10n ** 12n, "T"],
    [10n ** 9n, "B"],
    [10n ** 6n, "M"],
    [10n ** 3n, "K"],
  ];
  for (const [scale, suffix] of units) {
    if (weight >= scale) {
      const whole = weight / scale;
      const remainder = ((weight % scale) * 10n) / scale;
      return `${whole}.${remainder}${suffix}`;
    }
  }
  return weight.toString();
}

/** The masked stand-in for a value that has not been revealed. Never a zero. */
export const CIPHERTEXT_MASK = "••••••";
