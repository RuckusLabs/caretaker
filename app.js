(function () {
  "use strict";

  const SESSION_KEY = "caretaker_active_session";
  const SUMMARY_KEY = "caretaker_last_summary";

  // This app never logs in — it should always act as the anon role, even
  // if an admin session for admin.html is sitting in this browser's local
  // storage (same origin, same Supabase project). Disabling session
  // persistence keeps the two pages' auth state fully independent.
  const supabase = window.supabase.createClient(
    window.CARETAKER_CONFIG.SUPABASE_URL,
    window.CARETAKER_CONFIG.SUPABASE_ANON_KEY,
    { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } }
  );

  const screens = {
    signin: document.getElementById("screen-signin"),
    active: document.getElementById("screen-active"),
    summary: document.getElementById("screen-summary"),
  };

  function showScreen(name) {
    Object.entries(screens).forEach(([key, el]) => {
      el.hidden = key !== name;
    });
  }

  function detectShift() {
    const now = new Date();
    const hour = now.getHours() + now.getMinutes() / 60;
    const { morning, afternoon } = window.CARETAKER_SHIFT_WINDOWS;

    if (hour >= morning.start && hour < morning.end) return "morning";
    if (hour >= afternoon.start && hour < afternoon.end) return "afternoon";

    // Outside both windows: fall back to whichever shift is closer in time.
    if (hour < morning.start) return "morning";
    if (hour >= afternoon.end) return "afternoon";
    const midpoint = (morning.end + afternoon.start) / 2;
    return hour < midpoint ? "morning" : "afternoon";
  }

  function buildChecklist(shift) {
    const general = window.CARETAKER_CHECKLISTS.general.map((text) => ({
      text,
      group: "General",
      checked: false,
    }));
    const shiftItems = window.CARETAKER_CHECKLISTS[shift].map((text) => ({
      text,
      group: shift === "morning" ? "Morning" : "Afternoon",
      checked: false,
    }));
    return [...shiftItems, ...general];
  }

  function saveSession(session) {
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  }

  function loadSession() {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  }

  function clearSession() {
    localStorage.removeItem(SESSION_KEY);
  }

  function formatElapsed(ms) {
    const totalSeconds = Math.max(0, Math.floor(ms / 1000));
    const h = String(Math.floor(totalSeconds / 3600)).padStart(2, "0");
    const m = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, "0");
    const s = String(totalSeconds % 60).padStart(2, "0");
    return `${h}:${m}:${s}`;
  }

  function formatDateTime(iso) {
    return new Date(iso).toLocaleString(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    });
  }

  // ---- Sign in ----

  const UNLISTED_VALUE = "__unlisted__";

  const nameInput = document.getElementById("name");
  const phoneInput = document.getElementById("phone");
  const signinError = document.getElementById("signin-error");
  const signinBtn = document.getElementById("btn-signin");
  const unlistedFields = document.getElementById("unlisted-fields");
  const unlistedNameInput = document.getElementById("unlisted-name");
  const unlistedRateInput = document.getElementById("unlisted-rate");
  const phoneHint = document.getElementById("phone-hint");

  let caretakers = [];

  nameInput.addEventListener("change", () => {
    const isUnlisted = nameInput.value === UNLISTED_VALUE;
    unlistedFields.hidden = !isUnlisted;
    phoneHint.hidden = isUnlisted;
  });

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

  phoneInput.addEventListener("input", () => {
    phoneInput.value = formatPhoneNumber(phoneInput.value);
  });

  function displayName(fullName) {
    const parts = fullName.trim().split(/\s+/);
    if (parts.length < 2) return fullName;
    const first = parts[0];
    const lastInitial = parts[parts.length - 1][0];
    return `${first} ${lastInitial}.`;
  }

  async function loadCaretakers() {
    try {
      const { data, error } = await supabase
        .from("caretakers")
        .select("name,phone,rate");
      if (error) throw error;
      caretakers = data;
    } catch (err) {
      console.error(err);
      caretakers = [];
    }

    caretakers.sort((a, b) => a.name.localeCompare(b.name));

    nameInput.innerHTML = "";
    if (!caretakers.length) {
      const opt = document.createElement("option");
      opt.value = "";
      opt.textContent = "No caretakers configured";
      opt.disabled = true;
      opt.selected = true;
      nameInput.appendChild(opt);
      signinBtn.disabled = true;
      return;
    }

    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = "Select your name";
    placeholder.disabled = true;
    placeholder.selected = true;
    nameInput.appendChild(placeholder);

    caretakers.forEach((c) => {
      const opt = document.createElement("option");
      opt.value = c.name;
      opt.textContent = displayName(c.name);
      nameInput.appendChild(opt);
    });

    const unlistedOpt = document.createElement("option");
    unlistedOpt.value = UNLISTED_VALUE;
    unlistedOpt.textContent = "Someone else (not listed)";
    nameInput.appendChild(unlistedOpt);

    signinBtn.disabled = false;
  }

  loadCaretakers();

  document.getElementById("btn-signin").addEventListener("click", async () => {
    signinError.textContent = "";
    const selected = nameInput.value;
    const phone = phoneInput.value.trim();
    const isUnlisted = selected === UNLISTED_VALUE;

    let name, rate;

    if (isUnlisted) {
      name = unlistedNameInput.value.trim();
      const rateValue = parseFloat(unlistedRateInput.value);
      if (!name || !phone || !unlistedRateInput.value || Number.isNaN(rateValue) || rateValue < 0) {
        signinError.textContent =
          "Please enter your name, hourly rate, and phone number.";
        return;
      }
      rate = rateValue;
    } else {
      if (!selected || !phone) {
        signinError.textContent = "Please select your name and enter your phone number.";
        return;
      }
      const caretaker = caretakers.find((c) => c.name === selected);
      if (!caretaker || digitsOnly(phone) !== digitsOnly(caretaker.phone)) {
        signinError.textContent = "That phone number doesn't match our records.";
        return;
      }
      name = caretaker.name;
      rate = caretaker.rate;
    }

    const shift = detectShift();
    const signedInAt = new Date().toISOString();
    const checklist = buildChecklist(shift);

    const btn = document.getElementById("btn-signin");
    btn.disabled = true;
    try {
      const { data, error } = await supabase
        .from("checkins")
        .insert({
          name,
          phone,
          rate,
          shift,
          signed_in_at: signedInAt,
          checklist,
        })
        .select()
        .single();

      if (error) throw error;

      const session = {
        id: data.id,
        name,
        phone,
        shift,
        signedInAt,
        checklist,
      };
      saveSession(session);
      renderActive(session);
    } catch (err) {
      console.error(err);
      signinError.textContent =
        "Couldn't sign in — check your connection and try again.";
    } finally {
      btn.disabled = false;
    }
  });

  // ---- Active shift ----

  let timerInterval = null;

  const bmCheckbox = document.getElementById("bm");
  const ateSelect = document.getElementById("ate");
  const notesInput = document.getElementById("notes");

  function resetEndOfShiftFields() {
    bmCheckbox.checked = false;
    document.getElementById("bm-row").classList.remove("checked");
    ateSelect.value = "";
    notesInput.value = "";
  }

  bmCheckbox.addEventListener("change", () => {
    document.getElementById("bm-row").classList.toggle("checked", bmCheckbox.checked);
  });

  function renderActive(session) {
    showScreen("active");
    document.getElementById(
      "active-subtitle"
    ).textContent = `${displayName(session.name)} · ${session.phone}`;
    document.getElementById("shift-label").textContent = `${session.shift} shift`;

    resetEndOfShiftFields();
    renderChecklist(session);

    if (timerInterval) clearInterval(timerInterval);
    const tick = () => {
      const elapsedEl = document.getElementById("elapsed");
      elapsedEl.textContent = formatElapsed(
        Date.now() - new Date(session.signedInAt).getTime()
      );
    };
    tick();
    timerInterval = setInterval(tick, 1000);
  }

  function renderChecklist(session) {
    const container = document.getElementById("checklist-container");
    container.innerHTML = "";

    const groups = [];
    session.checklist.forEach((item) => {
      let group = groups.find((g) => g.name === item.group);
      if (!group) {
        group = { name: item.group, items: [] };
        groups.push(group);
      }
      group.items.push(item);
    });

    groups.forEach((group) => {
      const groupEl = document.createElement("div");
      groupEl.className = "checklist-group";
      const heading = document.createElement("h2");
      heading.textContent = group.name;
      groupEl.appendChild(heading);

      group.items.forEach((item) => {
        const globalIndex = session.checklist.indexOf(item);
        const row = document.createElement("div");
        row.className = "checklist-item" + (item.checked ? " checked" : "");

        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.id = `chk-${globalIndex}`;
        checkbox.checked = item.checked;
        checkbox.addEventListener("change", () => {
          item.checked = checkbox.checked;
          row.classList.toggle("checked", item.checked);
          saveSession(session);
          // Best-effort sync of in-progress checklist; ignore failures.
          supabase
            .from("checkins")
            .update({ checklist: session.checklist })
            .eq("id", session.id)
            .then(() => {});
        });

        const label = document.createElement("label");
        label.htmlFor = checkbox.id;
        label.textContent = item.text;

        row.appendChild(checkbox);
        row.appendChild(label);
        groupEl.appendChild(row);
      });

      container.appendChild(groupEl);
    });
  }

  // ---- Sign out (double confirm) ----

  const overlay = document.getElementById("confirm-overlay");
  const confirmBox = document.getElementById("confirm-box");

  function showConfirm(message, confirmLabel, onConfirm) {
    confirmBox.innerHTML = "";
    const p = document.createElement("p");
    p.textContent = message;
    confirmBox.appendChild(p);

    const actions = document.createElement("div");
    actions.className = "confirm-actions";

    const cancelBtn = document.createElement("button");
    cancelBtn.className = "btn-secondary";
    cancelBtn.textContent = "Cancel";
    cancelBtn.addEventListener("click", hideConfirm);

    const confirmBtn = document.createElement("button");
    confirmBtn.className = "btn-danger";
    confirmBtn.textContent = confirmLabel;
    confirmBtn.addEventListener("click", onConfirm);

    actions.appendChild(cancelBtn);
    actions.appendChild(confirmBtn);
    confirmBox.appendChild(actions);

    overlay.hidden = false;
  }

  function hideConfirm() {
    overlay.hidden = true;
  }

  document.getElementById("btn-signout").addEventListener("click", () => {
    showConfirm(
      "Are you sure you want to end your shift?",
      "Continue",
      () => {
        showConfirm(
          "This cannot be undone. End your shift now?",
          "End Shift",
          performSignOut
        );
      }
    );
  });

  async function performSignOut() {
    hideConfirm();
    const session = loadSession();
    if (!session) return;

    const signedOutAt = new Date().toISOString();
    const activeError = document.getElementById("active-error");
    const bowelMovement = bmCheckbox.checked;
    const ate = ateSelect.value || null;
    const notes = notesInput.value.trim() || null;

    try {
      const { error } = await supabase
        .from("checkins")
        .update({
          signed_out_at: signedOutAt,
          checklist: session.checklist,
          bowel_movement: bowelMovement,
          ate,
          notes,
        })
        .eq("id", session.id);

      if (error) throw error;

      const hours =
        (new Date(signedOutAt).getTime() -
          new Date(session.signedInAt).getTime()) /
        3600000;

      const summary = {
        hours: hours.toFixed(2),
        signedInAt: session.signedInAt,
        signedOutAt,
        checklist: session.checklist,
        bowelMovement,
        ate,
        notes,
      };
      localStorage.setItem(SUMMARY_KEY, JSON.stringify(summary));
      clearSession();
      if (timerInterval) clearInterval(timerInterval);
      renderSummary(summary);
    } catch (err) {
      console.error(err);
      activeError.textContent =
        "Couldn't end shift — check your connection and try again.";
    }
  }

  function renderSummary(summary) {
    showScreen("summary");
    document.getElementById("summary-hours").textContent = `${summary.hours} hrs`;
    document.getElementById("summary-signin").textContent = formatDateTime(
      summary.signedInAt
    );
    document.getElementById("summary-signout").textContent = formatDateTime(
      summary.signedOutAt
    );
    document.getElementById("summary-bm").textContent = summary.bowelMovement
      ? "Yes"
      : "No";
    document.getElementById("summary-ate").textContent = summary.ate
      ? summary.ate[0].toUpperCase() + summary.ate.slice(1)
      : "Not specified";

    const notesGroup = document.getElementById("summary-notes-group");
    if (summary.notes) {
      notesGroup.hidden = false;
      document.getElementById("summary-notes").textContent = summary.notes;
    } else {
      notesGroup.hidden = true;
    }

    const container = document.getElementById("summary-checklist");
    container.innerHTML = "";
    summary.checklist.forEach((item) => {
      const row = document.createElement("div");
      row.className = "checklist-item" + (item.checked ? " checked" : "");
      row.textContent = (item.checked ? "☑ " : "☐ ") + item.text;
      container.appendChild(row);
    });
  }

  document.getElementById("btn-done").addEventListener("click", () => {
    localStorage.removeItem(SUMMARY_KEY);
    nameInput.selectedIndex = 0;
    phoneInput.value = "";
    unlistedNameInput.value = "";
    unlistedRateInput.value = "";
    unlistedFields.hidden = true;
    phoneHint.hidden = false;
    showScreen("signin");
  });

  // ---- Resume state on load ----

  const activeSession = loadSession();
  const lastSummary = localStorage.getItem(SUMMARY_KEY);

  if (activeSession) {
    renderActive(activeSession);
  } else if (lastSummary) {
    renderSummary(JSON.parse(lastSummary));
  } else {
    showScreen("signin");
  }
})();
