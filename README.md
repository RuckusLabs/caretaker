# Caretaker Check-In

A small static web app for caretakers to sign in/out of shifts, work through
a shift checklist, and see a summary of hours worked. A weekly GitHub
Actions job emails a summary table of hours per caretaker every Monday
morning.

## How it works

- **Frontend**: plain HTML/CSS/JS, hosted on GitHub Pages. No build step.
- **Data storage**: [Supabase](https://supabase.com) (free tier Postgres).
  The browser talks to Supabase directly using its public "anon" key.
- **Weekly email**: a GitHub Actions workflow (`.github/workflows/weekly-email.yml`)
  runs every Monday at 08:00 UTC, queries Supabase for the past week's
  completed shifts, and sends a summary email via [Resend](https://resend.com)
  (free tier).

Caretakers pick their name from a dropdown (populated from `caretakers.json`)
and enter their phone number as a PIN to sign in. There's no real
authentication behind this — it just has to match the phone number on file —
which is an accepted tradeoff for a low-stakes, internal family/care tool.
A "Someone else (not listed)" option lets an unregistered person sign in by
typing their own name, phone number, and hourly rate.

## Setup

### 1. Supabase

1. Create a free project at [supabase.com](https://supabase.com).
2. In the SQL editor, run the contents of `supabase/schema.sql`. Note: it
   drops any existing `checkins` table first, so re-running it after schema
   changes (like this) wipes prior check-in history.
3. Under **Project Settings → API**, copy:
   - the **Project URL**
   - the **anon public** key
   - the **service_role** key (keep this one secret — server-side only)

### 2. Resend

1. Create a free account at [resend.com](https://resend.com).
2. Get an API key under **API Keys**.
3. Either verify your own sending domain, or use Resend's shared
   `onboarding@resend.dev` sender for testing (already the default below).

### 3. Configure the frontend

Edit `config.js` and fill in your Supabase project URL and anon key:

```js
window.CARETAKER_CONFIG = {
  SUPABASE_URL: "https://your-project-ref.supabase.co",
  SUPABASE_ANON_KEY: "your-anon-key",
};
```

These are safe to commit — the anon key is meant to be public and is
restricted by the row-level security policies in `supabase/schema.sql`.

### 4. Configure the weekly email (GitHub Actions secrets)

In the repo's **Settings → Secrets and variables → Actions**, add:

| Secret | Value |
|---|---|
| `SUPABASE_URL` | your Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | your Supabase service_role key (keep secret) |
| `RESEND_API_KEY` | your Resend API key |
| `RECIPIENT_EMAIL` | who receives the weekly summary — one email, or a comma-separated list (e.g. `a@x.com, b@y.com`) |
| `FROM_EMAIL` (optional) | e.g. `Caretaker App <noreply@yourdomain.com>`, if you've verified a domain in Resend |

You can trigger the workflow manually from the **Actions** tab
("Run workflow") to test it before waiting for Monday.

### 5. Enable GitHub Pages

Repo **Settings → Pages** → set source to the branch this app lives on
(root folder). The app will be served at your repo's Pages URL.

## Editing the caretaker roster

Edit `caretakers.json` — one entry per caretaker, with their name, phone
number (digits only), and hourly rate:

```json
[{ "name": "Jane Doe", "phone": "5555550100", "rate": 20 }]
```

The frontend fetches this file to populate the name dropdown, check the
phone/PIN, and attach each caretaker's rate to their check-in. The weekly
email script doesn't read this file itself — it uses whatever rate was
stored on each check-in row, so changing a rate here only affects future
shifts.

## Editing the checklist

Edit `checklists.js`. `general` items show on every shift; `morning` and
`afternoon` are shift-specific. The shift is auto-detected by time of day —
change `CARETAKER_SHIFT_CUTOFF_HOUR` (24h clock) to adjust the morning/
afternoon boundary.

## Known limitations

- The phone-number PIN is not real authentication — sign-in just checks it
  matches the selected caretaker's phone on file. Acceptable for this use
  case; revisit if the app scope grows.
- Because there's no login tying a browser to a caretaker, anyone who knows
  (or guesses) a check-in's id could edit it via the Supabase API.
- The weekly email cron runs in UTC; adjust the `cron` line in
  `.github/workflows/weekly-email.yml` for your timezone.
- The rate on each check-in is captured at sign-in time (from
  `caretakers.json`, or typed in for an unlisted entry), so past pay totals
  don't change retroactively if you edit `caretakers.json` later.
