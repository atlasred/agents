# Customer Agents

This folder contains customer-facing automations for your demo e-commerce environment:

- `signup-agent.js`: creates customer accounts and saves profile credentials to `data/customers.json`
- `signin-agent.js`: signs into existing customer accounts using saved credentials

Run from repo root:

```bash
node customer-agents/signup-agent.js
node customer-agents/signin-agent.js
```
