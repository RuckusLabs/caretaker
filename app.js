(function () {
  "use strict";

  const SESSION_KEY = "caretaker_active_session";
  const SUMMARY_KEY = "caretaker_last_summary";

  const supabase = window.supabase.createClient(
    window.CARETAKER_CONFIG.SUPABASE_URL,
    window.CARETAKER_CONFIG.SUPABASE_ANON_KEY
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
    const hour = new Date().getHours();
    return hour < window.CARETAKER_SHIFT_CUTOFF_HOUR ? "morning" : "afternoon";
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

  const nameInput = document.getElementById("name");
  const phoneInput = document.getElementById("phone");
  const signinError = document.getElementById("signin-error");

  document.getElementById("btn-signin").addEventListener("click", async () => {
    signinError.textContent = "";
    const name = nameInput.value.trim();
    const phone = phoneInput.value.trim();

    if (!name || !phone) {
      signinError.textContent = "Please enter your name and phone number.";
      return;
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

  function renderActive(session) {
    showScreen("active");
    document.getElementById(
      "active-subtitle"
    ).textContent = `${session.name} · ${session.phone}`;
    document.getElementById("shift-label").textContent = `${session.shift} shift`;

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
      "Are you sure you want to sign out?",
      "Continue",
      () => {
        showConfirm(
          "This will end your shift and cannot be undone. Sign out now?",
          "Sign Out",
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

    try {
      const { error } = await supabase
        .from("checkins")
        .update({
          signed_out_at: signedOutAt,
          checklist: session.checklist,
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
      };
      localStorage.setItem(SUMMARY_KEY, JSON.stringify(summary));
      clearSession();
      if (timerInterval) clearInterval(timerInterval);
      renderSummary(summary);
    } catch (err) {
      console.error(err);
      activeError.textContent =
        "Couldn't sign out — check your connection and try again.";
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
    nameInput.value = "";
    phoneInput.value = "";
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
