# MachineQuote

MachineQuote is a lightweight web app for generating budgetary machining estimates from common intake details. It now includes a small Node backend so quote generation happens through an API instead of only in the browser.

- STEP file upload
- quantity
- material
- finish
- tolerance band
- lead time
- setup hours
- cycle time

It is designed as a fast front-end intake tool for CNC quoting workflows.

## Features

- Small Node backend with `POST /api/quote`
- Single-page interface with no frontend build step
- Machining-focused pricing breakdown
- Intake summary for internal review or customer follow-up
- Responsive layout for desktop and mobile
- Risk badge to flag quotes that need manual review

## Run locally

Install is not required. Start the backend server:

```powershell
npm start
```

Then open `http://localhost:3000`.

## API

Generate a quote with:

```http
POST /api/quote
Content-Type: application/json
```

Example body:

```json
{
  "projectName": "Turbo Intake Flange Rev B",
  "fileName": "intake-flange.step",
  "material": "aluminum_6061",
  "quantity": 10,
  "finish": "anodized_black",
  "tolerance": "precision",
  "leadTime": "expedite",
  "complexity": "medium",
  "setupHours": 1.5,
  "cycleMinutes": 18,
  "notes": "Inspect sealing face before release."
}
```

## Pricing model

This app uses a simple estimation model in the backend:

- material base rate by material type
- setup cost from estimated setup hours
- machining cost from cycle minutes and quantity
- multipliers for complexity, tolerance, finish, and lead time

This is meant for rough estimating, not final production quoting. Final pricing should still include a geometry review, tooling review, stock confirmation, and scheduling check.

## Suggested next steps

- Add PDF quote export
- Save quote history
- Connect to a backend for customer records
- Parse geometry metadata from STEP files
