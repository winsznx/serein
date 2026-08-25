import { expect, test } from "@playwright/test";

/**
 * What a visitor sees before connecting a wallet.
 *
 * This is where a privacy product is most likely to accidentally lie — by rendering an undisclosed
 * value as `0.00`, or by claiming more privacy than it delivers. Several tests below exist purely to
 * make those failures loud.
 */

test.describe("landing", () => {
  test("states the product, not a slogan about privacy", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Private savings");
    await expect(page.getByRole("link", { name: "Start saving" }).first()).toBeVisible();
  });

  test("publishes the disclosure ledger, including the deliberate one", async ({ page }) => {
    await page.goto("/");
    const table = page.getByRole("table", { name: /disclose/i });
    await expect(table).toBeVisible();
    // The aggregate is the one intentional disclosure; it must be findable, not buried.
    await expect(table).toContainText("Total draw weight");
    await expect(table).toContainText("Encrypted");
    await expect(table).toContainText("Public");
  });

  test("does not overclaim", async ({ page }) => {
    await page.goto("/");
    const body = ((await page.textContent("body")) ?? "").toLowerCase();

    // Match the *claim*, not the word. Serein deliberately uses "anonymous" and "untraceable" in
    // sentences that deny them, and a test that flagged the bare word would punish the honesty it
    // is supposed to enforce.
    const overclaims = [
      /\b(is|are|stays?|remains?|keeps? you)\s+(completely\s+|fully\s+|totally\s+)?(anonymous|untraceable)\b/,
      /\bimpossible to (hack|break|trace)\b/,
      /\bfully trustless\b/,
      /\bguaranteed (prize|return|yield)\b/,
      /\beverything is private\b/,
      /\b100% (private|anonymous|secure)\b/,
    ];
    for (const pattern of overclaims) {
      expect(body, `landing page makes the claim ${pattern}`).not.toMatch(pattern);
    }

    // And it must actively state the limit rather than merely avoiding the word.
    expect(body).toMatch(/your address and the fact you saved are public/);
  });

  test("carries the testnet disclaimer", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText(/Sepolia testnet/i).first()).toBeVisible();
    await expect(page.getByText(/no monetary value/i).first()).toBeVisible();
    await expect(page.getByText(/not been independently audited/i).first()).toBeVisible();
  });

  test("shows no APY, because none is measured", async ({ page }) => {
    await page.goto("/");
    const body = (await page.textContent("body")) ?? "";
    expect(body).not.toMatch(/\d+(\.\d+)?\s*%\s*APY/i);
    expect(body.toLowerCase()).not.toContain("earn up to");
  });
});

test.describe("encrypted values", () => {
  test("never renders an undisclosed value as a number", async ({ page }) => {
    await page.goto("/app");
    // Disconnected, nothing personal should resolve to a figure. The mask is the honest rendering:
    // showing 0.00 would look authoritative and be false.
    const body = (await page.textContent("body")) ?? "";
    expect(body).not.toMatch(/Your private savings[\s\S]{0,40}0\.00/);
  });

  test("masks with dots rather than a placeholder number", async ({ page }) => {
    await page.goto("/");
    // The landing preview shows a savings card in its honest default state: dots, not 0.00.
    await expect(page.getByText("••••••").first()).toBeVisible();
    const body = (await page.textContent("body")) ?? "";
    expect(body).not.toMatch(/USDC saved[\s\S]{0,20}0\.00/);
  });
});

test.describe("proof view", () => {
  test("reads live chain state and separates public from encrypted", async ({ page }) => {
    await page.goto("/proof");
    await expect(page.getByRole("heading", { name: /Check the claims/i })).toBeVisible();
    await expect(page.getByText("Individual balances")).toBeVisible();
    await expect(page.getByText(/Encrypted/).first()).toBeVisible();
    await expect(page.getByText("Participants")).toBeVisible();
  });

  test("invites the reader to try breaking it", async ({ page }) => {
    await page.goto("/proof");
    await expect(page.getByRole("heading", { name: /Try to break it/i })).toBeVisible();
  });

  test("renders a draw transcript with real transactions", async ({ page }) => {
    await page.goto("/proof/draws/3");
    await expect(page.getByRole("heading", { name: /Draw transcript/i })).toBeVisible();
    await expect(page.getByText(/Aggregate draw weight/i)).toBeVisible();
    await expect(page.getByText(/Random target/i)).toBeVisible();
  });

  test("rejects a malformed draw id without crashing", async ({ page }) => {
    await page.goto("/proof/draws/not-a-number");
    await expect(page.getByText(/not a draw number/i)).toBeVisible();
  });
});

test.describe("docs", () => {
  const PAGES = [
    { path: "/docs/how-it-works", heading: /How Serein works/i },
    { path: "/docs/privacy", heading: /What is public and what is not/i },
    { path: "/docs/security", heading: /Security model/i },
    { path: "/docs/contracts", heading: /Live contracts/i },
  ];

  for (const { path, heading } of PAGES) {
    test(`${path} renders`, async ({ page }) => {
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 1, name: heading })).toBeVisible();
    });
  }

  test("the contracts page shows verified live addresses", async ({ page }) => {
    await page.goto("/docs/contracts");
    await expect(page.getByText("SereinPool").first()).toBeVisible();
    await expect(page.getByRole("link", { name: /Verified source/i }).first()).toBeVisible();
  });

  test("the privacy page states the small-pool caveat", async ({ page }) => {
    await page.goto("/docs/privacy");
    await expect(page.getByText(/subtract their own/i).first()).toBeVisible();
  });
});

test.describe("responsive", () => {
  test("never scrolls horizontally", async ({ page }) => {
    for (const path of ["/", "/app", "/proof", "/docs/privacy"]) {
      await page.goto(path);
      const overflows = await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
      );
      expect(overflows, `${path} overflows horizontally`).toBe(false);
    }
  });

  test("primary actions meet the 44px touch target floor", async ({ page }) => {
    await page.goto("/");
    const cta = page.getByRole("link", { name: "Start saving" }).first();
    const box = await cta.boundingBox();
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
  });
});

test.describe("accessibility", () => {
  // Tab-key navigation is a pointer-free desktop affordance. WebKit on a simulated touch device does
  // not move focus between links without Full Keyboard Access, so asserting it there tests the
  // emulator rather than the page. The landmark check still runs everywhere via the title test.
  test.describe("keyboard", () => {
    test.skip(({ isMobile }) => Boolean(isMobile), "keyboard navigation is a desktop affordance");

    test("offers a skip link and a main landmark", async ({ page }) => {
      await page.goto("/");
      await page.keyboard.press("Tab");
      await expect(page.getByRole("link", { name: /skip to content/i })).toBeFocused();
      await expect(page.locator("#main")).toBeAttached();
    });

    test("keeps focus visible when tabbing", async ({ page }) => {
      await page.goto("/");
      await page.keyboard.press("Tab");
      await page.keyboard.press("Tab");
      const outline = await page.evaluate(() => {
        const el = document.activeElement;
        if (!el) return null;
        return getComputedStyle(el).outlineStyle;
      });
      expect(outline).not.toBe("none");
    });
  });

  test("marks a main landmark on every surface", async ({ page }) => {
    for (const path of ["/", "/app", "/proof", "/docs/privacy"]) {
      await page.goto(path);
      await expect(page.locator("#main")).toBeAttached();
    }
  });

  test("gives pages distinct titles", async ({ page }) => {
    const titles = new Set<string>();
    for (const path of ["/", "/app", "/proof", "/docs/privacy", "/docs/security"]) {
      await page.goto(path);
      titles.add(await page.title());
    }
    expect(titles.size).toBeGreaterThan(1);
  });
});

test.describe("rpc proxy", () => {
  test("serves live chain reads", async ({ request }) => {
    const response = await request.post("/api/rpc", {
      data: { jsonrpc: "2.0", id: 1, method: "eth_chainId", params: [] },
    });
    expect(response.ok()).toBe(true);
    const body = (await response.json()) as { result?: string };
    expect(body.result).toBe("0xaa36a7");
  });

  test("refuses to relay transactions", async ({ request }) => {
    const response = await request.post("/api/rpc", {
      data: { jsonrpc: "2.0", id: 2, method: "eth_sendRawTransaction", params: ["0xdead"] },
    });
    const body = (await response.json()) as { error?: { code: number; message: string } };
    expect(body.error?.code).toBe(-32601);
    expect(body.error?.message).toMatch(/read-only/i);
  });
});
