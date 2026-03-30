# LangChain.js Signup Agent (Demo E-commerce)

This project provides a **LangChain.js + Playwright** agent that can create an account on a demo e-commerce signup page.

## What it does

1. Opens your signup URL.
2. Generates and persists 20 customer profiles by default (configurable).
3. Fills signup fields: name, phone number, home address, password.
4. Submits the form.
5. Checks for basic success hints.

## Requirements

- Node.js 20+
- An OpenAI API key

## Setup

```bash
npm install
npx playwright install chromium
```

## Run

```bash
export OPENAI_API_KEY="your_key"
export SIGNUP_URL="https://your-demo-site.test/register"
export CUSTOMER_COUNT="20"
node customer-agents/signup-agent.js
```

Optional:

```bash
export OPENAI_MODEL="gpt-4o-mini"
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
- Selector matching is generic; adjust selectors in `customer-agents/signup-agent.js` for your exact form.
