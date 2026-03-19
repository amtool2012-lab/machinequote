# Machine Shop RFQ Desk

Machine Shop RFQ Desk is a lightweight web app for organizing RFQs from Gmail. It pulls customer emails with attachments, extracts readable text from messages and supported files, sorts requests by priority, and builds a structured internal review for estimating.

When an `OPENROUTER_API_KEY` is present, the app will try OpenRouter's free routing model first and then fall back to local review rules if the free endpoint is unavailable.

This is built for jobs where customers send:

- STEP or STP files
- technical drawing PDFs
- quantities
- material or finish notes
- requested lead times

## What it does

- Google Gmail OAuth connection
- Sync recent inbox messages with attachments
- Extract message text and selected attachment text
- Sort RFQs by priority using keywords, attachments, known customer domains, and recency
- Build a review summary with OpenRouter free when available, or local rules as fallback

## Required environment variables

```powershell
$env:GOOGLE_CLIENT_ID="your-google-client-id"
$env:GOOGLE_CLIENT_SECRET="your-google-client-secret"
$env:GOOGLE_REDIRECT_URI="http://localhost:3000/oauth2callback"
$env:OPENROUTER_API_KEY="your-openrouter-key"
```

Notes:

- `GOOGLE_REDIRECT_URI` is optional. If omitted, the app uses `http://localhost:3000/oauth2callback`.
- `OPENROUTER_API_KEY` is optional. If omitted, the app uses local review rules only.

## Google Cloud setup

1. Create a Google Cloud project.
2. Enable the Gmail API.
3. Create OAuth client credentials for a web application.
4. Add your redirect URI, for example `http://localhost:3000/oauth2callback`.
5. Copy the client ID and client secret into your environment variables.
6. If the app is in testing mode, add your Gmail account under OAuth test users.

## Run locally

```powershell
npm install
npm start
```

Then open [http://localhost:3000](http://localhost:3000).

## Main API routes

- `GET /api/config` returns Gmail connection and sync status
- `GET /api/gmail/auth-url` creates the Google OAuth URL
- `GET /oauth2callback` finishes Gmail OAuth
- `POST /api/inbox/sync` pulls Gmail messages into the RFQ list
- `POST /api/rfqs/:id/analyze` builds the local review for one RFQ

## Current limitations

- Gmail tokens are stored in memory only, so reconnect after restarting the server
- STEP geometry is not deeply parsed yet; the app reads filename and any plain-text content it can extract
- PDF estimate generation is not implemented yet
- Attachment parsing is focused on RFQ triage, not final engineering review

## Good next steps

- save Gmail tokens and synced RFQs to a database
- generate branded estimate PDFs
- add customer and job status tracking
- support ERP or CRM export
- parse drawing details and dimensions more deeply
