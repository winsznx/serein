/**
 * Scenario generation and simulation.
 *
 * A scenario is a fully deterministic description of a pool's life across one
 * draw epoch: who deposited, who withdrew, when, and what happened after the
 * draw closed. Simulating it produces the numbers the FHE implementation must
 * reproduce exactly — the per-user weights, the aggregate, the accepted random
 * target, and the winner index.
 *
 * These are deterministic scenarios, not users. Nothing here is evidence of
 * adoption; it is evidence that the algorithm is the algorithm we claim.
 */

import { MAX_TOTAL_PRINCIPAL } from "./bounds.js";
import { Prng } from "./prng.js";
import { TwabSeries, assertAggregateConsistency } from "./twab.js";
import { nextPowerOfTwo, runWeightedDraw, type SelectionResult } from "./weighted.js";

export type ActionKind = "deposit" | "withdraw";

export interface Action {
  readonly kind: ActionKind;
  readonly participant: number;
  readonly timestamp: bigint;
  /** Requested amount. A withdrawal is clamped to the available balance. */
  readonly amount: bigint;
}

export type ScenarioShape =
  | "equal"
  | "ratio-1-2"
  | "ratio-1-2-7"
  | "whale-and-minnows"
  | "late-deposit"
  | "early-withdrawal"
  | "zero-weight-participants"
  | "churn"
  | "full-exit"
  | "single-participant"
  | "max-bounds"
  | "random";

export interface Scenario {
  readonly id: string;
  readonly seed: string;
  readonly shape: ScenarioShape;
  readonly participantCount: number;
  readonly epochStart: bigint;
  readonly epochEnd: bigint;
  /** Actions inside the epoch, ordered by timestamp. */
  readonly actions: readonly Action[];
  /** Actions after the epoch closed. Must not move the frozen weights. */
  readonly postCloseActions: readonly Action[];
  /** Prize allocated to this draw, in confidential token units. */
  readonly prize: bigint;
}

export interface AppliedAction extends Action {
  /** Amount actually applied after clamping / bound rejection. */
  readonly effectiveAmount: bigint;
  readonly rejected: boolean;
}

export interface SimulationResult {
  readonly scenario: Scenario;
  readonly applied: readonly AppliedAction[];
  readonly weights: readonly bigint[];
  readonly aggregateWeight: bigint;
  readonly selection: SelectionResult;
  /** Balances at epoch end, before any post-close action. */
  readonly balancesAtClose: readonly bigint[];
  /** Weights recomputed after post-close actions. Must equal `weights`. */
  readonly weightsAfterPostClose: readonly bigint[];
  readonly prizeCredits: readonly bigint[];
}

/**
 * A pool whose balance bookkeeping mirrors the encrypted implementation,
 * including the two places where FHE forces different semantics than ordinary
 * Solidity: a withdrawal is clamped rather than reverted, and a deposit that
 * would breach the total-principal bound is rejected wholesale.
 */
export class PoolModel {
  readonly users: TwabSeries[];
  readonly aggregate = new TwabSeries();
  private readonly balances: bigint[];

  constructor(participantCount: number, startTimestamp: bigint) {
    this.users = Array.from({ length: participantCount }, () => new TwabSeries());
    this.balances = Array.from({ length: participantCount }, () => 0n);
    // Only the aggregate series is seeded at genesis. A participant's series begins at their first
    // deposit, exactly as `SereinPool` does it — a leading zero-balance observation would cost a
    // storage slot on chain and contribute nothing, since `cumulativeAt` before a series starts is
    // already zero.
    this.aggregate.write(startTimestamp, 0n);
  }

  get total(): bigint {
    return this.balances.reduce((acc, b) => acc + b, 0n);
  }

  balanceOf(participant: number): bigint {
    const balance = this.balances[participant];
    if (balance === undefined) throw new RangeError(`unknown participant ${participant}`);
    return balance;
  }

  apply(action: Action): AppliedAction {
    const current = this.balanceOf(action.participant);

    if (action.kind === "deposit") {
      // Mirrors the ERC-7984 receiver: the encrypted bound check decides whether
      // the callback returns success, and a failed callback refunds the sender
      // rather than crediting a clamped amount.
      const wouldBe = this.total + action.amount;
      if (wouldBe > MAX_TOTAL_PRINCIPAL) {
        return { ...action, effectiveAmount: 0n, rejected: true };
      }
      this.setBalance(action.participant, action.timestamp, current + action.amount);
      return { ...action, effectiveAmount: action.amount, rejected: false };
    }

    // Mirrors `FHE.min(requested, balance)`: over-withdrawing is not an error,
    // it simply takes everything available. Reverting would leak the balance.
    const effective = action.amount < current ? action.amount : current;
    this.setBalance(action.participant, action.timestamp, current - effective);
    return { ...action, effectiveAmount: effective, rejected: false };
  }

  private setBalance(participant: number, timestamp: bigint, next: bigint): void {
    this.balances[participant] = next;
    this.users[participant]!.write(timestamp, next);
    this.aggregate.write(timestamp, this.total);
  }
}

export function simulateScenario(scenario: Scenario): SimulationResult {
  const pool = new PoolModel(scenario.participantCount, scenario.epochStart);
  const applied: AppliedAction[] = [];

  for (const action of scenario.actions) applied.push(pool.apply(action));

  const weights = pool.users.map((series) =>
    series.weightBetween(scenario.epochStart, scenario.epochEnd),
  );
  const aggregateWeight = pool.aggregate.weightBetween(scenario.epochStart, scenario.epochEnd);
  assertAggregateConsistency(pool.aggregate, pool.users, scenario.epochStart, scenario.epochEnd);

  const balancesAtClose = pool.users.map((_, i) => pool.balanceOf(i));

  const prng = new Prng(`${scenario.seed}:draw`);
  const selection = runWeightedDraw(weights, (bound) => prng.nextBelow(bound));

  // The invariant that makes withdraw-during-a-draw safe: replay everything that
  // happens after the epoch closes and confirm the frozen weights do not budge.
  for (const action of scenario.postCloseActions) pool.apply(action);
  const weightsAfterPostClose = pool.users.map((series) =>
    series.weightBetween(scenario.epochStart, scenario.epochEnd),
  );

  const prizeCredits = weights.map((_, i) => (i === selection.winnerIndex ? scenario.prize : 0n));

  return {
    scenario,
    applied,
    weights,
    aggregateWeight,
    selection,
    balancesAtClose,
    weightsAfterPostClose,
    prizeCredits,
  };
}

const HOUR = 3600n;
const UNIT = 1_000_000n; // 6 decimals, matching test USDC

interface GenerateOptions {
  readonly seed: string;
  readonly shape?: ScenarioShape;
  readonly epochStart?: bigint;
  readonly epochSeconds?: bigint;
}

const ALL_SHAPES: readonly ScenarioShape[] = [
  "equal",
  "ratio-1-2",
  "ratio-1-2-7",
  "whale-and-minnows",
  "late-deposit",
  "early-withdrawal",
  "zero-weight-participants",
  "churn",
  "full-exit",
  "single-participant",
  "max-bounds",
  "random",
];

export function generateScenario(options: GenerateOptions): Scenario {
  const prng = new Prng(options.seed);
  const shape = options.shape ?? prng.pick(ALL_SHAPES);
  const epochStart = options.epochStart ?? 1_800_000_000n;
  const epochSeconds = options.epochSeconds ?? HOUR;
  const epochEnd = epochStart + epochSeconds;

  const actions: Action[] = [];
  const postCloseActions: Action[] = [];

  const deposit = (participant: number, timestamp: bigint, amount: bigint): void => {
    actions.push({ kind: "deposit", participant, timestamp, amount });
  };
  const withdraw = (participant: number, timestamp: bigint, amount: bigint): void => {
    actions.push({ kind: "withdraw", participant, timestamp, amount });
  };

  let participantCount: number;

  switch (shape) {
    case "equal": {
      participantCount = prng.nextInt(2, 12);
      const amount = prng.nextRange(1n, 5_000n) * UNIT;
      for (let i = 0; i < participantCount; i++) deposit(i, epochStart, amount);
      break;
    }

    case "ratio-1-2": {
      participantCount = 2;
      const base = prng.nextRange(1n, 5_000n) * UNIT;
      deposit(0, epochStart, base);
      deposit(1, epochStart, base * 2n);
      break;
    }

    case "ratio-1-2-7": {
      participantCount = 3;
      const base = prng.nextRange(1n, 2_000n) * UNIT;
      deposit(0, epochStart, base);
      deposit(1, epochStart, base * 2n);
      deposit(2, epochStart, base * 7n);
      break;
    }

    case "whale-and-minnows": {
      participantCount = prng.nextInt(5, 40);
      deposit(0, epochStart, prng.nextRange(500_000n, 2_000_000n) * UNIT);
      for (let i = 1; i < participantCount; i++) {
        deposit(i, epochStart, prng.nextRange(1n, 50n) * UNIT);
      }
      break;
    }

    case "late-deposit": {
      // A deposit landing at 90% of the epoch earns 10% of the weight it would
      // have earned from the start. This is the whole point of TWAB.
      participantCount = prng.nextInt(2, 8);
      const amount = prng.nextRange(100n, 5_000n) * UNIT;
      for (let i = 0; i < participantCount - 1; i++) deposit(i, epochStart, amount);
      deposit(participantCount - 1, epochStart + (epochSeconds * 9n) / 10n, amount * 4n);
      break;
    }

    case "early-withdrawal": {
      participantCount = prng.nextInt(2, 8);
      const amount = prng.nextRange(100n, 5_000n) * UNIT;
      for (let i = 0; i < participantCount; i++) deposit(i, epochStart, amount);
      withdraw(0, epochStart + epochSeconds / 10n, amount);
      break;
    }

    case "zero-weight-participants": {
      participantCount = prng.nextInt(3, 10);
      const amount = prng.nextRange(100n, 5_000n) * UNIT;
      const active = prng.nextInt(1, participantCount - 1);
      for (let i = 0; i < active; i++) deposit(i, epochStart, amount);
      // The rest register by depositing exactly at the epoch boundary, which
      // accrues no weight for this epoch but must not break selection.
      for (let i = active; i < participantCount; i++) deposit(i, epochEnd, amount);
      break;
    }

    case "churn": {
      participantCount = prng.nextInt(2, 10);
      for (let i = 0; i < participantCount; i++) {
        deposit(i, epochStart, prng.nextRange(100n, 2_000n) * UNIT);
      }
      const churnCount = prng.nextInt(4, 24);
      const stamps: bigint[] = [];
      for (let i = 0; i < churnCount; i++) {
        stamps.push(epochStart + prng.nextRange(1n, epochSeconds - 1n));
      }
      stamps.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
      for (const timestamp of stamps) {
        const participant = prng.nextInt(0, participantCount - 1);
        const amount = prng.nextRange(1n, 1_500n) * UNIT;
        if (prng.nextInt(0, 1) === 0) deposit(participant, timestamp, amount);
        else withdraw(participant, timestamp, amount);
      }
      break;
    }

    case "full-exit": {
      participantCount = prng.nextInt(2, 8);
      const amount = prng.nextRange(100n, 5_000n) * UNIT;
      for (let i = 0; i < participantCount; i++) deposit(i, epochStart, amount);
      // Over-withdraw on purpose: the clamp must take exactly the balance.
      withdraw(0, epochStart + epochSeconds / 2n, amount * 10n);
      break;
    }

    case "single-participant": {
      participantCount = 1;
      deposit(0, epochStart, prng.nextRange(1n, 10_000n) * UNIT);
      break;
    }

    case "max-bounds": {
      // Push the aggregate close to MAX_TOTAL_PRINCIPAL so the euint128
      // cumulative and the power-of-two bound are exercised near their ceiling.
      participantCount = prng.nextInt(2, 5);
      const share = MAX_TOTAL_PRINCIPAL / BigInt(participantCount + 1);
      for (let i = 0; i < participantCount; i++) deposit(i, epochStart, share);
      break;
    }

    case "random":
    default: {
      participantCount = prng.nextInt(1, 25);
      for (let i = 0; i < participantCount; i++) {
        if (prng.nextInt(0, 9) === 0) continue; // some addresses register with nothing
        deposit(
          i,
          epochStart + prng.nextRange(0n, epochSeconds),
          prng.nextRange(1n, 10_000n) * UNIT,
        );
      }
      const extra = prng.nextInt(0, 12);
      const stamps: bigint[] = [];
      for (let i = 0; i < extra; i++) stamps.push(epochStart + prng.nextRange(0n, epochSeconds));
      stamps.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
      for (const timestamp of stamps) {
        const participant = prng.nextInt(0, participantCount - 1);
        const amount = prng.nextRange(1n, 5_000n) * UNIT;
        if (prng.nextInt(0, 1) === 0) deposit(participant, timestamp, amount);
        else withdraw(participant, timestamp, amount);
      }
      break;
    }
  }

  actions.sort((a, b) => (a.timestamp < b.timestamp ? -1 : a.timestamp > b.timestamp ? 1 : 0));

  // Every scenario gets post-close activity so invariant 20/21 is exercised on
  // the whole corpus rather than in one dedicated test.
  const postCloseCount = prng.nextInt(0, 4);
  for (let i = 0; i < postCloseCount; i++) {
    const participant = prng.nextInt(0, participantCount - 1);
    const timestamp = epochEnd + prng.nextRange(1n, 600n);
    const amount = prng.nextRange(1n, 5_000n) * UNIT;
    postCloseActions.push({
      kind: prng.nextInt(0, 1) === 0 ? "deposit" : "withdraw",
      participant,
      timestamp,
      amount,
    });
  }
  postCloseActions.sort((a, b) =>
    a.timestamp < b.timestamp ? -1 : a.timestamp > b.timestamp ? 1 : 0,
  );

  return {
    id: options.seed,
    seed: options.seed,
    shape,
    participantCount,
    epochStart,
    epochEnd,
    actions,
    postCloseActions,
    prize: prng.nextRange(1n, 500n) * UNIT,
  };
}

export function generateCorpus(count: number, prefix = "serein"): Scenario[] {
  const scenarios: Scenario[] = [];
  // Cover every named shape deterministically before filling out with random
  // ones, so a small corpus is still representative.
  for (let i = 0; i < count; i++) {
    const seed = `${prefix}/${i}`;
    const shape = ALL_SHAPES[i % ALL_SHAPES.length];
    scenarios.push(
      i < ALL_SHAPES.length * 8 && shape !== undefined
        ? generateScenario({ seed, shape })
        : generateScenario({ seed }),
    );
  }
  return scenarios;
}

export { nextPowerOfTwo, ALL_SHAPES };
