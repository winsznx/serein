import type { Metadata } from "next";

import { DocSection, DocTitle, P } from "@/components/prose";
import { StatusPill } from "@/components/ui";
import { CHAIN, deployment, explorerAddress, explorerTx } from "@/lib/chain";
import { getDeployment } from "@serein/protocol-sdk";

export const metadata: Metadata = {
  title: "Live contracts",
  description:
    "Deployed Serein contract addresses on Sepolia, the commit they were built from, and links to verified source.",
};

const DESCRIPTIONS: Record<string, string> = {
  SereinPool:
    "Holds every saver's encrypted principal, maintains the encrypted time-weighted balance history, and runs the draw. Has no owner and no admin function.",
  SereinPrizeReserve:
    "Holds prize funds and pays them out. Holds no principal, and there is no code path from here to the pool's balances.",
  MockPrizeSource:
    "The Sepolia stand-in for yield. An operator adds test tokens; those become the prize for a specific draw. It cannot touch principal.",
  ConfidentialUSDC:
    "The ERC-7984 confidential form of the test token. A thin instantiation of OpenZeppelin's audited wrapper.",
  TestUSDC:
    "A six-decimal faucet token with no monetary value, so a reviewer can complete the whole cycle from a fresh wallet.",
};

/**
 * On the canonical deployment, the `ConfidentialUSDC`/`TestUSDC` manifest slots hold Zama's own
 * registered `cUSDCMock`/`USDCMock` — contracts Serein does not deploy, own, or verify. Serein does
 * not get to claim "source verified" for a contract it did not compile, and there is no deployment
 * transaction of ours to link, since the deploy script resolved these from Zama's registry rather
 * than deploying them.
 */
const ZAMA_DESCRIPTIONS: Record<string, string> = {
  ConfidentialUSDC:
    "Zama's registered Sepolia cUSDCMock — an ERC-7984 confidential wrapper Serein does not deploy or own. Resolved at deploy time through Zama's Confidential Token Wrappers Registry.",
  TestUSDC:
    "Zama's registered Sepolia USDCMock, the plain ERC-20 cUSDCMock wraps. A public mint(address,uint256), capped at 1,000,000 per call.",
};

const ORDER = [
  "SereinPool",
  "SereinPrizeReserve",
  "MockPrizeSource",
  "ConfidentialUSDC",
  "TestUSDC",
];

/**
 * Live addresses, read from the single deployment manifest.
 *
 * Nothing on this page is typed by hand. The manifest is written by the deploy script and imported
 * at build time, so a stale address here would be a build-time impossibility rather than a
 * documentation bug someone has to notice.
 */
export default function ContractsPage() {
  const state = deployment();
  const manifest = getDeployment(CHAIN.id);

  if (!state.ready) {
    return (
      <>
        <DocTitle>Live contracts</DocTitle>
        <P>
          This build carries no deployment for {CHAIN.name}. The manifest at{" "}
          <code className="rounded-badge bg-bone px-1.5 py-0.5 font-mono text-caption">
            deployments/{CHAIN.id}.json
          </code>{" "}
          is empty.
        </P>
      </>
    );
  }

  return (
    <>
      <DocTitle lead={`Deployed on ${CHAIN.name} from commit ${state.commit.slice(0, 12)}.`}>
        Live contracts
      </DocTitle>

      <DocSection title="Deployment">
        <dl className="rounded-card border border-ash/50 p-5">
          <div className="flex justify-between gap-4 border-b border-ash/40 py-2.5">
            <dt className="text-small text-iron">Network</dt>
            <dd className="text-small font-medium">
              {CHAIN.name} ({CHAIN.id})
            </dd>
          </div>
          <div className="flex justify-between gap-4 border-b border-ash/40 py-2.5">
            <dt className="text-small text-iron">Commit</dt>
            <dd className="font-mono text-caption">{state.commit}</dd>
          </div>
          <div className="flex justify-between gap-4 border-b border-ash/40 py-2.5">
            <dt className="text-small text-iron">Deployed</dt>
            <dd className="text-small">{state.deployedAt}</dd>
          </div>
          <div className="flex justify-between gap-4 py-2.5">
            <dt className="text-small text-iron">Draw cadence</dt>
            <dd className="tabular text-small font-medium">{state.drawDurationSeconds}s</dd>
          </div>
        </dl>
      </DocSection>

      <DocSection title="Addresses">
        <div className="space-y-4">
          {ORDER.filter((name) => manifest.contracts[name]).map((name) => {
            const entry = manifest.contracts[name]!;
            const isExternal =
              state.isZamaCanonical && (name === "ConfidentialUSDC" || name === "TestUSDC");
            const description = isExternal ? ZAMA_DESCRIPTIONS[name] : DESCRIPTIONS[name];
            return (
              <div key={name} className="rounded-card border border-ash/50 p-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-body font-medium text-midnight">{name}</h3>
                  <StatusPill state={isExternal ? "public" : "verified"}>
                    {isExternal ? "External · Zama" : "Source verified"}
                  </StatusPill>
                </div>
                <p className="mt-2 text-small text-iron">{description}</p>
                <p className="truncate-hex mt-3 font-mono text-caption text-iron">
                  {entry.address}
                </p>
                <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-caption">
                  <a
                    href={explorerAddress(entry.address)}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="text-midnight underline underline-offset-4"
                  >
                    Etherscan
                  </a>
                  <a
                    href={`https://repo.sourcify.dev/${CHAIN.id}/${entry.address}`}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="text-midnight underline underline-offset-4"
                  >
                    Verified source
                  </a>
                  {entry.txHash ? (
                    <a
                      href={explorerTx(entry.txHash)}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="text-midnight underline underline-offset-4"
                    >
                      Deployment tx
                    </a>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      </DocSection>

      <DocSection title="Verification">
        <P>
          Every contract is verified on Sourcify with an exact metadata match, which means the
          published source compiles to precisely the bytecode at that address — not merely something
          similar. Sourcify was chosen because it requires no API key, so source verification is
          never blocked on a credential.
        </P>
      </DocSection>
    </>
  );
}
