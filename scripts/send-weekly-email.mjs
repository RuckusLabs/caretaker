// Queries Supabase for the past week's completed check-ins, groups hours
// and pay by caretaker, and emails a summary via Resend. Run by
// .github/workflows/weekly-email.yml every Monday morning.
//
// The rate used is whatever was stored on the check-in row at sign-in time
// (from caretakers.json for known caretakers, or typed in directly for an
// "unlisted" entry) — not a fresh lookup — so this reflects what was true
// at the time of the shift even if rates change later.

// TEST_MODE=true skips Supabase entirely and renders/sends with sample
// data, so you can preview styling changes on demand without waiting for
// real check-ins. TEST_RECIPIENT optionally overrides where it's sent, so
// a test run doesn't have to go to the real (possibly multi-person)
// RECIPIENT_EMAIL list.
const TEST_MODE = process.env.TEST_MODE === "true";

const SUPABASE_URL = TEST_MODE ? null : requireEnv("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = TEST_MODE ? null : requireEnv("SUPABASE_SERVICE_ROLE_KEY");
const RESEND_API_KEY = requireEnv("RESEND_API_KEY");
const RECIPIENT_EMAIL =
  process.env.TEST_RECIPIENT || requireEnv("RECIPIENT_EMAIL");
const FROM_EMAIL = process.env.FROM_EMAIL || "Caretaker App <onboarding@resend.dev>";

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

async function fetchLastWeeksCheckins() {
  const since = new Date();
  since.setDate(since.getDate() - 7);

  const url = new URL(`${SUPABASE_URL}/rest/v1/checkins`);
  url.searchParams.set("select", "name,phone,rate,signed_in_at,signed_out_at");
  url.searchParams.set("signed_out_at", `gte.${since.toISOString()}`);

  const res = await fetch(url, {
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    },
  });

  if (!res.ok) {
    throw new Error(`Supabase query failed: ${res.status} ${await res.text()}`);
  }

  return { rows: await res.json(), since };
}

function getSampleCheckins() {
  const since = new Date();
  since.setDate(since.getDate() - 7);

  const shift = (daysAgo, startHour, hours, name, phone, rate) => {
    const signedIn = new Date();
    signedIn.setDate(signedIn.getDate() - daysAgo);
    signedIn.setHours(startHour, 0, 0, 0);
    const signedOut = new Date(signedIn.getTime() + hours * 3600000);
    return {
      name,
      phone,
      rate,
      signed_in_at: signedIn.toISOString(),
      signed_out_at: signedOut.toISOString(),
    };
  };

  return {
    since,
    rows: [
      shift(6, 8, 4, "Martha", "REDACTED-PHONE", 25),
      shift(5, 8, 4, "Martha", "REDACTED-PHONE", 25),
      shift(6, 13, 5, "Cinthya", "REDACTED-PHONE", 25),
      shift(4, 13, 5, "Cinthya", "REDACTED-PHONE", 25),
      shift(3, 8, 6, "Sam Rivera", "(555) 010-0100", 18),
      // An unfinished shift (no signed_out_at) to make sure it's excluded.
      {
        name: "Audyna",
        phone: "REDACTED-PHONE",
        rate: 20,
        signed_in_at: new Date().toISOString(),
        signed_out_at: null,
      },
    ],
  };
}

// Rounds a single shift's raw hours to the nearest whole hour for pay
// purposes: over 30 minutes past the hour rounds up, 30 minutes or under
// rounds down.
function roundHoursForPay(rawHours) {
  const wholeHours = Math.floor(rawHours);
  const extraMinutes = (rawHours - wholeHours) * 60;
  return extraMinutes > 30 ? wholeHours + 1 : wholeHours;
}

function summarize(rows) {
  const byCaretaker = new Map();

  for (const row of rows) {
    if (!row.signed_out_at) continue;
    const rawHours =
      (new Date(row.signed_out_at).getTime() -
        new Date(row.signed_in_at).getTime()) /
      3600000;
    const hours = roundHoursForPay(rawHours);

    const key = `${row.name}|${row.phone}`;
    const existing = byCaretaker.get(key) || {
      name: row.name,
      phone: row.phone,
      hours: 0,
      rate: row.rate ?? null,
    };
    existing.hours += hours;
    byCaretaker.set(key, existing);
  }

  return [...byCaretaker.values()].sort((a, b) => b.hours - a.hours);
}

const COLORS = {
  accent: "#2f9e58",
  accentDark: "#1f7a41",
  accentSoft: "#e5f5ea",
  text: "#17301f",
  muted: "#5b7364",
  border: "#dbe8dd",
};

function formatDateTime(iso) {
  return new Date(iso).toLocaleString("en-US", {
    timeZone: "UTC",
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function formatDate(date) {
  return date.toLocaleDateString("en-US", {
    timeZone: "UTC",
    dateStyle: "medium",
  });
}

function formatCurrency(amount) {
  return `$${amount.toFixed(2)}`;
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function renderHtml(summaries, rows, since, until) {
  const totalHours = summaries.reduce((sum, s) => sum + s.hours, 0);
  const totalPay = summaries.reduce(
    (sum, s) => sum + (s.rate != null ? s.hours * s.rate : 0),
    0
  );

  const th = (label) =>
    `<th style="text-align:left;padding:10px 14px;border-bottom:2px solid ${COLORS.accentDark};color:${COLORS.accentDark};font-size:13px;text-transform:uppercase;letter-spacing:0.04em;">${label}</th>`;
  const td = (content) =>
    `<td style="padding:10px 14px;border-bottom:1px solid ${COLORS.border};">${content}</td>`;

  const summaryRows = summaries
    .map(
      (s, i) => `
        <tr style="background:${i % 2 === 0 ? "#ffffff" : COLORS.accentSoft};">
          ${td(escapeHtml(s.name))}
          ${td(escapeHtml(s.phone))}
          ${td(s.hours.toFixed(2))}
          ${td(s.rate != null ? formatCurrency(s.rate) + "/hr" : "—")}
          ${td(`<strong>${s.rate != null ? formatCurrency(s.hours * s.rate) : "—"}</strong>`)}
        </tr>`
    )
    .join("");

  const summaryTable = summaries.length
    ? `<table style="border-collapse:collapse;width:100%;max-width:560px;font-family:-apple-system,Segoe UI,Roboto,sans-serif;font-size:14px;">
         <thead><tr>${th("Name")}${th("Phone")}${th("Hours")}${th("Rate")}${th("Amount")}</tr></thead>
         <tbody>${summaryRows}</tbody>
         <tfoot>
           <tr style="font-weight:bold;">
             ${td("Total")}
             ${td("")}
             ${td(totalHours.toFixed(2))}
             ${td("")}
             ${td(formatCurrency(totalPay))}
           </tr>
         </tfoot>
       </table>`
    : `<p style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:${COLORS.muted};">No completed shifts in the past week.</p>`;

  const detailRows = [...rows]
    .filter((row) => row.signed_out_at)
    .sort((a, b) => new Date(a.signed_in_at) - new Date(b.signed_in_at))
    .map(
      (row, i) => `
        <tr style="background:${i % 2 === 0 ? "#ffffff" : COLORS.accentSoft};">
          ${td(escapeHtml(row.name))}
          ${td(formatDateTime(row.signed_in_at))}
          ${td(formatDateTime(row.signed_out_at))}
        </tr>`
    )
    .join("");

  const details = rows.length
    ? `<details style="margin-top:24px;font-family:-apple-system,Segoe UI,Roboto,sans-serif;font-size:14px;">
         <summary style="cursor:pointer;font-weight:bold;color:${COLORS.accentDark};padding:8px 0;">
           All check-ins this week (${rows.length})
         </summary>
         <table style="border-collapse:collapse;width:100%;max-width:600px;margin-top:12px;">
           <thead><tr>${th("Name")}${th("Time in")}${th("Time out")}</tr></thead>
           <tbody>${detailRows}</tbody>
         </table>
       </details>`
    : "";

  // Hidden preheader: controls the inbox preview snippet (Apple Mail,
  // Gmail, Outlook, etc. otherwise pull it straight from the visible body
  // text, which just dumps the header/table as an ugly run-on string). The
  // zero-width-space padding after it stops clients from appending more of
  // the visible body onto the end of the snippet.
  const preheader = `${totalHours.toFixed(2)} hrs worked · ${formatCurrency(totalPay)} total owed`;
  const preheaderHtml = `
    <div style="display:none;max-height:0;overflow:hidden;font-size:1px;line-height:1px;color:#eef6ee;opacity:0;">
      ${preheader}
      ${"&zwnj;&nbsp;".repeat(80)}
    </div>`;

  return `
  ${preheaderHtml}
  <div style="background:#eef6ee;padding:32px 16px;">
    <div style="max-width:600px;margin:0 auto;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid ${COLORS.border};">
      <div style="background:${COLORS.accent};padding:24px 28px;">
        <div style="font-size:28px;line-height:1;">🌿</div>
        <h1 style="margin:8px 0 4px;color:#ffffff;font-family:-apple-system,Segoe UI,Roboto,sans-serif;font-size:20px;">
          Weekly Caretaker Summary
        </h1>
        <p style="margin:0;color:#e5f5ea;font-family:-apple-system,Segoe UI,Roboto,sans-serif;font-size:14px;">
          ${formatDate(since)} – ${formatDate(until)}
        </p>
        <p style="margin:4px 0 0;color:#e5f5ea;font-family:-apple-system,Segoe UI,Roboto,sans-serif;font-size:14px;">
          ${preheader}
        </p>
      </div>
      <div style="padding:24px 28px 28px;">
        ${summaryTable}
        ${details}
      </div>
    </div>
  </div>`;
}

async function sendEmail(html, since, until) {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: FROM_EMAIL,
      to: RECIPIENT_EMAIL.split(",").map((email) => email.trim()),
      subject: `${TEST_MODE ? "[TEST] " : ""}🌿 Weekly Caretaker Summary (${formatDate(since)} – ${formatDate(until)})`,
      html,
    }),
  });

  if (!res.ok) {
    throw new Error(`Resend send failed: ${res.status} ${await res.text()}`);
  }
}

const until = new Date();
const { rows, since } = TEST_MODE
  ? getSampleCheckins()
  : await fetchLastWeeksCheckins();
const summaries = summarize(rows);
const html = renderHtml(summaries, rows, since, until);
await sendEmail(html, since, until);
console.log(
  `${TEST_MODE ? "[TEST] " : ""}Sent weekly summary for ${summaries.length} caretaker(s) to ${RECIPIENT_EMAIL}.`
);
