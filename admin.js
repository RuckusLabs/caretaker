(function () {
  "use strict";

  const supabase = window.supabase.createClient(
    window.CARETAKER_CONFIG.SUPABASE_URL,
    window.CARETAKER_CONFIG.SUPABASE_ANON_KEY
  );

  const screenLogin = document.getElementById("screen-login");
  const screenAdmin = document.getElementById("screen-admin");

  function digitsOnly(value) {
    return value.replace(/\D/g, "");
  }

  function formatPhoneNumber(value) {
    const digits = digitsOnly(value).slice(0, 10);
    const len = digits.length;
    if (len < 4) return digits;
    if (len < 7) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }

  // Same pay-rounding rule as scripts/send-weekly-email.mjs: over 30
  // minutes past the hour rounds up, 30 minutes or under rounds down.
  function roundHoursForPay(rawHours) {
    const wholeHours = Math.floor(rawHours);
    const extraMinutes = (rawHours - wholeHours) * 60;
    return extraMinutes > 30 ? wholeHours + 1 : wholeHours;
  }

  function formatCurrency(amount) {
    return `$${amount.toFixed(2)}`;
  }

  function formatDateTime(iso) {
    return new Date(iso).toLocaleString(undefined, {
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

  // ---- Auth ----

  const loginEmail = document.getElementById("login-email");
  const loginPassword = document.getElementById("login-password");
  const loginError = document.getElementById("login-error");

  document.getElementById("btn-login").addEventListener("click", async () => {
    loginError.textContent = "";
    const email = loginEmail.value.trim();
    const password = loginPassword.value;
    if (!email || !password) {
      loginError.textContent = "Enter your email and password.";
      return;
    }
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      loginError.textContent = "Sign in failed — check your email/password.";
    }
  });

  document.getElementById("btn-logout").addEventListener("click", async () => {
    await supabase.auth.signOut();
  });

  supabase.auth.onAuthStateChange((_event, session) => {
    if (session) {
      showAdmin();
    } else {
      screenAdmin.hidden = true;
      screenLogin.hidden = false;
    }
  });

  function showAdmin() {
    screenLogin.hidden = true;
    screenAdmin.hidden = false;
    loadCaretakers();
    setThisWeek();
    loadAllocation();
  }

  // ---- Tabs ----

  document.querySelectorAll(".admin-tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      document.querySelectorAll(".admin-tab").forEach((t) => t.classList.remove("active"));
      tab.classList.add("active");
      document.getElementById("panel-allocation").hidden = tab.dataset.tab !== "allocation";
      document.getElementById("panel-caretakers").hidden = tab.dataset.tab !== "caretakers";
    });
  });

  // ---- Weekly allocation ----

  const rangeStart = document.getElementById("range-start");
  const rangeEnd = document.getElementById("range-end");
  const allocationError = document.getElementById("allocation-error");

  function toDateInputValue(date) {
    return date.toISOString().slice(0, 10);
  }

  function mostRecentMonday(date) {
    const d = new Date(date);
    const day = d.getDay();
    const diff = day === 0 ? 6 : day - 1;
    d.setDate(d.getDate() - diff);
    return d;
  }

  function setThisWeek() {
    const monday = mostRecentMonday(new Date());
    rangeStart.value = toDateInputValue(monday);
    rangeEnd.value = toDateInputValue(new Date());
  }

  function setLastWeek() {
    const thisMonday = mostRecentMonday(new Date());
    const lastMonday = new Date(thisMonday);
    lastMonday.setDate(lastMonday.getDate() - 7);
    const lastSunday = new Date(thisMonday);
    lastSunday.setDate(lastSunday.getDate() - 1);
    rangeStart.value = toDateInputValue(lastMonday);
    rangeEnd.value = toDateInputValue(lastSunday);
  }

  document.getElementById("btn-this-week").addEventListener("click", () => {
    setThisWeek();
    loadAllocation();
  });

  document.getElementById("btn-last-week").addEventListener("click", () => {
    setLastWeek();
    loadAllocation();
  });

  document.getElementById("btn-load-range").addEventListener("click", loadAllocation);

  async function loadAllocation() {
    allocationError.textContent = "";
    const startDate = rangeStart.value;
    const endDate = rangeEnd.value;
    if (!startDate || !endDate) {
      allocationError.textContent = "Choose a start and end date.";
      return;
    }

    const startIso = new Date(`${startDate}T00:00:00`).toISOString();
    const endIso = new Date(`${endDate}T23:59:59.999`).toISOString();

    const { data, error } = await supabase
      .from("checkins")
      .select("name,phone,rate,shift,signed_in_at,signed_out_at,bowel_movement,ate,notes")
      .gte("signed_out_at", startIso)
      .lte("signed_out_at", endIso)
      .order("signed_in_at", { ascending: true });

    if (error) {
      console.error(error);
      allocationError.textContent = "Couldn't load check-ins.";
      return;
    }

    renderAllocation(data);
  }

  function renderAllocation(rows) {
    const byCaretaker = new Map();

    rows.forEach((row) => {
      if (!row.signed_out_at) return;
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
    });

    const summaries = [...byCaretaker.values()].sort((a, b) => b.hours - a.hours);
    const totalHours = summaries.reduce((sum, s) => sum + s.hours, 0);
    const totalPay = summaries.reduce(
      (sum, s) => sum + (s.rate != null ? s.hours * s.rate : 0),
      0
    );

    const summaryContainer = document.getElementById("allocation-summary");
    if (!summaries.length) {
      summaryContainer.innerHTML = `<p class="admin-empty">No completed shifts in this range.</p>`;
    } else {
      const bodyRows = summaries
        .map(
          (s) => `
          <tr>
            <td>${escapeHtml(s.name)}</td>
            <td>${escapeHtml(s.phone)}</td>
            <td>${s.hours.toFixed(2)}</td>
            <td>${s.rate != null ? formatCurrency(s.rate) + "/hr" : "—"}</td>
            <td><strong>${s.rate != null ? formatCurrency(s.hours * s.rate) : "—"}</strong></td>
          </tr>`
        )
        .join("");

      summaryContainer.innerHTML = `
        <table class="admin-table">
          <thead>
            <tr><th>Name</th><th>Phone</th><th>Hours</th><th>Rate</th><th>Amount</th></tr>
          </thead>
          <tbody>${bodyRows}</tbody>
          <tfoot>
            <tr>
              <td>Total</td><td></td><td>${totalHours.toFixed(2)}</td><td></td>
              <td>${formatCurrency(totalPay)}</td>
            </tr>
          </tfoot>
        </table>`;
    }

    const completed = rows.filter((r) => r.signed_out_at);
    const detailContainer = document.getElementById("allocation-detail");
    if (!completed.length) {
      detailContainer.innerHTML = "";
      return;
    }

    const ateLabel = (ate) => (ate ? ate[0].toUpperCase() + ate.slice(1) : "—");

    const detailRows = completed
      .map(
        (row) => `
        <tr>
          <td>${escapeHtml(row.name)}</td>
          <td style="text-transform:capitalize;">${escapeHtml(row.shift)}</td>
          <td>${formatDateTime(row.signed_in_at)}</td>
          <td>${formatDateTime(row.signed_out_at)}</td>
          <td>${row.bowel_movement ? "Yes" : "No"}</td>
          <td>${ateLabel(row.ate)}</td>
          <td>${row.notes ? escapeHtml(row.notes) : "—"}</td>
        </tr>`
      )
      .join("");

    detailContainer.innerHTML = `
      <details class="admin-details">
        <summary>All check-ins in range (${completed.length})</summary>
        <table class="admin-table">
          <thead>
            <tr>
              <th>Name</th><th>Shift</th><th>Time in</th><th>Time out</th>
              <th>BM</th><th>Ate</th><th>Notes</th>
            </tr>
          </thead>
          <tbody>${detailRows}</tbody>
        </table>
      </details>`;
  }

  // ---- Caretakers management ----

  const caretakersError = document.getElementById("caretakers-error");

  async function loadCaretakers() {
    caretakersError.textContent = "";
    const { data, error } = await supabase
      .from("caretakers")
      .select("id,name,phone,rate")
      .order("name");

    if (error) {
      console.error(error);
      caretakersError.textContent = "Couldn't load caretakers.";
      return;
    }

    renderCaretakers(data);
  }

  function renderCaretakers(caretakers) {
    const container = document.getElementById("caretakers-table");
    if (!caretakers.length) {
      container.innerHTML = `<p class="admin-empty">No caretakers yet — add one below.</p>`;
      return;
    }

    const rows = caretakers
      .map(
        (c) => `
        <tr data-id="${c.id}">
          <td><input type="text" class="edit-name" value="${escapeHtml(c.name)}" /></td>
          <td><input type="tel" class="edit-phone" value="${escapeHtml(formatPhoneNumber(c.phone))}" maxlength="14" /></td>
          <td><input type="number" class="edit-rate" value="${c.rate}" step="0.01" min="0" /></td>
          <td class="row-actions">
            <button class="btn-secondary btn-save">Save</button>
            <button class="btn-danger btn-delete">Delete</button>
          </td>
        </tr>`
      )
      .join("");

    container.innerHTML = `
      <table class="admin-table">
        <thead><tr><th>Name</th><th>Phone</th><th>Rate ($/hr)</th><th></th></tr></thead>
        <tbody>${rows}</tbody>
      </table>`;

    container.querySelectorAll(".edit-phone").forEach((input) => {
      input.addEventListener("input", () => {
        input.value = formatPhoneNumber(input.value);
      });
    });

    container.querySelectorAll("tr[data-id]").forEach((tr) => {
      const id = tr.dataset.id;

      tr.querySelector(".btn-save").addEventListener("click", async () => {
        caretakersError.textContent = "";
        const name = tr.querySelector(".edit-name").value.trim();
        const phone = tr.querySelector(".edit-phone").value.trim();
        const rate = parseFloat(tr.querySelector(".edit-rate").value);

        if (!name || !phone || Number.isNaN(rate) || rate < 0) {
          caretakersError.textContent = "Fill in a valid name, phone, and rate.";
          return;
        }

        const { error } = await supabase
          .from("caretakers")
          .update({ name, phone, rate })
          .eq("id", id);

        if (error) {
          console.error(error);
          caretakersError.textContent = "Couldn't save changes.";
          return;
        }
        loadCaretakers();
      });

      tr.querySelector(".btn-delete").addEventListener("click", async () => {
        if (!confirm("Remove this caretaker? They won't be able to sign in by name anymore.")) {
          return;
        }
        const { error } = await supabase.from("caretakers").delete().eq("id", id);
        if (error) {
          console.error(error);
          caretakersError.textContent = "Couldn't delete caretaker.";
          return;
        }
        loadCaretakers();
      });
    });
  }

  const newPhoneInput = document.getElementById("new-phone");
  newPhoneInput.addEventListener("input", () => {
    newPhoneInput.value = formatPhoneNumber(newPhoneInput.value);
  });

  document.getElementById("btn-add-caretaker").addEventListener("click", async () => {
    caretakersError.textContent = "";
    const name = document.getElementById("new-name").value.trim();
    const phone = newPhoneInput.value.trim();
    const rate = parseFloat(document.getElementById("new-rate").value);

    if (!name || !phone || Number.isNaN(rate) || rate < 0) {
      caretakersError.textContent = "Fill in a valid name, phone, and rate.";
      return;
    }

    const { error } = await supabase.from("caretakers").insert({ name, phone, rate });
    if (error) {
      console.error(error);
      caretakersError.textContent = "Couldn't add caretaker.";
      return;
    }

    document.getElementById("new-name").value = "";
    newPhoneInput.value = "";
    document.getElementById("new-rate").value = "";
    loadCaretakers();
  });

  // ---- Boot ----

  supabase.auth.getSession().then(({ data: { session } }) => {
    if (session) {
      showAdmin();
    } else {
      screenLogin.hidden = false;
    }
  });
})();
