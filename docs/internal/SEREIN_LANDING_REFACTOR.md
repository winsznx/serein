# Serein Landing Refactor Specification
Version 1.0
Status: Build-ready
Scope: Landing page only
Product: Serein — confidential no-loss prize savings

## 0. Mandate

Refactor the current Serein landing page from a polished protocol memo into a premium, memorable financial product landing page.

The current page has strong content and strong technical truth. Preserve the core claims, proof surfaces, privacy honesty, and existing light-to-dark brand direction. The refactor must add visual desire, cinematic pacing, product imagery, purposeful motion, scroll narrative, and a signature illustration language without turning Serein into a casino, cyberpunk privacy app, or generic DeFi site.

This is a full landing refactor. Do not lightly restyle the existing sections.

Do not alter Serein’s protocol behavior, contracts, or proof claims as part of this task.

Do not proceed into onboarding/dashboard redesign until this landing refactor is complete and visually audited on desktop and mobile.

---

# 1. Creative Direction

Serein should feel:

- premium
- calm
- financially credible
- exact
- protected
- slightly mysterious
- editorial
- product-first
- quietly technical

The emotional idea is:

> Your money is calm, protected, and intelligently participating in private.

Avoid:

- casino imagery
- roulette wheels
- jackpot graphics
- confetti
- neon cyberpunk
- chains floating in space
- anonymous hacker visuals
- generic shield-lock stock art
- huge gradients everywhere
- meaningless protocol diagrams
- dense documentation above the fold
- generic SaaS card grids
- fake product stats
- fake live metrics

The design should create two simultaneous reactions:

1. “This is beautiful.”
2. “This is serious.”

---

# 2. What To Learn From Lynx

Use Lynx as an implementation-quality reference, not as a visual template.

The useful lessons are structural:

## 2.1 Smoothness is restrained

Lynx does not rely on a giant animation framework for basic motion. Its landing uses:

- native smooth scrolling;
- an IntersectionObserver-based Reveal primitive;
- opacity + translateY only for most entrances;
- approximately 700ms reveal duration;
- a soft `cubic-bezier(0.2, 0.8, 0.2, 1)` easing;
- staggered reveal delays;
- small hover lifts and shadow changes;
- `prefers-reduced-motion` handling.

Serein should adopt the same restraint.

Do not animate every property.

Use transforms and opacity as the default.

## 2.2 Sections feel like composed scenes

Lynx’s root landing is not one long undifferentiated document. It is a sequence of composed sections, each with its own visual center of gravity.

Serein currently uses one repeated visual grammar too often.

Every Serein section should have a distinct composition while sharing the same tokens.

## 2.3 Real imagery breaks card fatigue

Lynx deliberately places real image assets and pre-rendered product visuals between textual surfaces. It does not force every story into a text card.

Serein needs a first-class `/public/visuals/` asset system.

## 2.4 Cards have tactile microstates

The useful interaction pattern:

- soft default shadow or border;
- hover raises 0.5–4px at most;
- hover shadow subtly opens;
- active controls settle down by ~0.5px;
- 200–500ms transitions;
- no springy toy motion.

## 2.5 Global surface texture matters

Lynx uses barely visible radial background washes and a dot texture to prevent a flat canvas without making the page look “designed by gradient.”

Serein should do the same with violet only.

## 2.6 A small number of high-quality visuals beats decorative noise

Use 5–7 intentional visuals across the entire landing, not dozens of icons and ornaments.

---

# 3. Preserve The Existing Serein Brand System

Use `DESIGN.md` as the visual token authority.

Core colors:

- Accent violet: `#998eff`
- Light page: `#ffffff`
- Warm light card: `#f6f7f4`
- Dark product surface: `#221d1d`
- Deep dark: `#0f0f10`
- Primary light text: `#221d1d`
- Muted text: `#636161`
- Hairline/border: `#bcbbbb`

Do not introduce a second decorative brand color.

Semantic success/warning/error colors may exist only when a real state needs them and must always be paired with text/iconography.

Primary shape language:

- cards: 20px
- featured cards: 24px
- inputs: 20px
- filled CTAs: full pill
- badges: 8px
- large compositions may use 28–32px only when they visually contain multiple cards

Typography:

- use the safe available Serein font stack, preferably General Sans or Inter if the current font is not licensed;
- weights mostly 400–500;
- hierarchy through size, spacing, tracking;
- avoid heavy 700/800 display text;
- display 64–80px desktop where space allows;
- large headlines should have tight negative tracking;
- body 15–18px.

---

# 4. New Page Narrative

The page must now move through:

1. desire
2. problem
3. understanding
4. proof
5. trust
6. conversion

Exact section order:

1. Floating / adaptive navigation
2. Hero — product desire
3. Public vs private — immediate problem
4. How it works — visual three-step flow
5. Scroll bridge — “time held should matter”
6. Exact fairness — technical hero
7. No-loss by construction — financial trust
8. Live product/proof showcase — wow section
9. Privacy disclosure teaser
10. Final CTA
11. Footer

The full disclosure ledger remains available on `/privacy` or in an expandable detailed view, but the landing only shows the most important rows.

---

# 5. Global Motion System

Build a reusable motion layer.

## 5.1 `Reveal`

Create a small reusable `Reveal` component based on IntersectionObserver.

Defaults:

```text
y: 24px
opacity: 0 → 1
duration: 650–750ms
easing: cubic-bezier(0.2, 0.8, 0.2, 1)
threshold: ~0.1
rootMargin: 0 0 -60px 0
play once
```

Props:

```text
delay
y
duration
className
```

Respect `prefers-reduced-motion`.

## 5.2 `Stagger`

For grouped children:

```text
60–110ms between children
```

Do not stagger more than 5–6 visible children.

## 5.3 Hover

Cards:

```text
translateY(-2px max)
shadow opens slightly
duration 250–350ms
```

Buttons:

```text
subtle shadow/border change
active translateY(0.5px)
200ms
```

## 5.4 Ambient loops

Only hero visual elements may loop continuously.

Maximum movement:

```text
4–8px vertical drift
0.98–1.02 scale range
6–10s duration
```

No infinite rotations.

## 5.5 Scroll-linked motion

Use scroll-linked motion only for two centerpiece moments:

- Public → Private transformation
- Exact fairness / draw transcript progression

Do not make every section parallax.

Implementation may use native scroll progress plus requestAnimationFrame, CSS scroll timelines where safe, or Motion only for these centerpiece interactions.

Do not add a heavy animation dependency for basic reveal effects.

---

# 6. Global Canvas

Current page is too visually flat.

Add a subtle ambient layer.

## Light surface

At the top of the page:

- white → soft lavender wash;
- one large violet radial bloom around the hero visual;
- faint dot / orbital line texture with opacity around 0.03–0.07;
- texture should fade toward copy so reading stays clean.

Suggested CSS concept:

```css
background:
  radial-gradient(900px 540px at 78% 28%, rgba(153,142,255,.16), transparent 62%),
  radial-gradient(720px 460px at 15% -10%, rgba(153,142,255,.08), transparent 65%),
  #fff;
```

## Dark surface

Do not use pure black everywhere.

Use:

- `#221d1d` for primary dark
- `#0f0f10` for deep cards

Add only extremely subtle violet radial light around proof artifacts.

---

# 7. Navigation Refactor

Current nav is acceptable but too static.

Desktop:

- sticky at top;
- transparent over hero initially;
- becomes a floating white capsule / lightly frosted bar after scrolling ~40–64px;
- max-width aligned to content;
- subtle 1px border;
- only sanctioned soft shadow;
- brand left;
- nav center;
- “Open app” right.

On light sections:

- dark text.

When the page enters dark technical sections:

Option A:
- nav remains light floating card.

Preferred.

This avoids constant theme-switch complexity.

Motion:

- 200–300ms background/border/shadow interpolation;
- no scale animation.

Mobile:

- brand left;
- Open app small pill;
- menu button;
- full-height or bottom-sheet menu;
- 44px minimum tap targets.

---

# 8. Hero — Rebuild Completely

## Purpose

Create desire before documentation.

The hero must be the most memorable part of the landing.

## Layout

Desktop:

```text
12-column grid
copy: 5 columns
visual stage: 7 columns
min-height: 680–760px after nav
```

Mobile:

```text
copy
CTAs
visual stage
trust microcopy
```

Do not keep the current small product card floating alone on the right.

## Copy

Eyebrow:

> SEP0LIA TESTNET · ZAMA PROTOCOL

Headline:

> Private savings.  
> Fair prizes.

Subhead:

> Save private test USDC into a shared prize pool. Your balance and draw weight stay encrypted, your odds stay exact, and your principal stays yours.

Primary CTA:

> Start saving

Secondary CTA:

> See a live draw

Small tertiary text link below:

> Read how exact fairness works

Microcopy:

> No sign-up. Connect a wallet, claim test tokens, make them private, and try the full cycle on Sepolia.

## Visual stage

Create an original Serein “private savings object” plus real UI.

The preferred hero visual is a layered composition:

### Layer A — central physical metaphor

An original soft-matte **sealed savings capsule** or **quiet vault tile**.

Visual direction:

- sculptural;
- cream / warm white;
- charcoal detail;
- violet seam or core;
- no visible padlock cliché;
- no coins flying;
- no logos from other brands.

Inside / behind it:

- a softly glowing violet encrypted core;
- tiny concealed number glyphs or dots, abstract rather than readable.

### Layer B — real product card

Large Serein savings UI, approximately 360–420px wide.

Show:

```text
Your private savings     Encrypted
•••••• USDC

Current draw             #42
Ends in                  04m 18s
Your draw weight         Private
Prize                    Private

[ Add savings ] [ Take out ]
```

### Layer C — live proof slip

Smaller floating card:

```text
Exact draw
Aggregate verified
Random target encrypted
Winner encrypted
Principal spent: 0
```

### Layer D — subtle encrypted particles

6–10 tiny blurred/dotted particles around the central object.

No sparkle field.

## Motion

On load:

1. eyebrow/copy reveal;
2. headline reveal;
3. subcopy;
4. CTA row;
5. central object scales from ~0.98 to 1 and fades;
6. product card enters from +20px x / +16px y;
7. proof slip enters after 100ms.

Ambient:

- central object y drift 4px over 8s;
- proof slip y drift in opposite phase;
- encrypted dots pulse opacity.

Mouse:

Optional desktop-only 2–3 degree perspective response across the whole visual group.

Never rotate individual cards aggressively.

## Hero quality gate

At 1440px, the hero should be screenshot-worthy with no scrolling.

At 390px, the visual composition must still feel intentional and not like cards stacked because responsive CSS failed.

---

# 9. Public vs Private Section

## Current problem

The current comparison communicates the idea but feels like two static boxes.

## New headline

Eyebrow:

> WHAT PUBLIC CHAINS EXPOSE

Headline:

> Saving onchain shouldn’t publish your position.

Short copy:

> In a public prize pool, your balance, share, odds, and history can be read by anyone. Serein keeps the financial position encrypted while preserving a verifiable draw.

## Layout

Large central interactive comparison inside one featured 24–32px container.

Desktop:

```text
LEFT: public state
CENTER: transition seam
RIGHT: Serein state
```

Mobile:

stack with an interactive toggle:

```text
Public / Serein
```

## Public state

Show:

```text
12,530.21 USDC
Share of pool      3.72%
Odds this draw     1 in 27
Last week          +4,000.00
```

## Serein state

Show:

```text
•••••• USDC
Share of pool      Private
Odds this draw     Private
History            Private
```

Footer line:

> Your address and the fact you used Serein remain public. The financial amounts do not.

## Scroll interaction

As the section enters:

- public values appear normally;
- at ~40–55% section progress, a violet veil / blur moves from center across the data;
- numbers transition to concealed dots;
- status labels transform from Visible → Encrypted.

Do not actually blur text then leave it accessible as a visual gimmick. Replace with separate concealed nodes.

Reduced motion:

show both sides statically.

---

# 10. How It Works — Replace Generic Cards

Headline:

> Three steps, then your savings do the rest.

Use a horizontal visual rail on desktop and vertical rail on mobile.

Steps:

## 01 — Make test USDC private

Copy:

> Claim test USDC, then wrap it into its confidential ERC-7984 form. The wrap crosses the transparent boundary, so Serein says that plainly.

Visual:

- public token pill on left;
- thin transition boundary;
- concealed/violet private token card on right;
- short animated flow line.

## 02 — Add private savings

Copy:

> Your amount is encrypted in the browser before the pool receives it. The contract can compute on your balance without reading the plaintext.

Visual:

- amount field enters;
- digits become dots before crossing into pool card.

## 03 — Enter exact private draws

Copy:

> Your chance is based on how much you saved and how long you kept it there. Your balance, draw weight, odds, random target, winner, and prize stay encrypted.

Visual:

- 3–5 saver bars of different lengths;
- time axis;
- bars fold into encrypted draw-weight chips;
- central draw target stays hidden.

Motion:

- steps reveal sequentially;
- connective line draws itself once;
- each mini visual has one small internal animation.

Do not use stock icons as the primary visual.

---

# 11. New Bridge Section — Time Held Matters

This is the missing product-intelligence moment.

Use a simple editorial section before the technical fairness band.

Light surface.

Headline:

> A last-second deposit shouldn’t count like a month of saving.

Supporting copy:

> Serein measures encrypted time-weighted balances. Saving more helps. Saving longer helps. A balance arriving just before the draw does not receive the same weight as capital that stayed in the pool.

Visual:

A two-user timeline.

```text
Alice   ███████████████████████  1,000
Bob                       █████  1,000
```

Then transform into:

```text
Alice draw weight     larger · encrypted
Bob draw weight       smaller · encrypted
```

No actual private user values from live state.

Use illustrative demo values and label them “example”.

Motion:

bars draw left-to-right on enter;
weights conceal after computation.

This section makes Serein’s TWAB advantage understandable before the math section.

---

# 12. Exact Fairness — Technical Hero Section

This is Serein’s technical signature.

Dark surface begins here with a hard visual transition.

## Headline

Eyebrow:

> EXACT FAIRNESS

Headline:

> Fairness survives encryption.

Subcopy:

> Every participant’s chance is their exact share of the pool’s time-weighted savings. Serein samples that distribution without exposing the individual weights, the random target, or the winner.

## Layout

Desktop:

- sticky explanatory copy / math on left;
- large live transcript window on right.

The section may be 120–160vh so scroll progress can animate the transcript without rushing.

Mobile:

normal flow, no sticky if it harms usability.

## Left content

Keep math compact:

```text
T = Σ Wᵢ
B = nextPowerOfTwo(T)
r ~ Uniform[0, B)
accept iff r < T

P(r = x | r < T) = 1/T
```

Short explanation:

> Zama’s bounded encrypted randomness works over power-of-two ranges. Serein samples the next power of two, keeps the candidate only when it falls below the verified total, and otherwise draws again. Conditioned on acceptance, every point in the real range is exactly equally likely.

CTA:

> Read the full argument

## Transcript window

Large, highly polished deep-dark card.

Rows:

```text
Draw #42                         FINALIZED
Individual balances              ENCRYPTED
Individual draw weights          ENCRYPTED
Aggregate draw weight            VERIFIED
Random candidate                 ENCRYPTED
Candidate accepted               VERIFIED
Prefix equals aggregate          VERIFIED
Winner                           ENCRYPTED
Prize                            ENCRYPTED
Principal spent on prizes        0
```

## Scroll progression

At section start:

- rows neutral / pending.

As user scrolls:

1. balances become “Encrypted”;
2. aggregate flashes to “Verified”;
3. random candidate enters as encrypted;
4. candidate acceptance becomes verified;
5. prefix consistency becomes verified;
6. winner/prize remain encrypted;
7. principal row resolves to `0`.

Do not fake live blockchain values.

This is a narrative visualization of the mechanism.

Label it:

> How a Serein draw resolves

If there is a current real live draw transcript available, add a separate “Open live proof” CTA.

## Microinteraction

Hover each row to show one-sentence explanation.

No large modal unless clicked.

---

# 13. No-Loss By Construction

Dark surface.

Eyebrow:

> NO LOSS BY CONSTRUCTION

Headline:

> Prize money has no path to your savings.

Subcopy:

> Principal and prizes live in separate financial domains. The prize reserve can pay a winner. It cannot spend the assets held as saver principal.

## Replace the current two equal cards with a system composition

Visual:

```text
Your wallet
   ↓ confidential transfer
┌──────────────────────────┐
│ PRINCIPAL POOL           │
│ encrypted saver balances │
└────────────┬─────────────┘
             │
             │ withdraw only
             ↓
          Your wallet

                       ┌─────────────────────┐
Prize source ─────────→│ PRIZE RESERVE       │
                       │ encrypted prize     │
                       └─────────┬───────────┘
                                 ↓
                              winner
```

Between prize reserve and principal:

large but tasteful blocked connector:

```text
NO SPEND PATH
```

Do not use red as the main brand treatment. Use neutral line + lock/bar glyph and copy.

Motion:

- principal path draws first;
- prize path draws second;
- attempted cross-line fades in and is stopped at divider.

Supporting footnote:

> Network gas still applies and is not principal. The Sepolia prize source is operator funded, not a claim of real yield.

---

# 14. New Wow Section — “A Draw You Can Inspect”

This is the landing’s product/proof crescendo.

Dark surface, but visually richer than the fairness section.

Headline:

> Private doesn’t mean invisible to verification.

Subcopy:

> Every public boundary Serein needs for fairness is exposed with a proof trail. The private financial values remain encrypted.

## Visual

Create a large browser-window style product composition, not a fake terminal.

Top chrome:

```text
Serein / Proof / Draw #42
Sepolia
```

Main body split:

### Left 65%

Real proof view screenshot/component:

- draw state timeline;
- participant count;
- aggregate verification;
- randomness status;
- selection progress;
- principal invariant.

### Right 35%

Evidence rail:

- Pool contract
- Prize reserve
- draw tx
- aggregate proof tx
- finalization tx
- source verified
- reproduce link

Use real live data if currently available.

If live data is unavailable, render labeled structural placeholders and do not invent transaction IDs.

CTA row:

- Inspect live draw
- View contracts
- Read evidence

## Motion

- browser frame rises into view;
- status rail reveals sequentially;
- no fake loading spinner.

This should be the “judge stops scrolling” section.

---

# 15. Privacy Disclosure — Landing Teaser Only

Keep the current full ledger on `/privacy`.

Landing version:

Eyebrow:

> WHAT IS PUBLIC

Headline:

> A privacy claim you can audit.

Copy:

> Serein does not claim anonymity. It states exactly what the public chain can see and exactly what stays encrypted.

Show only these rows:

| Information | State |
|---|---|
| Wallet interacted with Serein | Public |
| Savings balance | Encrypted |
| Draw weight | Encrypted |
| Odds | Encrypted |
| Aggregate draw weight after close | Public |
| Random target | Encrypted |
| Winner | Encrypted |
| Prize amount | Encrypted |

Use three chip types:

- Public
- Encrypted
- Boundary

Do not rely on color alone.

CTA:

> Read the complete disclosure ledger

Caveat card:

> Small pools reveal more through aggregates. Serein says so instead of pretending otherwise.

Keep this card concise on landing.

---

# 16. Final CTA

Dark/deep surface.

Use more breathing room than current version.

Headline:

> See private savings resolve into a fair draw.

Supporting:

> Claim test USDC, make it private, add savings, and inspect the complete Sepolia cycle.

Primary:

> Start saving

Secondary:

> Inspect a live draw

Optional proof link:

> View source

Visual:

A final simplified sealed-core motif in the background, oversized and barely visible.

No separate decorative illustration needed.

---

# 17. Footer

Keep compact.

Columns:

- Product
- Understand
- Verify

Include:

- Open app
- Add savings
- Draw history
- How it works
- Privacy
- Security model
- Proof
- Contracts
- GitHub/source

Footer legal:

> Sepolia testnet. Test tokens have no monetary value. Serein has not been independently audited.

Do not overcrowd.

---

# 18. Asset System To Create

Create original Serein visual assets.

Folder:

```text
public/visuals/
  serein-capsule.webp
  serein-capsule-dark.webp
  private-boundary.webp
  twab-time-graphic.webp
  proof-window.webp
```

Prefer WebP/AVIF.

Do not use giant 2–5MB PNGs.

## Asset 1 — Hero object

A soft editorial 3D savings capsule / vault tile.

Palette:

- warm cream
- charcoal
- soft violet core
- no second accent

## Asset 2 — Boundary graphic

A public token / transparent number crossing into concealed private state.

Could be rendered in CSS/HTML if cleaner.

## Asset 3 — TWAB graphic

Prefer HTML/CSS/SVG rather than raster because the bars need animation.

## Asset 4 — Proof window

Use actual product UI rendered in DOM rather than raster where possible.

---

# 19. Product-Surface Rules

Use real UI as imagery.

Every product preview must correspond to an actual or intended Serein product state.

No invented:

- APY
- TVL
- user count
- live prize
- draw number claimed as real when not real
- transaction hash
- verification badge

If a visual is illustrative:

label it:

> Example draw

or:

> Product preview

---

# 20. Copy Density Rules

Landing section body:

- ideal 1–3 sentences;
- max ~70–90 words before expansion;
- detailed explanation lives behind “Read more”, `/proof`, `/privacy`, or `/docs`.

Current technically rich copy should be preserved in detailed pages, not deleted.

The landing should not force a judge to read a protocol document to understand the product.

---

# 21. Responsive Requirements

Audit at:

- 320
- 360
- 390
- 430
- 768
- 1024
- 1280
- 1440
- 1728

## Hero mobile

Order:

1. eyebrow
2. headline
3. subcopy
4. CTA row
5. visual
6. microcopy

Do not put microcopy above the visual on mobile if it pushes the product too far below the fold.

## Sticky fairness section

Disable or simplify sticky scroll behavior under 768px.

The mobile version should show the transcript rows naturally.

## Comparison

Use a segmented toggle or horizontal snap cards on mobile.

No tiny side-by-side columns.

## Tables

Privacy teaser remains readable without horizontal scrolling.

Full disclosure ledger can use cards at small widths.

---

# 22. Performance Requirements

Peak UX means fast.

Requirements:

- landing must not eagerly initialize Zama WASM;
- no wallet provider hydration needed above the fold unless the nav/open-app flow genuinely needs it;
- lazy load deep technical visuals;
- hero visual should use optimized image sizes;
- use CSS transforms/opacity for animations;
- avoid scroll event handlers doing layout reads every frame;
- prefer IntersectionObserver;
- if using scroll progress, throttle through `requestAnimationFrame`;
- reserve dimensions to avoid CLS;
- no autoplay video background;
- no huge Lottie bundle;
- no heavy WebGL unless there is a compelling measurable reason.

Lighthouse should remain strong after the visual refactor.

---

# 23. Accessibility

- `prefers-reduced-motion` disables all nonessential motion;
- scroll-linked sections become normal static sections;
- status chips include text, not color only;
- contrast meets WCAG AA;
- 44px touch targets;
- semantic headings stay in logical order;
- product illustrations have empty alt if decorative;
- meaningful screenshots have concise alt;
- focus state is visible;
- hover-only details must also be keyboard accessible;
- sticky sections must not trap keyboard focus.

---

# 24. Implementation Components

Suggested components:

```text
components/marketing/
  LandingNav.tsx
  Reveal.tsx
  Stagger.tsx
  HeroVisual.tsx
  EncryptedValue.tsx
  PublicPrivateCompare.tsx
  PrivateBoundaryFlow.tsx
  TwabTimeline.tsx
  FairnessTranscript.tsx
  PrincipalPrizeDiagram.tsx
  ProofShowcase.tsx
  DisclosureTeaser.tsx
  FinalCTA.tsx
```

Keep page composition thin:

```text
app/page.tsx
```

should mostly compose sections rather than contain giant JSX blobs.

---

# 25. Interaction Details

## Encrypted value

Create a reusable state:

```text
••••••
```

with optional violet “Encrypted” chip.

Reveal animation on marketing demo:

- do not reveal actual sensitive value;
- use illustrative values only;
- blur/dissolve into dots.

## Chips

Public:
neutral gray/white.

Encrypted:
violet-tinted subtle fill.

Verified:
neutral/high-contrast with check icon, do not introduce a permanent green brand lane on the marketing surface.

Boundary:
outline / dotted treatment.

---

# 26. Do Not Copy Lynx

Do not clone:

- Lynx’s exact bento structure;
- its emerald/orange/violet palette;
- its testimonial layout;
- its copy;
- its card arrangement;
- its hero photography.

Borrow only:

- reveal discipline;
- spacing discipline;
- high-quality image use;
- scene-based composition;
- restrained hover motion;
- smooth-easing philosophy;
- reduced-motion care;
- product imagery as a break from text.

Serein must remain visibly Serein.

---

# 27. Landing Acceptance Gates

The landing refactor is not complete until:

## Visual

- hero has a memorable visual system;
- no above-fold empty dead zone;
- no section feels like a generic template;
- at least 4 sections use meaningful visuals rather than text cards;
- light → dark transition feels intentional;
- only violet is used as decorative accent;
- screenshot at 1440px feels submission-ready.

## Motion

- scroll reveal is consistent;
- stagger is restrained;
- public/private transition teaches something;
- fairness transcript progression teaches something;
- no jank on a normal laptop;
- reduced-motion works;
- no animation blocks input.

## Product truth

- no fake onchain claims;
- all privacy copy remains accurate;
- aggregate disclosure caveat remains visible;
- no-loss structure remains accurately described;
- current live proof links point to real data.

## Mobile

- 390px flow is designed, not merely responsive;
- no horizontal overflow;
- CTAs remain visible;
- hero composition remains premium;
- technical sections remain readable;
- sticky effects degrade gracefully.

## Performance

- no unnecessary animation framework for trivial effects;
- Zama SDK is not loaded on the marketing landing path unless needed;
- image assets optimized;
- Core Web Vitals reasonable;
- no CLS from visual assets.

---

# 28. QA Pass Before Dashboard Work

After implementation:

1. build production;
2. test deployed Cloudflare Workers page, not only local dev;
3. manually scroll entire landing at:
   - 390px
   - 768px
   - 1440px
4. test reduced motion;
5. test keyboard only;
6. test slow 4G / throttled CPU;
7. check all CTA links;
8. inspect console for hydration/layout warnings;
9. run Lighthouse;
10. take full-page screenshots for desktop/mobile;
11. compare against this spec;
12. fix visual monotony before moving to onboarding.

---

# 29. Exact Builder Handoff

Use this instruction with this file plus the existing PRD and DESIGN.md:

> Refactor only Serein’s marketing landing page according to `SEREIN_LANDING_REFACTOR.md`, while preserving the existing protocol claims, routes, contracts, and product behavior. `DESIGN.md` remains the token and visual-system authority. The refactor must add a first-class hero visual system, product imagery, scene-based layout, restrained scroll motion, interactive public/private storytelling, encrypted-TWAB explanation, a cinematic exact-fairness transcript, structural no-loss visualization, a real proof showcase, a lighter disclosure teaser, and first-class mobile behavior. Study the implementation lessons documented from the Lynx landing but do not copy its palette, layout, assets, or copy. Use native CSS/IntersectionObserver for ordinary reveals and only add heavier motion tooling where a scroll-linked centerpiece genuinely needs it. Do not continue into onboarding or dashboard redesign until the landing passes every acceptance gate in this document. Run production build, deployed smoke tests, responsive QA, reduced-motion QA, and performance checks before reporting completion.
