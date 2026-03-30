# Signup Agent (Demo E-commerce)

This project provides a **Playwright-based** agent that can create accounts on a demo e-commerce signup page.

## What it does

1. Opens your account page (default: `http://localhost:3000/account`) and switches to Sign Up mode.
2. Generates and persists 20 customer profiles by default (configurable).
3. Fills signup fields: name, phone number, home address, password.
4. Submits the form.
5. Checks for basic success hints.
6. Reuses saved profiles for sign-in automation with a dedicated sign-in agent.

## Requirements

- Node.js 20+
- No API key required

## Setup

```bash
npm install
npx playwright install chromium

```

## Run

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

Optional:

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
