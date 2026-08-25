import { NextResponse } from "next/server";

/**
 * A narrow, read-only JSON-RPC proxy.
 *
 * Two things this buys, and one thing it deliberately does not.
 *
 * It keeps the provider key server-side. Putting an Alchemy URL in a `NEXT_PUBLIC_` variable ships
 * it to every visitor and to anyone who views source, and a key that is public is a key that is
 * being used by strangers.
 *
 * It lets a visitor who has not connected a wallet still read live chain state, so the landing page
 * and the proof view work before anyone signs anything.
 *
 * It is not a trust dependency. Only read methods are forwarded — nothing here can move funds,
 * because it never sees a private key and refuses to relay a signed transaction. Every number the
 * app shows through this route is independently checkable on a block explorer, and if the route is
 * down, wallets still transact directly.
 */

/**
 * Read-only allowlist. `eth_sendRawTransaction` is absent on purpose: the wallet broadcasts its own
 * transactions, so relaying them here would add a censorship point for no benefit.
 */
const ALLOWED_METHODS = new Set([
  "eth_blockNumber",
  "eth_call",
  "eth_chainId",
  "eth_estimateGas",
  "eth_feeHistory",
  "eth_gasPrice",
  "eth_getBalance",
  "eth_getBlockByHash",
  "eth_getBlockByNumber",
  "eth_getCode",
  "eth_getLogs",
  "eth_getStorageAt",
  "eth_getTransactionByHash",
  "eth_getTransactionCount",
  "eth_getTransactionReceipt",
  "eth_maxPriorityFeePerGas",
  "net_version",
]);

const MAX_BATCH = 32;
const MAX_BODY_BYTES = 256 * 1024;

interface RpcRequest {
  jsonrpc?: string;
  id?: number | string | null;
  method?: string;
  params?: unknown[];
}

function rejection(id: RpcRequest["id"], code: number, message: string): unknown {
  return { jsonrpc: "2.0", id: id ?? null, error: { code, message } };
}

export async function POST(request: Request): Promise<NextResponse> {
  const upstream = process.env.SEPOLIA_RPC_URL;
  if (!upstream) {
    return NextResponse.json(rejection(null, -32000, "The app has no RPC endpoint configured."), {
      status: 503,
    });
  }

  const raw = await request.text();
  if (raw.length > MAX_BODY_BYTES) {
    return NextResponse.json(rejection(null, -32600, "Request too large."), { status: 413 });
  }

  let payload: RpcRequest | RpcRequest[];
  try {
    payload = JSON.parse(raw) as RpcRequest | RpcRequest[];
  } catch {
    return NextResponse.json(rejection(null, -32700, "Malformed JSON."), { status: 400 });
  }

  const calls = Array.isArray(payload) ? payload : [payload];
  if (calls.length === 0 || calls.length > MAX_BATCH) {
    return NextResponse.json(
      rejection(null, -32600, `Batch must contain between 1 and ${MAX_BATCH} calls.`),
      { status: 400 },
    );
  }

  const blocked = calls.find((call) => !call.method || !ALLOWED_METHODS.has(call.method));
  if (blocked) {
    return NextResponse.json(
      rejection(
        blocked.id,
        -32601,
        `Method "${blocked.method ?? "(missing)"}" is not available through this endpoint. ` +
          `It forwards read-only calls only; send transactions from your wallet.`,
      ),
      { status: 400 },
    );
  }

  try {
    const response = await fetch(upstream, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: raw,
      signal: AbortSignal.timeout(15_000),
    });

    const body = await response.text();
    return new NextResponse(body, {
      status: response.status,
      headers: {
        "content-type": "application/json",
        // Chain reads are cheap to repeat and quickly stale. A very short shared cache absorbs the
        // thundering herd of a page load without ever showing a draw state that has moved on.
        "cache-control": "public, max-age=0, s-maxage=2, stale-while-revalidate=4",
      },
    });
  } catch (error) {
    const timedOut = error instanceof Error && error.name === "TimeoutError";
    return NextResponse.json(
      rejection(
        null,
        -32603,
        timedOut
          ? "The RPC provider timed out. Chain data may be briefly stale; your funds are unaffected."
          : "The RPC provider is unreachable. Chain data may be briefly stale; your funds are unaffected.",
      ),
      { status: 502 },
    );
  }
}

export async function GET(): Promise<NextResponse> {
  return NextResponse.json(
    { ok: true, methods: [...ALLOWED_METHODS].sort(), note: "POST JSON-RPC read calls here." },
    { headers: { "cache-control": "public, max-age=300" } },
  );
}
