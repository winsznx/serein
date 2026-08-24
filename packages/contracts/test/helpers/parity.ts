import { FhevmType } from "@fhevm/hardhat-plugin";
import type { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { time } from "@nomicfoundation/hardhat-network-helpers";
import { fhevm } from "hardhat";

import { TwabSeries } from "@serein/reference-model";

import { type SereinStack } from "./fixture";

/**
 * Reconstruct an encrypted TWAB series as plaintext, straight from contract storage.
 *
 * This uses the mock coprocessor's debug decryptor, which ignores the ACL. It exists only inside the
 * Hardhat mock and has no counterpart on a real network — nothing in the deployed system can read
 * these handles, which is exactly what the ACL tests assert separately. Here it buys something worth
 * having: the ability to check the encrypted series against the plaintext reference model
 * observation by observation, rather than only checking the one aggregate the protocol publishes.
 */
export async function readSeries(
  stack: SereinStack,
  account: string | null,
): Promise<{ timestamp: bigint; balance: bigint; cumulative: bigint }[]> {
  const count =
    account === null
      ? await stack.pool.aggregateObservationCount()
      : await stack.pool.observationCount(account);

  const observations: { timestamp: bigint; balance: bigint; cumulative: bigint }[] = [];
  for (let i = 0n; i < count; i++) {
    const raw =
      account === null
        ? await stack.pool.aggregateObservationAt(i)
        : await stack.pool.observationAt(account, i);
    observations.push({
      timestamp: raw[0],
      balance: await fhevm.debugger.decryptEuint(FhevmType.euint64, raw[1]),
      cumulative: await fhevm.debugger.decryptEuint(FhevmType.euint128, raw[2]),
    });
  }
  return observations;
}

/** Rebuild the reference-model series from the same observations and confirm they agree. */
export function toReferenceSeries(
  observations: readonly { timestamp: bigint; balance: bigint }[],
): TwabSeries {
  const series = new TwabSeries();
  for (const observation of observations) series.write(observation.timestamp, observation.balance);
  return series;
}

export type ScriptedAction =
  | { kind: "deposit"; signer: HardhatEthersSigner; amount: bigint; atOffset: bigint }
  | { kind: "withdraw"; signer: HardhatEthersSigner; amount: bigint; atOffset: bigint };

export interface ScriptedRun {
  epochStart: bigint;
  epochEnd: bigint;
  applied: { account: string; kind: string; amount: bigint; timestamp: bigint }[];
}

/**
 * Execute a list of actions at exact timestamps relative to the current draw's start.
 *
 * Pinning each block's timestamp is what makes the on-chain run comparable with the reference model:
 * TWAB weight is an integral over time, so an unpinned run would differ by however many seconds the
 * test framework happened to advance.
 */
export async function runScript(
  stack: SereinStack,
  actions: readonly ScriptedAction[],
): Promise<ScriptedRun> {
  const drawId = await stack.pool.currentDrawId();
  const draw = await stack.pool.getDraw(drawId);
  const epochStart = draw.startTimestamp;
  const epochEnd = draw.endTimestamp;

  const ordered = [...actions].sort((a, b) =>
    a.atOffset < b.atOffset ? -1 : a.atOffset > b.atOffset ? 1 : 0,
  );

  const applied: ScriptedRun["applied"] = [];
  for (const action of ordered) {
    // Build the encrypted input first. Pinning the timestamp only holds for the next block, so any
    // work that might mine one has to happen before the pin, not after it.
    const target = action.kind === "deposit" ? stack.addresses.confidentialUSDC : stack.addresses.pool;
    const input = await fhevm
      .createEncryptedInput(target, action.signer.address)
      .add64(action.amount)
      .encrypt();

    const at = epochStart + action.atOffset;
    const now = BigInt(await time.latest());
    if (at > now) await time.setNextBlockTimestamp(at);

    const tx =
      action.kind === "deposit"
        ? await stack.confidentialUSDC
            .connect(action.signer)
            ["confidentialTransferAndCall(address,bytes32,bytes,bytes)"](
              stack.addresses.pool,
              input.handles[0]!,
              input.inputProof,
              "0x",
            )
        : await stack.pool
            .connect(action.signer)
            ["withdraw(bytes32,bytes)"](input.handles[0]!, input.inputProof);

    const receipt = (await tx.wait())!;
    const block = await receipt.getBlock();
    applied.push({
      account: action.signer.address,
      kind: action.kind,
      amount: action.amount,
      timestamp: BigInt(block.timestamp),
    });
  }

  return { epochStart, epochEnd, applied };
}
