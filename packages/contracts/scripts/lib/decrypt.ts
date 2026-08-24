import { fhevm } from "hardhat";

export type Hex = `0x${string}`;

type PublicDecryptResult = Awaited<ReturnType<typeof fhevm.publicDecrypt>>;

function clearValue(result: PublicDecryptResult, handle: string): bigint | boolean | string {
  const value = result.clearValues[handle as Hex];
  if (value === undefined) {
    throw new Error(
      `the relayer returned no cleartext for handle ${handle} ` +
        `(got: ${Object.keys(result.clearValues).join(", ") || "nothing"})`,
    );
  }
  return value;
}

export interface DecryptedNumber {
  value: bigint;
  proof: Hex;
  handle: string;
}

export interface DecryptedBoolean {
  value: boolean;
  proof: Hex;
  handle: string;
}

/**
 * Publicly decrypt one handle and keep the KMS proof alongside the value.
 *
 * The pair is what matters. A cleartext on its own proves nothing — the on-chain
 * `FHE.checkSignatures` verifies that the KMS signed *this* number for *this* handle, so the value
 * and the proof have to travel together or the submission is meaningless.
 *
 * Only handles the protocol deliberately marked publicly decryptable can be read this way: the
 * frozen aggregate weight and the two verification booleans. Anything else — an individual balance,
 * a historical observation, the random target, a winner predicate — is refused by the relayer, which
 * the adversarial tests confirm by trying.
 */
export async function publicDecryptNumber(handle: string): Promise<DecryptedNumber> {
  const result = await fhevm.publicDecrypt([handle]);
  const raw = clearValue(result, handle);
  if (typeof raw === "boolean") {
    throw new Error(`handle ${handle} decrypted to a boolean, expected a number`);
  }
  return { value: BigInt(raw), proof: result.decryptionProof, handle };
}

export async function publicDecryptBoolean(handle: string): Promise<DecryptedBoolean> {
  const result = await fhevm.publicDecrypt([handle]);
  const raw = clearValue(result, handle);
  return { value: Boolean(raw), proof: result.decryptionProof, handle };
}
