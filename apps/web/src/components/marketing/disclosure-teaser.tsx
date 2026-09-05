import { ButtonLink, Card, StatusPill } from "@/components/ui";
import { LEAKAGE_LEDGER } from "@serein/protocol-sdk";

/**
 * A curated eight rows from the real disclosure ledger — not a separate, invented summary.
 *
 * Each label below is matched against `LEAKAGE_LEDGER` at build time so a change to the actual
 * disclosure model (the thing `/docs/privacy` renders in full) can't silently drift from what the
 * landing page claims. Dark surface, matching every section since the fairness band — DESIGN.md's
 * rule is one hard light-to-dark cut, not an oscillation back to light and dark again.
 */

const TEASER_ITEMS = [
  "That a wallet interacted with Serein",
  "Your savings balance",
  "Your draw weight",
  "Your odds",
  "Total draw weight, after the draw closes",
  "The random target",
  "Who won",
  "The prize amount",
];

const TEASER_LABELS: Record<string, string> = {
  "That a wallet interacted with Serein": "Wallet interacted with Serein",
  "Your savings balance": "Savings balance",
  "Your draw weight": "Draw weight",
  "Your odds": "Odds",
  "Total draw weight, after the draw closes": "Total draw weight, after close",
  "The random target": "Random target",
  "Who won": "Winner",
  "The prize amount": "Prize amount",
};

const STATE_MAP = {
  public: { state: "public" as const, label: "Public" },
  private: { state: "encrypted" as const, label: "Encrypted" },
  boundary: { state: "public" as const, label: "Boundary" },
};

export function DisclosureTeaser() {
  const rows = TEASER_ITEMS.map((item) => {
    const row = LEAKAGE_LEDGER.find((entry) => entry.item === item);
    if (!row) throw new Error(`Disclosure teaser references a missing ledger item: "${item}"`);
    return { ...row, label: TEASER_LABELS[item] ?? item };
  });

  return (
    <div className="space-y-6">
      <div className="overflow-hidden rounded-feature border border-white/10">
        <table className="w-full border-collapse text-left">
          <caption className="sr-only">
            What Serein discloses publicly and what stays encrypted
          </caption>
          <tbody>
            {rows.map((row) => (
              <tr key={row.item} className="border-b border-white/10 last:border-b-0">
                <th scope="row" className="px-5 py-3.5 text-small font-normal text-white/85">
                  {row.label}
                </th>
                <td className="px-5 py-3.5 text-right">
                  <StatusPill state={STATE_MAP[row.disclosure].state}>
                    {STATE_MAP[row.disclosure].label}
                  </StatusPill>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <Card surface="deep" className="flex-1 p-5">
          <p className="text-small text-white/65">
            Small pools reveal more through aggregates. Serein says so instead of pretending
            otherwise.
          </p>
        </Card>
        <ButtonLink href="/docs/privacy" tone="ghost-dark" className="shrink-0">
          Read the complete disclosure ledger
        </ButtonLink>
      </div>
    </div>
  );
}
