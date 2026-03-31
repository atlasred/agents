import "dotenv/config";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const customerCount = Number(process.env.CUSTOMER_COUNT ?? 20);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, "data");
const customersPath = path.join(dataDir, "customers.json");
const outputDir = path.join(dataDir, "spectrum-csv");
const expectedResultsPath = path.join(outputDir, "expected-results.csv");

const firstNames = ["Olivia", "Noah", "Emma", "Liam", "Ava", "Elijah", "Sophia", "Mateo", "Mia", "Lucas", "Amelia", "Ethan", "Harper", "James", "Evelyn", "Benjamin", "Charlotte", "Henry", "Isabella", "Jack"];
const lastNames = ["Johnson", "Williams", "Brown", "Davis", "Miller", "Wilson", "Moore", "Taylor", "Anderson", "Thomas", "Martinez", "Garcia", "Clark", "Lewis", "Walker", "Hall", "Allen", "Young", "King", "Wright"];

function randomDigits(n) {
  return Array.from({ length: n }, () => Math.floor(Math.random() * 10)).join("");
}

function generateFallbackCustomers(count) {
  return Array.from({ length: count }, (_, i) => ({
    customerId: `cust-${String(i + 1).padStart(3, "0")}`,
    signUp: {
      name: `${firstNames[i % firstNames.length]} ${lastNames[i % lastNames.length]}`,
      phoneNumber: `555${String(i + 1).padStart(3, "0")}${randomDigits(4)}`,
      homeAddress: `${100 + i} Main St, Springfield, IL 6270${i % 10}`,
      password: `Shopper!${i + 1}A`
    },
    signIn: {}
  }));
}

const behaviors = [
  { type: "window_shopper", sessions: [1, 2], views: [2, 7], addToCart: [0, 1], checkoutStarts: [0, 1], completedPurchases: [0, 0], avgLoggedIn: [1.2, 3.5] },
  { type: "bargain_hunter", sessions: [2, 5], views: [6, 18], addToCart: [1, 4], checkoutStarts: [1, 3], completedPurchases: [0, 1], avgLoggedIn: [3.0, 8.0] },
  { type: "standard_buyer", sessions: [2, 4], views: [5, 14], addToCart: [2, 5], checkoutStarts: [1, 4], completedPurchases: [1, 2], avgLoggedIn: [4.0, 9.0] },
  { type: "impulse_buyer", sessions: [1, 3], views: [2, 8], addToCart: [2, 6], checkoutStarts: [2, 5], completedPurchases: [2, 4], avgLoggedIn: [2.0, 6.0] }
];

function rng(seed) {
  let x = seed % 2147483647;
  if (x <= 0) x += 2147483646;
  return () => (x = (x * 16807) % 2147483647) / 2147483647;
}

function pickInt(rand, [min, max]) {
  return Math.floor(rand() * (max - min + 1)) + min;
}

function pickFloat(rand, [min, max], d = 2) {
  return Number((rand() * (max - min) + min).toFixed(d));
}

function rate(n, d) {
  if (!d) return 0;
  return Number(((n / d) * 100).toFixed(2));
}

function toCsv(rows) {
  if (!rows.length) return "";
  const headers = Object.keys(rows[0]);
  const out = [headers.join(",")];
  for (const row of rows) {
    out.push(headers.map((h) => JSON.stringify(row[h] ?? "")).join(","));
  }
  return out.join("\n") + "\n";
}

async function loadCustomers() {
  try {
    const raw = await fs.readFile(customersPath, "utf8");
    const customers = JSON.parse(raw);
    if (Array.isArray(customers) && customers.length) {
      return customers.slice(0, customerCount);
    }
  } catch {
    // fallback below
  }

  const fallback = generateFallbackCustomers(customerCount);
  await fs.mkdir(dataDir, { recursive: true });
  await fs.writeFile(customersPath, JSON.stringify(fallback, null, 2));
  return fallback;
}

function buildMetrics(customer, index) {
  const behavior = behaviors[index % behaviors.length];
  const rand = rng(index + 101);

  const sessions = pickInt(rand, behavior.sessions);
  const productViews = pickInt(rand, behavior.views);
  const addToCart = pickInt(rand, behavior.addToCart);
  const checkoutStarts = Math.min(addToCart, pickInt(rand, behavior.checkoutStarts));
  const completedPurchases = Math.min(checkoutStarts, pickInt(rand, behavior.completedPurchases));
  const cartAbandonments = Math.max(addToCart - completedPurchases, 0);
  const repeatPurchaseRate = completedPurchases >= 2 ? 100 : 0;
  const avgSessionMin = pickFloat(rand, [2.5, 11.5]);
  const avgLoggedInMin = Math.min(avgSessionMin, pickFloat(rand, behavior.avgLoggedIn));
  const loginEvents = sessions;
  const logoutEvents = Math.max(1, sessions - (rand() > 0.2 ? 0 : 1));
  const cartToCheckoutRate = rate(checkoutStarts, addToCart);
  const checkoutToPurchaseRate = rate(completedPurchases, checkoutStarts);

  return {
    customerId: customer.customerId,
    customerName: customer.signUp.name,
    behaviorType: behavior.type,
    sessions,
    uniqueVisitorsCustomers: 1,
    productViews,
    addToCart,
    cartAbandonments,
    checkoutStarts,
    completedPurchases,
    repeatPurchaseRate,
    avgSessionMin,
    avgLoggedInMin,
    loginEvents,
    logoutEvents,
    cartToCheckoutRate,
    checkoutToPurchaseRate
  };
}

async function main() {
  const customers = await loadCustomers();
  await fs.mkdir(outputDir, { recursive: true });

  const expectedRows = [];

  for (let i = 0; i < customers.length; i++) {
    const customer = customers[i];
    const m = buildMetrics(customer, i);
    expectedRows.push(m);

    const fileRows = [
      { metric: "Sessions", value: m.sessions },
      { metric: "Unique Visitors/Customers", value: m.uniqueVisitorsCustomers },
      { metric: "Product Views", value: m.productViews },
      { metric: "Add to Cart", value: m.addToCart },
      { metric: "Cart Abandonments", value: m.cartAbandonments },
      { metric: "Checkout Starts", value: m.checkoutStarts },
      { metric: "Completed Purchases", value: m.completedPurchases },
      { metric: "Repeat Purchase Rate", value: `${m.repeatPurchaseRate}%` },
      { metric: "Avg Session (min)", value: m.avgSessionMin },
      { metric: "Avg Logged-in (min)", value: m.avgLoggedInMin },
      { metric: "Login Events", value: m.loginEvents },
      { metric: "Logout Events", value: m.logoutEvents },
      { metric: "Cart → Checkout Rate", value: `${m.cartToCheckoutRate}%` },
      { metric: "Checkout → Purchase Rate", value: `${m.checkoutToPurchaseRate}%` }
    ];

    const perCustomerPath = path.join(outputDir, `${m.customerId}-${m.behaviorType}.csv`);
    await fs.writeFile(perCustomerPath, toCsv(fileRows));
  }

  await fs.writeFile(expectedResultsPath, toCsv(expectedRows));

  const totals = expectedRows.reduce(
    (acc, r) => {
      acc.sessions += r.sessions;
      acc.productViews += r.productViews;
      acc.addToCart += r.addToCart;
      acc.checkoutStarts += r.checkoutStarts;
      acc.completedPurchases += r.completedPurchases;
      return acc;
    },
    { sessions: 0, productViews: 0, addToCart: 0, checkoutStarts: 0, completedPurchases: 0 }
  );

  console.log(`Generated ${expectedRows.length} per-customer CSV files in ${outputDir}`);
  console.log(`Expected results summary: ${JSON.stringify(totals)}`);
  console.log(`Expected per-customer table: ${expectedResultsPath}`);
}

await main();
