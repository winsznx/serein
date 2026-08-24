/**
 * Protocol vocabulary shared by everything that talks to Serein.
 *
 * The consumer-facing labels live here rather than being written out at each call site, because the
 * product's whole posture depends on saying the same thing everywhere: a saver reads "Collecting
 * entries", a judge reads "Selecting", and both are the same on-chain state. Splitting those strings
 * across a dozen components is how they drift apart.
 */

export const CHAIN_ID = 11155111;

export enum DrawStatus {
  None = 0,
  Open = 1,
  AwaitingTotalProof = 2,
  AwaitingRandomCandidate = 3,
  AwaitingAcceptanceProof = 4,
  Selecting = 5,
  AwaitingConsistencyProof = 6,
  Finalized = 7,
}

export interface DrawStatusPresentation {
  /** What a saver sees. Plain, calm, no cryptography vocabulary. */
  readonly consumer: string;
  /** What the proof view shows. The real state name. */
  readonly technical: string;
  /** One sentence explaining what is happening and why it takes a step. */
  readonly explanation: string;
  /** True while the draw is still accepting savings for its own epoch. */
  readonly open: boolean;
  /** True once the outcome exists and can be collected. */
  readonly settled: boolean;
}

export const DRAW_STATUS: Record<DrawStatus, DrawStatusPresentation> = {
  [DrawStatus.None]: {
    consumer: "Not started",
    technical: "None",
    explanation: "This draw has not opened yet.",
    open: false,
    settled: false,
  },
  [DrawStatus.Open]: {
    consumer: "Open",
    technical: "Open",
    explanation:
      "Savings are accruing draw weight. The longer a balance is held during the draw, the more weight it earns.",
    open: true,
    settled: false,
  },
  [DrawStatus.AwaitingTotalProof]: {
    consumer: "Closing",
    technical: "AwaitingTotalProof",
    explanation:
      "The draw's total weight is frozen and encrypted. It now has to be decrypted and proved on chain before a winner can be picked, because picking one fairly needs that single number in the clear.",
    open: false,
    settled: false,
  },
  [DrawStatus.AwaitingRandomCandidate]: {
    consumer: "Picking",
    technical: "AwaitingRandomCandidate",
    explanation:
      "An encrypted random number is being drawn. It stays encrypted for the whole draw — nobody, including the people running it, ever sees it.",
    open: false,
    settled: false,
  },
  [DrawStatus.AwaitingAcceptanceProof]: {
    consumer: "Picking",
    technical: "AwaitingAcceptanceProof",
    explanation:
      "Checking whether the random number landed in the usable range. Only that yes-or-no answer is revealed; the number itself is not. If the answer is no, a fresh number is drawn.",
    open: false,
    settled: false,
  },
  [DrawStatus.Selecting]: {
    consumer: "Selecting",
    technical: "Selecting",
    explanation:
      "Walking the participant list under encryption to find whose share of the weight contains the random number. Done in batches so no single transaction exceeds the network's compute limit.",
    open: false,
    settled: false,
  },
  [DrawStatus.AwaitingConsistencyProof]: {
    consumer: "Verifying",
    technical: "AwaitingConsistencyProof",
    explanation:
      "Confirming that the encrypted walk covered exactly the published total, so nobody was skipped or counted twice.",
    open: false,
    settled: false,
  },
  [DrawStatus.Finalized]: {
    consumer: "Complete",
    technical: "Finalized",
    explanation: "The draw is settled. Results can be revealed and collected.",
    open: false,
    settled: true,
  },
};

/** Ordered lifecycle for the progress indicator. */
export const DRAW_PROGRESS_STEPS: readonly DrawStatus[] = [
  DrawStatus.Open,
  DrawStatus.AwaitingTotalProof,
  DrawStatus.AwaitingRandomCandidate,
  DrawStatus.Selecting,
  DrawStatus.AwaitingConsistencyProof,
  DrawStatus.Finalized,
];

export function progressIndex(status: DrawStatus): number {
  switch (status) {
    case DrawStatus.Open:
      return 0;
    case DrawStatus.AwaitingTotalProof:
      return 1;
    case DrawStatus.AwaitingRandomCandidate:
    case DrawStatus.AwaitingAcceptanceProof:
      return 2;
    case DrawStatus.Selecting:
      return 3;
    case DrawStatus.AwaitingConsistencyProof:
      return 4;
    case DrawStatus.Finalized:
      return 5;
    default:
      return 0;
  }
}

export interface DrawView {
  status: DrawStatus;
  startTimestamp: bigint;
  endTimestamp: bigint;
  closedTimestamp: bigint;
  participantCount: number;
  selectionCursor: number;
  randomAttempts: number;
  verifiedTotalWeight: bigint;
  randomBound: bigint;
  totalVerified: boolean;
  consistencyVerified: boolean;
  hasWinner: boolean;
}

/** Decode the tuple `SereinPool.getDraw` returns into a typed object. */
export function toDrawView(raw: readonly unknown[]): DrawView {
  return {
    status: Number(raw[0]) as DrawStatus,
    startTimestamp: BigInt(raw[1] as bigint),
    endTimestamp: BigInt(raw[2] as bigint),
    closedTimestamp: BigInt(raw[3] as bigint),
    participantCount: Number(raw[4]),
    selectionCursor: Number(raw[5]),
    randomAttempts: Number(raw[6]),
    verifiedTotalWeight: BigInt(raw[7] as bigint),
    randomBound: BigInt(raw[8] as bigint),
    totalVerified: Boolean(raw[9]),
    consistencyVerified: Boolean(raw[10]),
    hasWinner: Boolean(raw[11]),
  };
}

/**
 * The information-leakage ledger, in one place.
 *
 * This table is the product's central honesty claim, so it is data rather than prose: the app
 * renders it, PRIVACY.md is generated from it, and there is no second copy to fall out of step.
 */
export type Disclosure = "public" | "private" | "boundary";

export interface LeakageRow {
  readonly item: string;
  readonly disclosure: Disclosure;
  readonly rationale: string;
}

export const LEAKAGE_LEDGER: readonly LeakageRow[] = [
  {
    item: "That a wallet interacted with Serein",
    disclosure: "public",
    rationale: "Ordinary transaction metadata on a public chain. Nothing can hide this.",
  },
  {
    item: "Participant addresses",
    disclosure: "public",
    rationale:
      "The registry has to be public and ordered so the draw walk is deterministic and anyone can verify nobody was skipped.",
  },
  {
    item: "Your savings balance",
    disclosure: "private",
    rationale: "Held as an encrypted euint64. Only you can decrypt it.",
  },
  {
    item: "Your balance history",
    disclosure: "private",
    rationale:
      "Encrypted time-weighted observations, readable by the contract alone — not even by you, since two points would reveal the balance between them.",
  },
  {
    item: "Your draw weight",
    disclosure: "private",
    rationale: "Computed under encryption as an euint128 and never decrypted.",
  },
  {
    item: "Your odds",
    disclosure: "private",
    rationale: "Derived from your weight, which stays encrypted.",
  },
  {
    item: "Number of participants",
    disclosure: "public",
    rationale: "Operational state needed to verify the draw covered everyone.",
  },
  {
    item: "Draw timestamps and state",
    disclosure: "public",
    rationale: "Needed for liveness and for anyone to push a stalled draw forward.",
  },
  {
    item: "Total draw weight, after the draw closes",
    disclosure: "public",
    rationale:
      "Deliberate. Sampling uniformly over an arbitrary total needs that total in the clear; the alternative is an approximate draw, which would not be fair. It is published only after the interval is frozen, and it is a sum, not anyone's share.",
  },
  {
    item: "The random target",
    disclosure: "private",
    rationale:
      "Never decrypted, never granted to any address. Knowing it plus the public participant order would identify the winner.",
  },
  {
    item: "Whether a random candidate was accepted",
    disclosure: "public",
    rationale:
      "A yes-or-no verification result. It says nothing about the candidate's value, and the transcript is already visible.",
  },
  {
    item: "Who won",
    disclosure: "private",
    rationale:
      "An encrypted boolean per participant. Everyone can call the same claim function, and a non-winner moves an encrypted zero, so claiming does not disclose the outcome.",
  },
  {
    item: "The prize amount",
    disclosure: "private",
    rationale: "Allocated to a draw as an encrypted input and credited under encryption.",
  },
  {
    item: "That an address called claim or withdraw",
    disclosure: "public",
    rationale: "Transaction metadata. The amounts moved are encrypted; the fact of the call is not.",
  },
  {
    item: "Amounts wrapped into or out of the confidential token",
    disclosure: "boundary",
    rationale:
      "Wrapping crosses from a transparent ERC-20 to the confidential one, so that amount is visible. Everything after it is not. Unwrapping is likewise public.",
  },
  {
    item: "Total ever funded into the prize source",
    disclosure: "boundary",
    rationale:
      "The prize source is topped up through the same transparent boundary. How that total is split between individual draws is encrypted.",
  },
];
