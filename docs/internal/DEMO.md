# Demo script

A three-minute walkthrough. Recorded by a real person, at normal speed, with a real wallet.

**Do not** AI-generate the voice or the video. Speak plainly; the mechanism is interesting enough
without a pitch voice.

**Live app:** https://serein.timjosh507.workers.dev

## Before recording

- A fresh browser profile with a wallet extension, on Sepolia, holding a little test ETH.
- Several wallets you control already holding savings, so the recording can show a real encrypted
  prize being revealed and collected rather than relying on a live draw's luck.
- The keeper running (`keeper:sepolia`), so a draw closes during the recording.
- Two tabs: the app, and `/proof`.

### Know which wallet will claim, before you record

The winner is genuinely unknowable from outside — `isCredited` is set for every participant during
selection, winner or not, so only a participant's own key can decrypt whether their credit is
nonzero. That is a real property, not a recording inconvenience, and this doesn't get around it: it
only works because every wallet in the roster is one you already control.

Once a draw with your wallets has finalized, check all of them at once, off camera:

```
SEREIN_DRAW_ID=<id> hardhat run scripts/check-winner.ts --network sepolia
```

It decrypts each controlled wallet's credit for that draw using that wallet's own key (the same
signature a real saver would give in the app) and reports which one actually won and whether it has
already claimed. Import **that wallet's** private key into the recording browser profile for the
segment below — the reveal and the collect are both real, you just aren't leaving which wallet to
feature to chance during a take. If nothing has an unclaimed win yet, run another live draw
(`hardhat run scripts/live-proof.ts --network sepolia`) and check again once it finalizes.

Check the current draw's countdown first and start recording so that step 8 lands near the close.

---

## The script

**0:00 — What it is** _(15s)_

> This is Serein. It's a savings account that runs a prize draw. Your balance is encrypted, your odds
> are encrypted, and your principal is never at risk. Everything you see is live on Sepolia.

Landing page. Don't linger.

**0:15 — Get in** _(35s)_

Connect wallet → Add savings. Walk the three steps.

> The faucet gives me test tokens. Then I make them private — and I want to be clear that _this_
> transaction is public, you can see the amount on Etherscan. Everything after it isn't.

Enter an amount, save it.

> Notice this: "Encrypting your amount." That's happening in my browser. The plaintext never leaves.

**0:50 — The signature move** _(30s)_

On the savings home, the balance shows `••••••`.

> That's not a loading state and it's not zero. The app genuinely cannot read my balance. To see it, I
> sign a read authorisation — this doesn't move funds — and the value comes back to my browser only.

Click Reveal, sign, show the number.

> Refresh the page and it's dots again. It was never stored anywhere.

Refresh to show it.

**1:20 — Someone else's balance** _(20s)_

Switch to `/proof`, or open Wallet B's address.

> Here's another saver's balance handle. It's on-chain, anyone can read the handle. But it's a
> pointer, not a number — and the relayer will not decrypt it for my wallet.

Show the refusal, or the recorded refusals in the campaign artifact.

**1:40 — The draw** _(45s)_

Go to `/proof/draws/<current>` as the draw closes.

> The draw just closed. It published exactly one number — the total weight, summed across everyone.
> Not my weight, not anyone's balance. A sum.

> It has to be public, and this is the interesting part: to pick a winner fairly you need a random
> number spread evenly across that total. The coprocessor only gives you random numbers bounded by a
> power of two. So Serein samples over the next power of two up, and throws the number away if it
> lands too high. Conditioned on keeping it, it's exactly uniform. No rounding, no approximation.

Point at the bound and the attempt count.

> The random target itself stays encrypted. There's its handle — try to decrypt it, it's refused.
> Then it walks the participant list under encryption to find whose share contains that point.
> Nobody, including the people running this, learns who won.

**2:25 — Reveal and collect the winning result** _(20s)_

Switch to the wallet `check-winner.ts` identified beforehand. Reveal its result and collect.

> This wallet won. The prize amount was encrypted until this wallet authorized the reveal, and now it
> can collect it. Everyone uses the same collect function; a non-winner moves an encrypted zero, so
> claim calldata, events, and transfer amounts do not directly disclose the result.

Optional, if there's time: switch to a non-winning controlled wallet first and reveal its result too,
so the recording shows both outcomes using the identical button and identical-looking transaction.

**2:45 — Take it out** _(15s)_

Withdraw.

> And my principal comes back out. This works at every stage of a draw — mid-selection, keeper
> offline, doesn't matter. Prize money and savings are in two different contracts with no path
> between them.

**3:00 — Close**

> Verified contracts, no admin key, no owner. Everything I showed is on Sepolia and reproducible from
> the repo.

---

## Optional: the recovery clip _(45s)_

Worth recording separately if there's time. It demonstrates resumability better than any slide.

1. Start a draw; run `processSelectionBatch` for part of the list.
2. Kill the keeper mid-walk. Show the cursor stopped partway on `/proof/draws/<id>`.
3. From a **completely different address**, continue: the cursor resumes exactly where it stopped.
4. Finalize. Same draw, same result.

> The keeper isn't privileged. It's a convenience. Anyone can finish a draw, and a batch that fails
> just leaves the cursor where it was.

---

## Things to avoid

- Don't call it anonymous or untraceable. It isn't, and PRIVACY.md says exactly why.
- Don't skip the wrap-is-public disclosure. Volunteering it is the point.
- Don't dress a non-winning draw as a near miss. It isn't a loss.
- Don't quote a number you haven't measured. No APY — there is no yield.
- Don't speed up the video to hide latency. Public-decryption round trips take a few seconds; say so
  if it's noticeable.

## If something breaks on camera

The relayer is a shared public service and sometimes drops a request. If a reveal fails, say so and
retry — the retry is honest and the recovery is part of the product. Don't cut it out and pretend it
didn't happen.
