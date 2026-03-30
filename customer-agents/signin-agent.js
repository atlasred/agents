import "dotenv/config";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

/**
 * Usage example:
 * ACCOUNT_URL="http://localhost:3000/account" node customer-agents/signin-agent.js
 */

const accountUrl = process.env.ACCOUNT_URL ?? "http://localhost:3000/account";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const customersPath = path.join(__dirname, "data", "customers.json");
const maxCustomers = Number(process.env.CUSTOMER_COUNT ?? 20);

async function clickFirstAvailable(page, selectors) {
  for (const selector of selectors) {
    const locator = page.locator(selector).first();
    if ((await locator.count()) > 0 && (await locator.isVisible().catch(() => false))) {
      await locator.click();
      return selector;
    }
  }
  return null;
}

async function fillFirstAvailable(page, value, selectors) {
  for (const selector of selectors) {
    const locator = page.locator(selector).first();
    if ((await locator.count()) > 0 && (await locator.isVisible().catch(() => false))) {
      await locator.fill(value);
      return selector;
    }
  }
  return null;
}

async function ensureSignInMode(page) {
  const selected = await clickFirstAvailable(page, [
    "button:has-text('Sign In')",
    "button:has-text('Signin')",
    "a:has-text('Sign In')",
    "a:has-text('Signin')",
    "[role='tab']:has-text('Sign In')"
  ]);

  await page.waitForTimeout(300);
  return selected ?? "signin toggle not found (continued with visible form)";
}

async function loadCustomers() {
  const raw = await fs.readFile(customersPath, "utf8");
  const customers = JSON.parse(raw);

  if (!Array.isArray(customers) || customers.length === 0) {
    throw new Error(`No customers found in ${customersPath}. Run signup-agent first.`);
  }

  return customers.slice(0, maxCustomers);
}

async function signInCustomer(page, customer) {
  await page.goto(accountUrl, { waitUntil: "domcontentloaded" });
  const signInModeToggle = await ensureSignInMode(page);

  const used = {};
  used.phoneNumber = await fillFirstAvailable(page, customer.signIn.phoneNumber, [
    "input[name='phoneNumber']",
    "input[name='phone']",
    "#phoneNumber",
    "#phone",
    "input[type='tel']",
    "input[placeholder*='Phone']"
  ]);
  used.password = await fillFirstAvailable(page, customer.signIn.password, [
    "input[name='password']",
    "#password",
    "input[type='password']"
  ]);

  const submittedWith = await clickFirstAvailable(page, [
    "button[type='submit']",
    "input[type='submit']",
    "button:has-text('Sign In')",
    "button:has-text('Signin')",
    "button:has-text('Login')",
    "button:has-text('Log In')"
  ]);

  if (!submittedWith) {
    throw new Error("Could not find a sign-in submit button on /account page");
  }

  await page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});

  const content = (await page.content()).toLowerCase();
  const url = page.url();
  const successHints = ["welcome", "account", "dashboard", "logout", "my orders"];
  const matched = successHints.filter((h) => content.includes(h));

  return {
    accountUrl,
    signInModeToggle,
    usedSelectors: used,
    submittedWith,
    postSubmitUrl: url,
    successHints: matched
  };
}

const browser = await chromium.launch({ headless: process.env.HEADLESS !== "false" });
const context = await browser.newContext();
const page = await context.newPage();

const customers = await loadCustomers();
const results = [];

try {
  for (const customer of customers) {
    const output = await signInCustomer(page, customer);
    results.push({ customerId: customer.customerId, signIn: customer.signIn, output });
    console.log(`Completed sign-in attempt for ${customer.customerId} (${customer.signIn.phoneNumber})`);
  }

  console.log("Sign-in run complete. Results:");
  console.log(JSON.stringify(results, null, 2));
} finally {
  await browser.close();
}
