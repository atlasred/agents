import "dotenv/config";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const baseUrl = process.env.BASE_URL ?? "http://localhost:3000";
const accountUrl = process.env.ACCOUNT_URL ?? `${baseUrl}/account`;
const categoryUrl = process.env.CATEGORY_URL ?? `${baseUrl}/category/all`;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, "data");
const firstTestReportPath = path.join(dataDir, "first-test-report.json");
const customersPath = path.join(dataDir, "customers.json");

async function loadFirstCustomer() {
  const raw = await fs.readFile(customersPath, "utf8");
  const customers = JSON.parse(raw);

  if (!Array.isArray(customers) || customers.length === 0) {
    throw new Error(`No customers found in ${customersPath}. Run signup-agent first.`);
  }

  const first = customers[0];
  if (!first?.signUp || !first?.signIn) {
    throw new Error(`Invalid customer schema in ${customersPath}. Expected signUp/signIn.`);
  }

  return first;
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

async function runFirstTest(page) {
  const customerRecord = await loadFirstCustomer();
  const customer = customerRecord.signUp;

  await page.goto(accountUrl, { waitUntil: "domcontentloaded" });
  const panelToggle = await clickFirstAvailable(page, [
    "button:has-text('Sign Up')",
    "a:has-text('Sign Up')",
    "[role='tab']:has-text('Sign Up')"
  ]);

  const form = page.locator("form:has(button:has-text('Create account')), form:has(button:has-text('Create Account')), form").first();

  const usedSelectors = {
    name: await fillFirstAvailable(form, customer.name, ["input[name='name']", "input[name='fullName']", "#name", "#fullName"]),
    phoneNumber: await fillFirstAvailable(form, customer.phoneNumber, ["input[name='phoneNumber']", "input[name='phone']", "#phoneNumber", "#phone", "input[type='tel']"]),
    homeAddress: await fillFirstAvailable(form, customer.homeAddress, ["input[name='homeAddress']", "input[name='address']", "textarea[name='homeAddress']", "#homeAddress", "#address"]),
    password: await fillFirstAvailable(form, customer.password, ["input[name='password']", "#password", "input[type='password']"])
  };

  const createAccountSelector = await clickFirstAvailable(form, [
    "button:has-text('Create account')",
    "button:has-text('Create Account')",
    "button[type='submit']",
    "input[type='submit']"
  ]);

  await page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});

  await page.goto(categoryUrl, { waitUntil: "domcontentloaded" });

  const viewSelector = await clickFirstAvailable(page, [
    "a[href*='/product/']",
    "a:has-text('View')",
    "a:has-text('Details')"
  ]);

  if (viewSelector) {
    await page.waitForLoadState("domcontentloaded", { timeout: 10000 }).catch(() => {});
  }

  const addToCartSelector = await clickFirstAvailable(page, [
    "button:has-text('Add to cart')",
    "button:has-text('Add to Cart')",
    "button:has-text('Add')",
    "button[data-testid='add-to-cart']"
  ]);

  return {
    flow: "signup -> category -> view item -> add to cart",
    accountUrl,
    categoryUrl,
    panelToggle,
    usedSelectors,
    createAccountSelector,
    viewSelector,
    addToCartSelector,
    customerId: customerRecord.customerId,
    customer,
    finalUrl: page.url()
  };
}

const browser = await chromium.launch({ headless: process.env.HEADLESS !== "false" });
const context = await browser.newContext();
const page = await context.newPage();

try {
  const result = await runFirstTest(page);
  await fs.mkdir(dataDir, { recursive: true });
  await fs.writeFile(firstTestReportPath, JSON.stringify({ generatedAt: new Date().toISOString(), ...result }, null, 2));

  console.log(JSON.stringify(result, null, 2));
  console.log(`Saved first test report to ${firstTestReportPath}`);
} finally {
  await browser.close();
}
