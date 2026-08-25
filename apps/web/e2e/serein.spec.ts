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

/**
 * Wallet session persistence.
 *
 * The bug these guard against: with `localStorage` and no SSR state, the server renders every page
 * logged-out and the browser only reconnects after mount, so a refresh flashes "Connect wallet" and
 * a returning user concludes they were disconnected. Nothing was lost — but the product said it was.
 *
 * A minimal EIP-1193 provider is injected so there is something to connect to. Signing is never
 * exercised here; the contract suite and the live campaign cover that with real keys.
 */
test.describe("wallet session", () => {
  const ACCOUNT = "0xDc4CF937848129047de43AA5Ff8adb4620dB7B07";

  const INJECTED_PROVIDER = `
    window.ethereum = {
      isMetaMask: true,
      isConnected: () => true,
      request: async ({ method }) => {
        if (method === "eth_requestAccounts" || method === "eth_accounts") return ["${ACCOUNT}"];
        if (method === "eth_chainId") return "0xaa36a7";
        if (method === "net_version") return "11155111";
        return null;
      },
      on: () => {},
      removeListener: () => {},
    };`;

  test("offers a choice of wallets rather than assuming MetaMask", async ({ page }) => {
    await page.goto("/app");

    const connect = page.locator("header").getByText("Connect wallet");
    await connect.waitFor({ timeout: 30_000 });
    await connect.click();

    // RainbowKit renders a centred dialog on desktop and a bottom sheet on touch viewports, so the
    // assertion is on the content rather than on the chrome around it.
    await expect(page.getByText(/Connect a Wallet|Get a Wallet/i).first()).toBeVisible({
      timeout: 20_000,
    });

    // Several options, so a Rabby or Rainbow user is not stuck being told to install MetaMask.
    // Counted rather than named, because RainbowKit orders the list by what is actually installed.
    const offered = await page
      .getByText(/MetaMask|Rabby|Rainbow|Coinbase|Browser Wallet|Phantom|OKX|Zerion|Safe/)
      .count();
    expect(offered, "wallet chooser should offer several wallets").toBeGreaterThanOrEqual(3);
  });

  test("keeps the connection across navigation and a full reload", async ({ page, context }) => {
    await context.addInitScript(INJECTED_PROVIDER);

    const connectedLabel = page.locator("header").getByText(/0x[0-9a-fA-F]{2}/);

    await page.goto("/app");
    await expect(connectedLabel).toBeVisible({ timeout: 30_000 });

    // Client-side navigation. The desktop nav is hidden below md and the bottom nav carries the same
    // links there, so this deliberately does not scope to the header.
    await page.getByRole("link", { name: "Draws", exact: true }).first().click();
    await page.waitForURL(/\/app\/draws/, { timeout: 20_000 });
    await expect(connectedLabel).toBeVisible({ timeout: 20_000 });

    // Full reload — the case that used to look like a logout.
    await page.reload();
    await expect(connectedLabel).toBeVisible({ timeout: 30_000 });

    // A fresh document load of a different route.
    await page.goto("/app/save");
    await expect(connectedLabel).toBeVisible({ timeout: 30_000 });

    // And the state really is in a cookie, so the server can render it too.
    const cookies = await context.cookies();
    expect(cookies.some((cookie) => cookie.name.includes("wagmi"))).toBe(true);
  });

  test("never shows the connect prompt while a session is being restored", async ({
    page,
    context,
  }) => {
    await context.addInitScript(INJECTED_PROVIDER);
    await page.goto("/app");

    // Sample the header repeatedly through the restore window. "Connect wallet" must never appear
    // for a browser that does in fact have a connected wallet.
    for (let i = 0; i < 12; i++) {
      const header = (await page.textContent("header")) ?? "";
      expect(header, `showed the connect prompt ${i * 250}ms into restoring`).not.toContain(
        "Connect wallet",
      );
      await page.waitForTimeout(250);
    }
  });
});
