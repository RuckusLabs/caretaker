// Queries Supabase for the past week's completed check-ins, groups hours by
// caretaker, and emails a summary table via Resend. Run by
// .github/workflows/weekly-email.yml every Monday morning.

const SUPABASE_URL = requireEnv("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
const RESEND_API_KEY = requireEnv("RESEND_API_KEY");
const RECIPIENT_EMAIL = requireEnv("RECIPIENT_EMAIL");
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
  url.searchParams.set("select", "name,phone,signed_in_at,signed_out_at");
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

  return res.json();
}

function summarize(rows) {
  const byCaretaker = new Map();

  for (const row of rows) {
    if (!row.signed_out_at) continue;
    const hours =
      (new Date(row.signed_out_at).getTime() -
        new Date(row.signed_in_at).getTime()) /
      3600000;

    const key = `${row.name}|${row.phone}`;
    const existing = byCaretaker.get(key) || {
      name: row.name,
      phone: row.phone,
      hours: 0,
    };
    existing.hours += hours;
    byCaretaker.set(key, existing);
  }

  return [...byCaretaker.values()].sort((a, b) => b.hours - a.hours);
}

function renderHtml(summaries, rows) {
  const summaryRows = summaries
    .map(
      (s) => `
        <tr>
          <td style="padding:8px 12px;border-bottom:1px solid #e2e4e9;">${escapeHtml(s.name)}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #e2e4e9;">${s.hours.toFixed(2)}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #e2e4e9;">${escapeHtml(s.phone)}</td>
        </tr>`
    )
    .join("");

  const body = summaries.length
    ? `<table style="border-collapse:collapse;width:100%;max-width:480px;font-family:sans-serif;font-size:14px;">
         <thead>
           <tr>
             <th style="text-align:left;padding:8px 12px;border-bottom:2px solid #1f2430;">Name</th>
             <th style="text-align:left;padding:8px 12px;border-bottom:2px solid #1f2430;">Hours</th>
             <th style="text-align:left;padding:8px 12px;border-bottom:2px solid #1f2430;">Phone</th>
           </tr>
         </thead>
         <tbody>${summaryRows}</tbody>
       </table>`
    : `<p style="font-family:sans-serif;">No completed shifts in the past week.</p>`;

  const detailRows = [...rows]
    .filter((row) => row.signed_out_at)
    .sort((a, b) => new Date(a.signed_in_at) - new Date(b.signed_in_at))
    .map(
      (row) => `
        <tr>
          <td style="padding:8px 12px;border-bottom:1px solid #e2e4e9;">${escapeHtml(row.name)}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #e2e4e9;">${formatDateTime(row.signed_in_at)}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #e2e4e9;">${formatDateTime(row.signed_out_at)}</td>
        </tr>`
    )
    .join("");

  const details = rows.length
    ? `<details style="margin-top:20px;font-family:sans-serif;font-size:14px;">
         <summary style="cursor:pointer;font-weight:bold;">All check-ins this week</summary>
         <table style="border-collapse:collapse;width:100%;max-width:600px;margin-top:12px;">
           <thead>
             <tr>
               <th style="text-align:left;padding:8px 12px;border-bottom:2px solid #1f2430;">Name</th>
               <th style="text-align:left;padding:8px 12px;border-bottom:2px solid #1f2430;">Time in</th>
               <th style="text-align:left;padding:8px 12px;border-bottom:2px solid #1f2430;">Time out</th>
             </tr>
           </thead>
           <tbody>${detailRows}</tbody>
         </table>
       </details>`
    : "";

  return `<div>
    <h2 style="font-family:sans-serif;">Weekly Caretaker Summary</h2>
    ${body}
    ${details}
  </div>`;
}

function formatDateTime(iso) {
  return new Date(iso).toLocaleString("en-US", {
    timeZone: "UTC",
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

async function sendEmail(html) {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: FROM_EMAIL,
      to: [RECIPIENT_EMAIL],
      subject: "Weekly Caretaker Summary",
      html,
    }),
  });

  if (!res.ok) {
    throw new Error(`Resend send failed: ${res.status} ${await res.text()}`);
  }
}

const rows = await fetchLastWeeksCheckins();
const summaries = summarize(rows);
const html = renderHtml(summaries, rows);
await sendEmail(html);
console.log(`Sent weekly summary for ${summaries.length} caretaker(s).`);
