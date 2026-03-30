import "dotenv/config";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

/**
 * Usage example:
 * ACCOUNT_URL="http://localhost:3000/account" node customer-agents/signup-agent.js
 */

const accountUrl = process.env.ACCOUNT_URL ?? process.env.SIGNUP_URL ?? "http://localhost:3000/account";
const customerCount = Number(process.env.CUSTOMER_COUNT ?? 20);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, "data");
const customersPath = path.join(dataDir, "customers.json");

function randomDigits(n) {
  return Array.from({ length: n }, () => Math.floor(Math.random() * 10)).join("");
}

function generateCustomer(index) {
  const id = `cust-${String(index + 1).padStart(3, "0")}`;
  const name = `Demo Customer ${index + 1}`;
  const phoneNumber = `555${String(index + 1).padStart(3, "0")}${randomDigits(4)}`;
  const password = `DemoPass!${index + 1}A`;
  const homeAddress = `${100 + index} Market Street, Test City, TS 900${String(index).padStart(2, "0")}`;

  return {
    customerId: id,
    signUp: { name, phoneNumber, homeAddress, password },
    signIn: { phoneNumber, password }
  };
}

async function loadOrCreateCustomers(count) {
  await fs.mkdir(dataDir, { recursive: true });

  try {
    const existing = JSON.parse(await fs.readFile(customersPath, "utf8"));
    if (Array.isArray(existing) && existing.length >= count) {
      return existing.slice(0, count);
    }
  } catch {
    // regenerate below
  }

  const customers = Array.from({ length: count }, (_, i) => generateCustomer(i));
  await fs.writeFile(customersPath, JSON.stringify(customers, null, 2));
  return customers;
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

async function activateSignUpPanel(page) {
  const selected = await clickFirstAvailable(page, [
    "button:has-text('Sign Up')",
    "button:has-text('Signup')",
    "a:has-text('Sign Up')",
    "a:has-text('Signup')",
    "[role='tab']:has-text('Sign Up')"
  ]);

  await page.waitForTimeout(300);
  return selected ?? "signup toggle not found (continued)";
}

async function findSignUpForm(page) {
  const candidates = [
    "form:has(button:has-text('Create account'))",
    "form:has(button:has-text('Create Account'))",
    "form:has(button:has-text('Sign Up'))",
    "form:has(input[name='homeAddress'])",
    "form:has(textarea[name='homeAddress'])"
  ];

  for (const selector of candidates) {
    const form = page.locator(selector).first();
    if ((await form.count()) > 0 && (await form.isVisible().catch(() => false))) {
      return { form, selector };
    }
  }

  // fallback to the visible form containing a password field
  const fallback = page.locator("form:has(input[type='password'])").first();
  if ((await fallback.count()) > 0 && (await fallback.isVisible().catch(() => false))) {
    return { form: fallback, selector: "form:has(input[type='password'])" };
  }

  throw new Error("Could not find a visible signup form panel");
}

async function signUpCustomer(page, profile) {
  await page.goto(accountUrl, { waitUntil: "domcontentloaded" });
  const panelToggle = await activateSignUpPanel(page);
  const { form, selector: formSelector } = await findSignUpForm(page);

  const used = {};
  used.name = await fillFirstAvailable(form, profile.name, [
    "input[name='name']",
    "input[name='fullName']",
    "#name",
    "#fullName",
    "input[placeholder*='Name']"
  ]);
  used.phoneNumber = await fillFirstAvailable(form, profile.phoneNumber, [
    "input[name='phoneNumber']",
    "input[name='phone']",
    "#phoneNumber",
    "#phone",
    "input[type='tel']",
    "input[placeholder*='Phone']"
  ]);
  used.homeAddress = await fillFirstAvailable(form, profile.homeAddress, [
    "input[name='homeAddress']",
    "input[name='address']",
    "textarea[name='homeAddress']",
    "textarea[name='address']",
    "#homeAddress",
    "#address",
    "input[placeholder*='Address']"
  ]);
  used.password = await fillFirstAvailable(form, profile.password, [
    "input[name='password']",
    "#password",
    "input[type='password']"
  ]);

  const submittedWith = await clickFirstAvailable(form, [
    "button:has-text('Create account')",
    "button:has-text('Create Account')",
    "button[type='submit']",
    "input[type='submit']",
    "button:has-text('Sign Up')",
    "button:has-text('Signup')",
    "button:has-text('Register')"
  ]);

  if (!submittedWith) {
    throw new Error("Could not find a signup submit button (Create account) in the signup panel");
  }

  await page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});

  const content = (await page.content()).toLowerCase();
  const url = page.url();
  const successHints = ["welcome", "account", "verify", "dashboard", "success"];
  const matched = successHints.filter((h) => content.includes(h));

  return {
    accountUrl,
    panelToggle,
    formSelector,
    usedSelectors: used,
    submittedWith,
    postSubmitUrl: url,
    successHints: matched
  };
}

const browser = await chromium.launch({ headless: process.env.HEADLESS !== "false" });
const context = await browser.newContext();
const page = await context.newPage();

const customers = await loadOrCreateCustomers(customerCount);
const results = [];

try {
  for (const customer of customers) {
    const output = await signUpCustomer(page, customer.signUp);
    results.push({ customerId: customer.customerId, signIn: customer.signIn, output });
    console.log(`Completed signup attempt for ${customer.customerId} (${customer.signUp.phoneNumber})`);
  }

  console.log("Run complete. Results:");
  console.log(JSON.stringify(results, null, 2));
  console.log(`Saved profiles to ${customersPath}`);
} finally {
  await browser.close();
}
