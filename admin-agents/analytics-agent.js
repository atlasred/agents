import "dotenv/config";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const baseUrl = process.env.BASE_URL ?? "http://localhost:3000";
const adminUrl = process.env.ADMIN_URL ?? `${baseUrl}/admin/`;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const customerDataDir = path.join(__dirname, "..", "customer-agents", "data");
const behaviorReportPath = path.join(customerDataDir, "behavior-report.json");
const analyticsCapturePath = path.join(__dirname, "analytics-capture.json");

const labels = [
  "Sessions",
  "Unique Visitors/Customers",
  "Product Views",
  "Add to Cart",
  "Cart Abandonments",
  "Checkout Starts",
  "Completed Purchases",
  "Repeat Purchase Rate",
  "Avg Session (min)",
  "Avg Logged-in (min)",
  "Login Events",
  "Logout Events",
  "Cart → Checkout Rate",
  "Checkout → Purchase Rate"
];

function normalizeNumber(raw) {
  if (!raw) return null;
  const cleaned = raw.replace(/[^0-9.\-]/g, "");
  if (!cleaned) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function inferSpectrum(metrics) {
  const purchaseRate = metrics["Checkout → Purchase Rate"] ?? 0;
  const cartRate = metrics["Cart → Checkout Rate"] ?? 0;
  const views = metrics["Product Views"] ?? 0;

  if (purchaseRate > 60 && cartRate > 70) return "impulse-heavy / high-conversion spectrum";
  if (views > 100 && purchaseRate < 20) return "window-shopper / bargain-heavy spectrum";
  if (purchaseRate >= 30 && purchaseRate <= 60) return "mixed standard-buyer spectrum";
  return "early-stage or low-signal spectrum";
}

async function captureAdminMetrics(page) {
  await page.goto(adminUrl, { waitUntil: "domcontentloaded" });
  const metrics = {};

  for (const label of labels) {
    const labelNode = page.locator(`text=${label}`).first();
    if ((await labelNode.count()) === 0) {
      metrics[label] = null;
      continue;
    }

    const parentText = (await labelNode.locator("xpath=ancestor::*[1]").innerText().catch(() => "")) || "";
    const nextText = (await labelNode.locator("xpath=following::*[1]").innerText().catch(() => "")) || "";
    const combined = `${parentText} ${nextText}`;
    const num = normalizeNumber(combined);
    metrics[label] = num;
  }

  return metrics;
}

async function loadBehaviorSummary() {
  try {
    const raw = await fs.readFile(behaviorReportPath, "utf8");
    const parsed = JSON.parse(raw);
    return parsed.analyticsSummary ?? null;
  } catch {
    return null;
  }
}

const browser = await chromium.launch({ headless: process.env.HEADLESS !== "false" });
const context = await browser.newContext();
const page = await context.newPage();

try {
  const adminMetrics = await captureAdminMetrics(page);
  const simulatedSummary = await loadBehaviorSummary();

  const result = {
    generatedAt: new Date().toISOString(),
    adminUrl,
    adminMetrics,
    simulatedSummary,
    inferredSpectrumFromAdmin: inferSpectrum(adminMetrics),
    inferredSpectrumFromSimulation: simulatedSummary ? inferSpectrum({
      "Checkout → Purchase Rate": simulatedSummary.checkoutToPurchaseRate,
      "Cart → Checkout Rate": simulatedSummary.cartToCheckoutRate,
      "Product Views": simulatedSummary.productViews
    }) : null
  };

  await fs.writeFile(analyticsCapturePath, JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
  console.log(`Saved admin analytics capture to ${analyticsCapturePath}`);
} finally {
  await browser.close();
}
