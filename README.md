# Caretaker Check-In

A small static web app for caretakers to sign in/out of shifts, work through
a shift checklist, and see a summary of hours worked. A weekly GitHub
Actions job emails a summary table of hours per caretaker every Monday
morning. A separate admin page lets you manage the caretaker roster and
review hours/pay for any date range.

## How it works

- **Frontend**: plain HTML/CSS/JS, hosted on GitHub Pages. No build step.
  `index.html` is the caretaker check-in app; `admin.html` is the admin
  dashboard.
- **Data storage**: [Supabase](https://supabase.com) (free tier Postgres).
  The browser talks to Supabase directly using its public "anon" key.
- **Weekly email**: a GitHub Actions workflow (`.github/workflows/weekly-email.yml`)
  runs every Monday at 7:15am MST, queries Supabase for the past week's
  completed shifts, and sends a summary email via [Resend](https://resend.com)
  (free tier).

Caretakers pick their name from a dropdown (populated from a `caretakers`
table in Supabase) and enter their phone number as a PIN to sign in. There's
no real authentication behind this — it just has to match the phone number
on file — which is an accepted tradeoff for a low-stakes, internal
family/care tool. A "Someone else (not listed)" option lets an unregistered
person sign in by typing their own name, phone number, and hourly rate.

The admin page (`admin.html`), by contrast, sits behind a real login
(Supabase Auth email/password) since it can edit rates and see full history —
see [Admin page](#admin-page) below.

## Setup

### 1. Supabase

1. Create a free project at [supabase.com](https://supabase.com).
2. In the SQL editor, run the contents of `supabase/schema.sql`. It's safe
   to re-run any time (e.g. after pulling schema updates) — it uses
   `if not exists` everywhere and won't touch existing check-in history or
   caretaker edits.
3. Under **Project Settings → API**, copy:
   - the **Project URL**
   - the **anon public** key
   - the **service_role** key (keep this one secret — server-side only)
4. Under **Authentication → Providers**, confirm **Email** is enabled
   (it is by default).
5. Under **Authentication → Users**, click **Add user** and create yourself
   an admin account (your email + a password). Check **Auto Confirm User**
   so it doesn't require an email confirmation step. This is the login for
   `admin.html` — anyone with these credentials can manage caretakers and
   view all check-in history, so keep the password private.

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
("Run workflow") to test it before waiting for Monday — see
[Testing the weekly email](#testing-the-weekly-email) below for a way to do
this without touching real check-in data or the real recipient list.

### 5. Enable GitHub Pages

Repo **Settings → Pages** → set source to the branch this app lives on
(root folder). The app will be served at your repo's Pages URL, e.g.
`https://you.github.io/caretaker/` for the check-in app and
`https://you.github.io/caretaker/admin.html` for the admin page.

## Admin page

Open `admin.html` (e.g. `https://you.github.io/caretaker/admin.html`) and
sign in with the admin account you created in Supabase (see setup step 5
above). No public link to it exists anywhere in the check-in app — bookmark
the URL yourself.

It has two tabs:

- **Weekly Allocation** — pick any date range (defaults to the current week;
  "This Week"/"Last Week" buttons for quick switching) and see hours, rate,
  and amount owed per caretaker for that range, plus a collapsible list of
  every individual check-in — the same "go back in time" view the weekly
  email sends, but for any period you choose, on demand.
- **Caretakers** — add, edit, or remove caretakers directly (name, phone,
  hourly rate), no code or SQL required. Changes take effect immediately in
  the check-in app's dropdown.

Everyone who can sign in by name (rather than using "Someone else") lives in
a `caretakers` table in Supabase, managed entirely from this page now. The
dropdown shows names as "First L." (e.g. "Jane D.") when a last name is
given, but the full name is still what's stored and shown in the weekly
email, so it stays unambiguous for payment purposes. Changing a caretaker's
rate only affects future shifts — each check-in stores the rate that was in
effect at sign-in time, so past pay totals don't change retroactively.

If you ever need to edit the roster directly in SQL instead (bulk import,
troubleshooting), it's the `caretakers` table — see its `create table` in
`supabase/schema.sql` for the shape (`name`, `phone`, `rate`). There's no
seed data in that file on purpose, since this repo is public — add your
actual roster from the admin page after running the schema, not by
committing names/numbers into `schema.sql`.

## Testing the weekly email

To preview or test the email — after a styling change, or just to check it
still works — without waiting for Monday, touching real check-in data, or
emailing your real recipient list:

1. Go to the repo's **Actions** tab → **Weekly caretaker summary email** →
   **Run workflow**.
2. Check the **"Send a test email using sample data"** box. This skips
   Supabase entirely and renders the email with a few fabricated sample
   caretakers/shifts, so it works even if there's no real data for the
   current week.
3. Optionally fill in **"test_recipient"** with your own email address to
   send it there instead of the real `RECIPIENT_EMAIL` list — handy if that
   list includes other people.
4. Click **Run workflow**. The email arrives with `[TEST]` prepended to the
   subject line so it's never confused with a real weekly summary.

Leaving both inputs at their defaults (unchecked, blank) and running the
workflow sends the real thing early, using live Supabase data and the real
recipient list — useful once you want to confirm an actual send works, but
not what you want for routine style testing.

## Editing the checklist

Edit `checklists.js`. `general` items show on every shift; `morning` and
`afternoon` are shift-specific. The shift is auto-detected by time of day
against `CARETAKER_SHIFT_WINDOWS` (24h clock) — by default morning is
7am–1pm and afternoon is 4pm–8pm. Signing in outside both windows (running
early or late) falls back to whichever shift is closer in time.

## End-of-shift fields

Below the checklist, every shift also asks for:

- **Bowel movement** — checkbox.
- **Ate** — Some / Most / All (or left as "Not specified").
- **Notes** — free text for anything notable during the shift.

None of these are required to sign out. They're stored on the check-in row
in Supabase (`bowel_movement`, `ate`, `notes`) and shown on the caretaker's
own summary screen after signing out, in the weekly email's "All check-ins"
detail table, and in the admin page's "All check-ins in range" detail table
for any date range you review.

### Instant email when notes are submitted

By default, notes only reach you in the weekly email or when you check the
admin page. If you'd rather get an email the moment a caretaker submits
notes at sign-out (instead of waiting), set up `supabase/notify-shift-notes.sql`:

1. Open that file and fill in your real Resend API key and recipient email
   in place of `YOUR_RESEND_API_KEY` and `YOUR_RECIPIENT_EMAIL`.
2. Paste the filled-in version into the Supabase SQL editor and run it.
   **Don't commit the filled-in version** — this file embeds a real secret
   directly in SQL (unlike `schema.sql`, which never contains secrets),
   which is why it's kept out of the normal setup flow.
3. That's it — no code deploy, no Edge Function. It works via a Postgres
   trigger that calls Resend directly (using the `pg_net` extension, the
   same mechanism behind Supabase's own Database Webhooks) whenever a
   check-in's `notes` field goes from empty to non-empty on a completed
   shift. It fires exactly once per shift with notes — not on every
   checklist-toggle update during the shift, and not if notes are left
   blank.

If you ever need to change the embedded key/recipient later, just re-run
the file with updated values — `create or replace function` and the
`drop trigger if exists` make it safe to re-run.

## Known limitations

- The phone-number PIN is not real authentication — sign-in just checks it
  matches the selected caretaker's phone on file. Acceptable for this use
  case; revisit if the app scope grows. The admin page is different: it
  requires a real Supabase Auth login.
- Because there's no login tying a browser to a caretaker, anyone who knows
  (or guesses) a check-in's id could edit it via the Supabase API. The
  `caretakers` table doesn't have this problem — only an authenticated
  admin can write to it.
- The weekly email cron runs in UTC; adjust the `cron` line in
  `.github/workflows/weekly-email.yml` for your timezone (currently set for
  7:15am MST, which has no DST to worry about).
- The rate on each check-in is captured at sign-in time (from the
  `caretakers` table, or typed in for an unlisted entry), so past pay
  totals don't change retroactively if you edit a caretaker's rate later.
- `admin.html` isn't linked from anywhere in the check-in app, but it's not
  hidden either — anyone who finds/guesses the URL hits a real login wall,
  so this is fine for an internal tool, just don't treat the URL itself as
  a secret.
