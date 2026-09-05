import { FhevmType } from "@fhevm/hardhat-plugin";
import { ethers, fhevm } from "hardhat";

import { addressOf, loadManifest } from "./lib/manifest";
import { initFhevm, withRelayerRetry } from "./lib/relayer";
import type { SereinPrizeReserve } from "../types";

/**
 * Find out who won a draw before recording anything.
 *
 * The winner is deliberately unknowable from outside: `isCredited` is set for every participant
 * during selection, winner or not, so who actually holds a nonzero credit can only be read by that
 * participant's own key. That is the whole point of the design — nobody, including whoever runs
 * this script, learns the result of a real saver's draw by watching the chain.
 *
 * It's a different question for a demo recording. Every signer this script can check is one Serein
 * itself controls (`.secrets/wallets.env`), so decrypting all six here doesn't leak anything to a
 * third party — it just lets the person recording pick, off camera, which wallet's on-camera reveal
 * will show a real prize instead of leaving it to chance during a take.
 *
 * Usage: `SEREIN_DRAW_ID=<id> hardhat run scripts/check-winner.ts --network sepolia`
 */
async function main(): Promise<void> {
  const chainId = Number((await ethers.provider.getNetwork()).chainId);
  const manifest = loadManifest(chainId);
  await initFhevm(fhevm, { requireLive: true });

  const drawIdArg = process.env.SEREIN_DRAW_ID;
  if (!drawIdArg) throw new Error("set SEREIN_DRAW_ID to the draw you want to check");
  const drawId = BigInt(drawIdArg);

  const reserveAddress = addressOf(manifest, "SereinPrizeReserve");
  const reserve = (await ethers.getContractAt(
    "SereinPrizeReserve",
    reserveAddress,
  )) as unknown as SereinPrizeReserve;

  const signers = await ethers.getSigners();
  const roster = [
    { role: "participant-a", signer: signers[2] },
    { role: "participant-b", signer: signers[3] },
    { role: "participant-c", signer: signers[4] },
    { role: "participant-d", signer: signers[5] },
    { role: "participant-e", signer: signers[6] },
    { role: "participant-f", signer: signers[7] },
  ].filter((entry): entry is { role: string; signer: NonNullable<typeof entry.signer> } =>
    Boolean(entry.signer),
  );

  // The manifest's "ConfidentialUSDC" slot holds Zama's own registered cUSDCMock on the canonical
  // deployment, not a Serein-owned token — printing "ptUSDC" there would be exactly the stale,
  // pre-migration name that got fixed everywhere else. See lib/format.ts on the frontend for the
  // same distinction.
  const tokenSymbol = manifest.tokenSource === "zama-canonical" ? "cUSDCMock" : "ptUSDC";

  console.log(`Checking draw #${drawId} on ${manifest.network}\n`);

  let winner: { role: string; address: string; claimed: boolean } | null = null;

  for (const { role, signer } of roster) {
    const credited = await reserve.isCredited(drawId, signer.address);
    if (!credited) {
      console.log(
        `${role.padEnd(16)} ${signer.address}  not yet credited (selection hasn't reached them)`,
      );
      continue;
    }

    const claimed = await reserve.hasClaimed(drawId, signer.address);
    const handle = await reserve.confidentialCreditOf(drawId, signer.address);
    const credit = await withRelayerRetry(
      () => fhevm.userDecryptEuint(FhevmType.euint64, handle, reserveAddress, signer),
      { label: `reveal credit for ${role}`, log: (m) => console.log(`   ${m}`) },
    );

    const wonThis = credit > 0n;
    console.log(
      `${role.padEnd(16)} ${signer.address}  ` +
        `${wonThis ? `WON ${ethers.formatUnits(credit, 6)} ${tokenSymbol}` : "no prize"}  ` +
        `${claimed ? "(already claimed)" : "(unclaimed)"}`,
    );
    if (wonThis) winner = { role, address: signer.address, claimed };
  }

  console.log();
  if (!winner) {
    console.log(
      "No winner found among the checked wallets — either none won, or selection hasn't finished.",
    );
    return;
  }
  if (winner.claimed) {
    console.log(
      `${winner.role} (${winner.address}) won, but has already claimed. Nothing left to show.`,
    );
  } else {
    console.log(
      `Use ${winner.role} (${winner.address}) for the on-camera reveal — it has a real, unclaimed prize.`,
    );
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
