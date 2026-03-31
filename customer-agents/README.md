# Customer Agents

This folder contains customer-facing automations for your demo e-commerce environment:

- `first-test-agent.js`: one-shot test flow (sign up -> category -> view item -> add to cart, no payment) using first record in `data/customers.json`
- `signup-agent.js`: creates customer accounts with realistic name/address examples and saves profile credentials to `data/customers.json`
- `signin-agent.js`: signs into existing customer accounts using saved credentials
- `behavior-agent.js`: runs behavior spectrum flows (sign in → category browse → add to cart → payment) and writes `data/behavior-report.json`
- `generate-spectrum-csv.js`: generates 20 per-customer CSV metric files + `data/spectrum-csv/expected-results.csv`

Run from repo root:

```bash
node customer-agents/first-test-agent.js
node customer-agents/signup-agent.js
node customer-agents/signin-agent.js
node customer-agents/behavior-agent.js
node customer-agents/generate-spectrum-csv.js
```

Payment test card used in behavior runs: `4242 4242 4242 4242` (override with `TEST_CARD_NUMBER`).

Use `node admin-agents/analytics-agent.js` to compare storefront analytics tracking against simulated behavior output.
