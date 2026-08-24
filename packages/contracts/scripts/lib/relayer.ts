/**
 * Retry wrapper for calls that cross the Zama relayer.
 *
 * The public testnet relayer is a shared service, and under load it drops bodies mid-response —
 * observed live as `UND_ERR_BODY_TIMEOUT` after about two seconds, and as connect timeouts while
 * fetching the 4.4 MB CRS. Neither is a protocol failure and neither means the request was
 * processed: a decryption that times out simply did not happen, so retrying is safe.
 *
 * This matters beyond convenience. If a keeper gave up on the first relayer hiccup, draws would
 * stall for reasons unrelated to the chain, and the liveness claim would be false. Draw state lives
 * on chain and every step is idempotent, so the correct response to a transport failure is to try
 * again — which is what this does, with backoff, and with a clear error if it truly cannot proceed.
 */

export interface RetryOptions {
  attempts?: number;
  baseDelayMs?: number;
  label?: string;
  log?: (message: string) => void;
}

const TRANSIENT = [
  /body timeout/i,
  /connect timeout/i,
  /terminated/i,
  /fetch failed/i,
  /socket hang up/i,
  /ECONNRESET/i,
  /ETIMEDOUT/i,
  /EAI_AGAIN/i,
  /JSON parsing failed/i,
  /502|503|504/,
  /rate.?limit|429/i,
];

export function isTransientRelayerError(error: unknown): boolean {
  const text = collectMessages(error).join(" | ");
  return TRANSIENT.some((pattern) => pattern.test(text));
}

function collectMessages(error: unknown, depth = 0): string[] {
  if (depth > 6 || typeof error !== "object" || error === null) {
    return error === undefined ? [] : [String(error)];
  }
  const candidate = error as { message?: string; cause?: unknown; _details?: string };
  const messages: string[] = [];
  if (typeof candidate.message === "string") messages.push(candidate.message);
  if (typeof candidate._details === "string") messages.push(candidate._details);
  if (candidate.cause !== undefined) messages.push(...collectMessages(candidate.cause, depth + 1));
  return messages;
}

export async function withRelayerRetry<T>(
  operation: () => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const attempts = options.attempts ?? 5;
  const baseDelayMs = options.baseDelayMs ?? 2_000;
  const label = options.label ?? "relayer call";
  const log = options.log ?? (() => {});

  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (!isTransientRelayerError(error) || attempt === attempts) break;
      const delay = baseDelayMs * 2 ** (attempt - 1);
      log(`   ${label} failed (attempt ${attempt}/${attempts}), retrying in ${delay / 1000}s`);
      await new Promise((done) => setTimeout(done, delay));
    }
  }

  const detail = collectMessages(lastError)[0] ?? String(lastError);
  throw new Error(
    `${label} did not succeed after ${attempts} attempts. The relayer is a shared public ` +
      `service and this is usually transient — on-chain state is unchanged, so the operation can ` +
      `be retried. Last error: ${detail}`,
    { cause: lastError },
  );
}
