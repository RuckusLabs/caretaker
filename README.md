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

There's no login — anyone can type any name and phone number to sign in.
This is an accepted tradeoff for a low-stakes, internal family/care tool.

## Setup

### 1. Supabase

1. Create a free project at [supabase.com](https://supabase.com).
2. In the SQL editor, run the contents of `supabase/schema.sql`.
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
| `RECIPIENT_EMAIL` | the email address that should receive the weekly summary |
| `FROM_EMAIL` (optional) | e.g. `Caretaker App <noreply@yourdomain.com>`, if you've verified a domain in Resend |

You can trigger the workflow manually from the **Actions** tab
("Run workflow") to test it before waiting for Monday.

### 5. Enable GitHub Pages

Repo **Settings → Pages** → set source to the branch this app lives on
(root folder). The app will be served at your repo's Pages URL.

## Editing the checklist

Edit `checklists.js`. `general` items show on every shift; `morning` and
`afternoon` are shift-specific. The shift is auto-detected by time of day —
change `CARETAKER_SHIFT_CUTOFF_HOUR` (24h clock) to adjust the morning/
afternoon boundary.

## Known limitations

- No authentication — sign-in is self-reported name/phone.
- Because there's no login tying a browser to a caretaker, anyone who knows
  (or guesses) a check-in's id could edit it via the Supabase API. Acceptable
  for this use case; revisit if the app scope grows.
- The weekly email cron runs in UTC; adjust the `cron` line in
  `.github/workflows/weekly-email.yml` for your timezone.
