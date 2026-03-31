# Signup Agent (Demo E-commerce)

This project provides a **Playwright-based** agent that can create accounts on a demo e-commerce signup page.

## What it does

1. Opens your account page (default: `http://localhost:3000/account`) and switches to Sign Up mode.
2. Generates and persists 20 customer profiles by default (configurable).
3. Fills signup fields: name, phone number, home address, password.
4. Submits the form.
5. Clicks the `Create account` button inside the sign-up panel only.
6. Checks for basic success hints.
7. Reuses saved profiles for sign-in automation with a dedicated sign-in agent.
8. Runs behavior variations (window shopper, bargain hunter, standard buyer, impulse buyer) across category/cart/payment.
9. Captures admin analytics and infers behavior spectrum from tracked metrics.

## Requirements

- Node.js 20+
- No API key required

## Setup

```bash
npm install
npx playwright install chromium

```

## Run

### 0) First test flow (no payment)

```bash
export ACCOUNT_URL="http://localhost:3000/account"
export CATEGORY_URL="http://localhost:3000/category/all"
node customer-agents/first-test-agent.js
```

This runs: **sign up → category → view item → add to cart** and saves `customer-agents/data/first-test-report.json`.

### 1) Create accounts (Sign Up agent)

```bash
export ACCOUNT_URL="http://localhost:3000/account"
export CUSTOMER_COUNT="20"
node customer-agents/signup-agent.js
```

### 2) Sign in with saved accounts (Sign In agent)

```bash
export ACCOUNT_URL="http://localhost:3000/account"
export CUSTOMER_COUNT="20"
node customer-agents/signin-agent.js
```

### 3) Run behavior spectrum flow (sign in → category → cart → payment)

```bash
export BASE_URL="http://localhost:3000"
export ACCOUNT_URL="http://localhost:3000/account"
export CATEGORY_URL="http://localhost:3000/category/all"
export CHECKOUT_URL="http://localhost:3000/checkout"
export CUSTOMER_COUNT="20"
export TEST_CARD_NUMBER="4242 4242 4242 4242"
node customer-agents/behavior-agent.js
```

This creates a behavior report at `customer-agents/data/behavior-report.json`.


### 4) Capture admin analytics and infer behavior spectrum

```bash
export ADMIN_URL="http://localhost:3000/admin/"
node admin-agents/analytics-agent.js
```

This saves `admin-agents/analytics-capture.json`, which compares admin metrics with the simulated spectrum report.

Optional:

- default test card used by behavior agent: `4242 4242 4242 4242`

```bash
export HEADLESS="false"

# profiles are saved to customer-agents/data/customers.json
```

## Customer profile format

Each generated customer stores both requested shapes:

- `signIn`: `phoneNumber`, `password`
- `signUp`: `name`, `phoneNumber`, `homeAddress`, `password`

## Project structure

- `admin-agents/`: admin-side automation agents
- `customer-agents/`: customer-side automation agents

## Notes

- This is intended for **your own demo/test environment**.
- This script is tuned for an `/account` page with Sign In/Sign Up sections. Adjust selectors in `customer-agents/signup-agent.js` if your DOM differs.
