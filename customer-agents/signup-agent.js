import "dotenv/config";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { tool } from "langchain";
import { ChatOllama } from "@langchain/ollama";
import { createToolCallingAgent, AgentExecutor } from "langchain/agents";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { z } from "zod";

/**
 * Usage example:
 * SIGNUP_URL="https://your-demo-shop.test/register" node customer-agents/signup-agent.js
 */

const signupUrl = process.env.SIGNUP_URL;
if (!signupUrl) {
  throw new Error("Missing SIGNUP_URL. Example: SIGNUP_URL=https://demo-shop.test/register");
}

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
    signUp: {
      name,
      phoneNumber,
      homeAddress,
      password
    },
    signIn: {
      phoneNumber,
      password
    }
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
    // no existing file or invalid format; regenerate below
  }

  const customers = Array.from({ length: count }, (_, index) => generateCustomer(index));
  await fs.writeFile(customersPath, JSON.stringify(customers, null, 2));
  return customers;
}

const browser = await chromium.launch({ headless: process.env.HEADLESS !== "false" });
const context = await browser.newContext();
const page = await context.newPage();

const openSignupPage = tool(
  async () => {
    await page.goto(signupUrl, { waitUntil: "domcontentloaded" });
    return `Opened signup page: ${signupUrl}`;
  },
  {
    name: "open_signup_page",
    description: "Open the e-commerce signup page in the browser",
    schema: z.object({})
  }
);

const fillSignupForm = tool(
  async ({ name, phoneNumber, homeAddress, password }) => {
    const selectors = {
      name: ["input[name='name']", "#name", "input[name='fullName']", "#fullName"],
      phoneNumber: ["input[name='phone']", "input[type='tel']", "#phone", "#phoneNumber"],
      homeAddress: ["input[name='address']", "#address", "textarea[name='address']", "#homeAddress"],
      password: ["input[type='password']", "input[name='password']", "#password"]
    };

    async function fillFirstAvailable(value, options) {
      for (const selector of options) {
        const locator = page.locator(selector).first();
        if ((await locator.count()) > 0) {
          await locator.fill(value);
          return selector;
        }
      }
      return null;
    }

    const used = {};
    used.name = await fillFirstAvailable(name, selectors.name);
    used.phoneNumber = await fillFirstAvailable(phoneNumber, selectors.phoneNumber);
    used.homeAddress = await fillFirstAvailable(homeAddress, selectors.homeAddress);
    used.password = await fillFirstAvailable(password, selectors.password);

    return `Form filled with selectors: ${JSON.stringify(used)}`;
  },
  {
    name: "fill_signup_form",
    description: "Fill signup fields: name, phone number, home address, and password",
    schema: z.object({
      name: z.string(),
      phoneNumber: z.string(),
      homeAddress: z.string(),
      password: z.string().min(8)
    })
  }
);

const submitForm = tool(
  async () => {
    const submitSelectors = [
      "button[type='submit']",
      "input[type='submit']",
      "button:has-text('Create account')",
      "button:has-text('Sign up')",
      "button:has-text('Register')"
    ];

    for (const selector of submitSelectors) {
      const locator = page.locator(selector).first();
      if ((await locator.count()) > 0) {
        await locator.click();
        await page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
        return `Clicked submit with selector: ${selector}`;
      }
    }

    throw new Error("Could not find a submit button");
  },
  {
    name: "submit_form",
    description: "Submit the signup form",
    schema: z.object({})
  }
);

const verifySuccess = tool(
  async () => {
    const content = await page.content();
    const url = page.url();

    const successHints = ["welcome", "account", "verify", "dashboard", "success"];
    const lowered = content.toLowerCase();
    const matched = successHints.filter((h) => lowered.includes(h));

    return `Post-submit URL: ${url}. Success hints found: ${matched.join(", ") || "none"}.`;
  },
  {
    name: "verify_signup_success",
    description: "Check whether signup appears successful",
    schema: z.object({})
  }
);

const tools = [openSignupPage, fillSignupForm, submitForm, verifySuccess];
const model = new ChatOllama({
  model: process.env.OLLAMA_MODEL ?? "qwen2.5:7b",
  baseUrl: process.env.OLLAMA_BASE_URL ?? "http://127.0.0.1:11434",
  temperature: 0
});

const prompt = ChatPromptTemplate.fromMessages([
  [
    "system",
    "You are a browser automation agent for a demo e-commerce site. " +
      "Only perform signup actions. Never attempt login bypasses or security testing. " +
      "Use tools in order: open page, fill form, submit, verify."
  ],
  ["human", "Create one account with this profile: {profile}"],
  ["placeholder", "{agent_scratchpad}"]
]);

const agent = await createToolCallingAgent({ llm: model, tools, prompt });
const executor = new AgentExecutor({ agent, tools, verbose: true });

const customers = await loadOrCreateCustomers(customerCount);
const results = [];

try {
  for (const customer of customers) {
    const result = await executor.invoke({
      profile: JSON.stringify(customer.signUp)
    });

    results.push({
      customerId: customer.customerId,
      signIn: customer.signIn,
      output: result.output
    });

    console.log(`Completed signup attempt for ${customer.customerId} (${customer.signUp.phoneNumber})`);
  }

  console.log("Run complete. Results:");
  console.log(JSON.stringify(results, null, 2));
  console.log(`Saved profiles to ${customersPath}`);
} finally {
  await browser.close();
}
