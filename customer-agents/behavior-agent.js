import "dotenv/config";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const baseUrl = process.env.BASE_URL ?? "http://localhost:3000";
const accountUrl = process.env.ACCOUNT_URL ?? `${baseUrl}/account`;
const categoryUrl = process.env.CATEGORY_URL ?? `${baseUrl}/category/all`;
const checkoutUrl = process.env.CHECKOUT_URL ?? `${baseUrl}/checkout`;
const customerCount = Number(process.env.CUSTOMER_COUNT ?? 20);
const testCardNumber = process.env.TEST_CARD_NUMBER ?? "4242 4242 4242 4242";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, "data");
const customersPath = path.join(dataDir, "customers.json");
const behaviorReportPath = path.join(dataDir, "behavior-report.json");

const behaviorTemplates = [
  {
    type: "window_shopper",
    minSessions: 1,
    maxSessions: 2,
    minViewsPerSession: 1,
    maxViewsPerSession: 3,
    addToCartProbability: 0.15,
    checkoutProbability: 0.05,
    purchaseProbability: 0.03,
    logoutProbability: 0.8
  },
  {
    type: "bargain_hunter",
    minSessions: 2,
    maxSessions: 4,
    minViewsPerSession: 2,
    maxViewsPerSession: 5,
    addToCartProbability: 0.45,
    checkoutProbability: 0.35,
    purchaseProbability: 0.2,
    logoutProbability: 0.75
  },
  {
    type: "standard_buyer",
    minSessions: 2,
    maxSessions: 3,
    minViewsPerSession: 2,
    maxViewsPerSession: 4,
    addToCartProbability: 0.65,
    checkoutProbability: 0.55,
    purchaseProbability: 0.45,
    logoutProbability: 0.7
  },
  {
    type: "impulse_buyer",
    minSessions: 1,
    maxSessions: 2,
    minViewsPerSession: 1,
    maxViewsPerSession: 2,
    addToCartProbability: 0.9,
    checkoutProbability: 0.85,
    purchaseProbability: 0.8,
    logoutProbability: 0.6
  }
];

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function shouldDo(probability) {
  return Math.random() <= probability;
}

function pct(numerator, denominator) {
  if (!denominator) return 0;
  return (numerator / denominator) * 100;
}

async function clickFirstAvailable(scope, selectors) {
  for (const selector of selectors) {
    const locator = scope.locator(selector).first();
    if ((await locator.count()) > 0 && (await locator.isVisible().catch(() => false))) {
      await locator.click();
      return selector;
    }
  }
  return null;
}

async function fillFirstAvailable(scope, value, selectors) {
  for (const selector of selectors) {
    const locator = scope.locator(selector).first();
    if ((await locator.count()) > 0 && (await locator.isVisible().catch(() => false))) {
      await locator.fill(value);
      return selector;
    }
  }
  return null;
}

async function loadCustomers() {
  const raw = await fs.readFile(customersPath, "utf8");
  const customers = JSON.parse(raw);
  if (!Array.isArray(customers) || customers.length === 0) {
    throw new Error(`No customers found at ${customersPath}. Run signup-agent first.`);
  }
  return customers.slice(0, customerCount);
}

function assignBehavior(index) {
  return behaviorTemplates[index % behaviorTemplates.length];
}

async function signIn(page, customer, totals) {
  await page.goto(accountUrl, { waitUntil: "domcontentloaded" });
  await clickFirstAvailable(page, [
    "button:has-text('Sign In')",
    "a:has-text('Sign In')",
    "[role='tab']:has-text('Sign In')"
  ]);

  const form = page.locator("form:has(input[type='password'])").first();
  await fillFirstAvailable(form, customer.signIn.phoneNumber, [
    "input[name='phoneNumber']",
    "input[name='phone']",
    "#phoneNumber",
    "#phone",
    "input[type='tel']"
  ]);
  await fillFirstAvailable(form, customer.signIn.password, ["input[name='password']", "#password", "input[type='password']"]);

  const submitSelector = await clickFirstAvailable(form, [
    "button:has-text('Sign In')",
    "button:has-text('Login')",
    "button[type='submit']",
    "input[type='submit']"
  ]);

  await page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
  totals.loginEvents += 1;
  return { submitSelector, postUrl: page.url() };
}

async function signOutIfAvailable(page, totals) {
  const logoutSelector = await clickFirstAvailable(page, [
    "button:has-text('Logout')",
    "button:has-text('Log Out')",
    "a:has-text('Logout')",
    "a:has-text('Log Out')"
  ]);

  if (logoutSelector) {
    await page.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => {});
    totals.logoutEvents += 1;
  }
  return logoutSelector;
}

async function viewProductsInCategory(page, viewsWanted, totals) {
  await page.goto(categoryUrl, { waitUntil: "domcontentloaded" });
  const links = page.locator("a[href*='/product/'], a:has-text('View'), a:has-text('Details')");
  const count = await links.count();

  let actualViews = 0;
  if (count === 0) {
    return { actualViews, viewedProductLinks: 0 };
  }

  for (let i = 0; i < viewsWanted; i++) {
    const idx = randomInt(0, count - 1);
    const link = links.nth(idx);
    if ((await link.count()) > 0) {
      await link.click().catch(() => {});
      await page.waitForTimeout(randomInt(200, 700));
      actualViews += 1;
      totals.productViews += 1;
      await page.goBack().catch(() => {});
    }
  }

  return { actualViews, viewedProductLinks: count };
}

async function maybeAddToCart(page, behavior, totals) {
  if (!shouldDo(behavior.addToCartProbability)) {
    return { addedToCart: false, selector: null };
  }

  const selector = await clickFirstAvailable(page, [
    "button:has-text('Add to cart')",
    "button:has-text('Add to Cart')",
    "button:has-text('Add')",
    "button[data-testid='add-to-cart']"
  ]);

  const added = Boolean(selector);
  if (added) totals.addToCart += 1;
  return { addedToCart: added, selector };
}

async function maybeCheckoutAndPurchase(page, behavior, totals) {
  if (!shouldDo(behavior.checkoutProbability)) {
    totals.cartAbandonments += 1;
    return { checkoutStarted: false, purchased: false };
  }

  totals.checkoutStarts += 1;

  await page.goto(checkoutUrl, { waitUntil: "domcontentloaded" }).catch(async () => {
    await clickFirstAvailable(page, ["a:has-text('Checkout')", "button:has-text('Checkout')"]);
  });

  await fillFirstAvailable(page, testCardNumber, ["input[name='cardNumber']", "#cardNumber", "input[placeholder*='Card']"]);
  await fillFirstAvailable(page, "12/30", ["input[name='expiry']", "#expiry", "input[placeholder*='MM']"]);
  await fillFirstAvailable(page, "123", ["input[name='cvv']", "#cvv", "input[placeholder*='CVV']"]);

  if (!shouldDo(behavior.purchaseProbability)) {
    totals.cartAbandonments += 1;
    return { checkoutStarted: true, purchased: false, cardUsed: testCardNumber };
  }

  const paySelector = await clickFirstAvailable(page, [
    "button:has-text('Pay')",
    "button:has-text('Place Order')",
    "button:has-text('Complete Purchase')",
    "button[type='submit']"
  ]);

  await page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});

  const purchased = Boolean(paySelector);
  if (purchased) totals.completedPurchases += 1;
  else totals.cartAbandonments += 1;

  return {
    checkoutStarted: true,
    purchased,
    paySelector,
    cardUsed: testCardNumber,
    postUrl: page.url()
  };
}

const browser = await chromium.launch({ headless: process.env.HEADLESS !== "false" });
const context = await browser.newContext();
const page = await context.newPage();

const customers = await loadCustomers();
const report = [];

const totals = {
  sessions: 0,
  uniqueCustomers: customers.length,
  productViews: 0,
  addToCart: 0,
  cartAbandonments: 0,
  checkoutStarts: 0,
  completedPurchases: 0,
  loginEvents: 0,
  logoutEvents: 0,
  sessionMinutes: 0,
  loggedInMinutes: 0
};

try {
  for (let i = 0; i < customers.length; i++) {
    const customer = customers[i];
    const behavior = assignBehavior(i);
    const sessionCount = randomInt(behavior.minSessions, behavior.maxSessions);
    let purchasesByCustomer = 0;
    const sessions = [];

    for (let s = 0; s < sessionCount; s++) {
      totals.sessions += 1;
      const sessionMinutes = Number((randomInt(2, 14) + Math.random()).toFixed(2));
      const loggedInMinutes = Number((Math.max(sessionMinutes - randomInt(0, 2), 0.3)).toFixed(2));
      totals.sessionMinutes += sessionMinutes;
      totals.loggedInMinutes += loggedInMinutes;

      const signInResult = await signIn(page, customer, totals);
      const viewsWanted = randomInt(behavior.minViewsPerSession, behavior.maxViewsPerSession);
      const browsing = await viewProductsInCategory(page, viewsWanted, totals);
      const cart = await maybeAddToCart(page, behavior, totals);
      const checkout = cart.addedToCart
        ? await maybeCheckoutAndPurchase(page, behavior, totals)
        : { checkoutStarted: false, purchased: false };

      if (checkout.purchased) purchasesByCustomer += 1;

      let logoutSelector = null;
      if (shouldDo(behavior.logoutProbability)) {
        logoutSelector = await signOutIfAvailable(page, totals);
      }

      sessions.push({
        sessionIndex: s + 1,
        sessionMinutes,
        loggedInMinutes,
        signInResult,
        browsing,
        cart,
        checkout,
        logoutSelector
      });
    }

    report.push({
      customerId: customer.customerId,
      behaviorType: behavior.type,
      behavior,
      sessionCount,
      purchasesByCustomer,
      sessions
    });

    console.log(`${customer.customerId}: ${behavior.type} | sessions=${sessionCount} | purchases=${purchasesByCustomer}`);
  }

  const repeatPurchasers = report.filter((r) => r.purchasesByCustomer >= 2).length;
  const analyticsSummary = {
    ...totals,
    repeatPurchaseRate: Number(pct(repeatPurchasers, totals.uniqueCustomers).toFixed(2)),
    avgSessionMin: Number((totals.sessionMinutes / Math.max(totals.sessions, 1)).toFixed(2)),
    avgLoggedInMin: Number((totals.loggedInMinutes / Math.max(totals.sessions, 1)).toFixed(2)),
    cartToCheckoutRate: Number(pct(totals.checkoutStarts, totals.addToCart).toFixed(2)),
    checkoutToPurchaseRate: Number(pct(totals.completedPurchases, totals.checkoutStarts).toFixed(2))
  };

  await fs.mkdir(dataDir, { recursive: true });
  await fs.writeFile(
    behaviorReportPath,
    JSON.stringify({
      generatedAt: new Date().toISOString(),
      accountUrl,
      categoryUrl,
      checkoutUrl,
      testCardNumber,
      analyticsSummary,
      customers: report
    }, null, 2)
  );

  console.log("Behavior simulation complete:");
  console.log(JSON.stringify(analyticsSummary, null, 2));
  console.log(`Saved behavior report to ${behaviorReportPath}`);
} finally {
  await browser.close();
}
