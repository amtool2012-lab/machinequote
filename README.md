# MachineQuote

MachineQuote is a lightweight web app for generating budgetary machining estimates from common intake details:

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

- Single-page interface with no build step
- Machining-focused pricing breakdown
- Intake summary for internal review or customer follow-up
- Responsive layout for desktop and mobile
- Risk badge to flag quotes that need manual review

## Run locally

Open [index.html](C:\Users\1950101\Documents\New project\index.html) in a browser.

If you want to serve it locally instead of opening the file directly, you can use:

```powershell
python -m http.server 8000
```

Then open `http://localhost:8000`.

## Pricing model

This app uses a simple client-side estimation model:

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
