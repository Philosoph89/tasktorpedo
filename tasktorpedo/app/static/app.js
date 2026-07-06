/* TaskTorpedo – Frontend. Alle URLs relativ (Home-Assistant-Ingress). */
"use strict";

// ===== Konstanten =====

const CATEGORIES = {
  haushalt: { label: "Haushalt", icon: "🧹" },
  schule:   { label: "Schule",   icon: "📚" },
  freizeit: { label: "Freizeit", icon: "⚽" },
  termine:  { label: "Termine",  icon: "📅" },
};

const WEEKDAYS = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];
const EMOJIS = ["🦊", "🐼", "🦄", "🐸", "🐯", "🦁", "🐨", "🐰", "🐙", "🦖", "🚀", "⭐", "🌈", "⚡", "🎮", "🎨"];
const COLORS = ["#6366f1", "#ec4899", "#10b981", "#f59e0b", "#3b82f6", "#a855f7", "#ef4444", "#14b8a6"];

// ===== State =====

let currentDate = todayIso();
let viewMode = localStorage.getItem("tt-view") === "week" ? "week" : "day";
let dayData = null;          // Antwort von api/day
let weekData = null;         // Antwort von api/week
let adminData = null;        // Antwort von api/admin
let parentPin = sessionStorage.getItem("tt-pin") || null;
let celebrated = new Set();  // kidIds, für die heute schon Konfetti lief
let editingKidId = null;
let editingTaskId = null;
let taskFilterKid = "all";

const $ = (sel) => document.querySelector(sel);

// ===== Utilities =====

function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function shiftDate(iso, delta) {
  const d = new Date(iso + "T12:00:00");
  d.setDate(d.getDate() + delta);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function formatDate(iso) {
  const d = new Date(iso + "T12:00:00");
  const fmt = d.toLocaleDateString("de-DE", { weekday: "long", day: "numeric", month: "long" });
  if (iso === todayIso()) return `Heute · ${fmt}`;
  if (iso === shiftDate(todayIso(), 1)) return `Morgen · ${fmt}`;
  if (iso === shiftDate(todayIso(), -1)) return `Gestern · ${fmt}`;
  return fmt;
}

function mondayOf(iso) {
  const d = new Date(iso + "T12:00:00");
  return shiftDate(iso, -((d.getDay() + 6) % 7)); // getDay(): So=0 → Mo=Start
}

function formatWeek(startIso) {
  const endIso = shiftDate(startIso, 6);
  const opts = { day: "numeric", month: "numeric" };
  const from = new Date(startIso + "T12:00:00").toLocaleDateString("de-DE", opts);
  const to = new Date(endIso + "T12:00:00").toLocaleDateString("de-DE", opts);
  const prefix = startIso === mondayOf(todayIso()) ? "Diese Woche" :
    startIso === mondayOf(shiftDate(todayIso(), 7)) ? "Nächste Woche" : "Woche";
  return `${prefix} · ${from} – ${to}`;
}

async function api(path, options = {}) {
  const headers = { "Content-Type": "application/json" };
  if (parentPin) headers["X-Parent-Pin"] = parentPin;
  const res = await fetch(path, { ...options, headers });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(body.error || res.statusText);
    err.status = res.status;
    throw err;
  }
  return body;
}

function toast(msg) {
  const el = $("#toast");
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => { el.hidden = true; }, 2400);
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

// ===== Laden (Tag / Woche) =====

let hasPinFlag = false;

async function loadView() {
  if (viewMode === "day") {
    dayData = await api(`api/day?date=${currentDate}`);
    hasPinFlag = dayData.hasPin;
    renderBoard();
  } else {
    weekData = await api(`api/week?start=${mondayOf(currentDate)}`);
    hasPinFlag = weekData.hasPin;
    renderWeek();
  }
}

function sortTasks(tasks) {
  return [...tasks].sort((a, b) => {
    if (!!a.time !== !!b.time) return a.time ? -1 : 1;
    if (a.time !== b.time) return (a.time || "").localeCompare(b.time || "");
    return a.title.localeCompare(b.title, "de");
  });
}

// ===== Tagesansicht =====

function renderBoard() {
  const label = $("#dateLabel");
  label.textContent = formatDate(currentDate);
  label.classList.toggle("not-today", currentDate !== todayIso());

  const board = $("#board");
  const empty = $("#emptyState");
  board.innerHTML = "";
  board.className = "board";

  if (!dayData.kids.length) {
    empty.hidden = false;
    board.hidden = true;
    return;
  }
  empty.hidden = true;
  board.hidden = false;

  for (const kid of dayData.kids) board.appendChild(renderKidColumn(kid));
}

function renderKidColumn(kid) {
  const col = document.createElement("section");
  col.className = "kid-column";

  const done = kid.tasks.filter((t) => t.done).length;
  const total = kid.tasks.length;
  const pct = total ? done / total : 0;

  const streakBadge = kid.streak >= 2
    ? `<span class="badge streak">🔥 ${kid.streak} Tage</span>` : "";

  col.innerHTML = `
    <header class="kid-header">
      <div class="kid-avatar" style="background:${kid.color}">${kid.emoji}</div>
      <div class="kid-meta">
        <h2 class="kid-name">${escapeHtml(kid.name)}</h2>
        <div class="kid-badges">
          <span class="badge stars">⭐ ${kid.pointsTotal}</span>
          ${streakBadge}
        </div>
      </div>
      ${progressRing(pct, done, total, kid.color)}
    </header>
    <ul class="task-list"></ul>
  `;

  const list = col.querySelector(".task-list");

  if (!total) {
    list.innerHTML = `<li class="no-tasks"><span class="big">🏖️</span>Heute keine Aufgaben!</li>`;
    return col;
  }

  const sorted = sortTasks(kid.tasks);

  let dividerShown = false;
  for (const task of sorted) {
    if (!task.time && !dividerShown && sorted.some((t) => t.time)) {
      dividerShown = true;
      const div = document.createElement("li");
      div.className = "time-divider";
      div.textContent = "Irgendwann heute";
      list.appendChild(div);
    }
    list.appendChild(renderTaskCard(kid, task));
  }

  if (done === total) {
    const li = document.createElement("li");
    li.className = "all-done";
    li.innerHTML = `<span class="big">🎉</span>Alles geschafft, ${escapeHtml(kid.name)}!`;
    list.appendChild(li);
  }

  return col;
}

function progressRing(pct, done, total, color) {
  const r = 21, c = 2 * Math.PI * r;
  const offset = c * (1 - pct);
  return `
    <div class="progress-ring" title="${done} von ${total} erledigt">
      <svg width="52" height="52" viewBox="0 0 52 52">
        <circle class="track" cx="26" cy="26" r="${r}" fill="none" stroke-width="5"/>
        <circle class="bar" cx="26" cy="26" r="${r}" fill="none" stroke-width="5"
          stroke="${color}" stroke-dasharray="${c}" stroke-dashoffset="${offset}"/>
      </svg>
      <span class="label">${done}/${total}</span>
    </div>`;
}

function renderTaskCard(kid, task) {
  const cat = CATEGORIES[task.category] || CATEGORIES.haushalt;
  const li = document.createElement("li");
  li.className = `task-card${task.done ? " done" : ""}`;
  li.style.setProperty("--cat-color", `var(--cat-${task.category})`);
  li.style.setProperty("--cat-bg", `var(--cat-${task.category}-bg)`);
  li.setAttribute("role", "checkbox");
  li.setAttribute("aria-checked", String(task.done));
  li.tabIndex = 0;

  li.innerHTML = `
    <div class="task-check">${task.done ? "✓" : ""}</div>
    <div class="task-body">
      <div class="task-title">${escapeHtml(task.title)}</div>
      <div class="task-sub">
        ${task.time ? `<span class="task-time">🕐 ${task.time}</span>` : ""}
        <span class="task-cat">${cat.icon} ${cat.label}</span>
      </div>
      ${task.note ? `<div class="task-note">${escapeHtml(task.note)}</div>` : ""}
    </div>
    <div class="task-points">+${task.points} ⭐</div>
  `;

  const toggle = () => toggleTask(kid, task);
  li.addEventListener("click", toggle);
  li.addEventListener("keydown", (e) => {
    if (e.key === " " || e.key === "Enter") { e.preventDefault(); toggle(); }
  });
  return li;
}

async function toggleTask(kid, task) {
  try {
    const res = await api("api/toggle", {
      method: "POST",
      body: JSON.stringify({ taskId: task.id, date: currentDate }),
    });
    await loadView();
    if (res.done) {
      const updated = dayData.kids.find((k) => k.id === kid.id);
      const allDone = updated && updated.tasks.length &&
        updated.tasks.every((t) => t.done);
      maybeCelebrate(kid.id, currentDate, allDone);
    }
  } catch {
    toast("Hoppla, das hat nicht geklappt 😕");
  }
}

function maybeCelebrate(kidId, dateIso, allDone) {
  const key = `${kidId}:${dateIso}`;
  if (allDone && !celebrated.has(key) && confettiEnabled()) {
    celebrated.add(key);
    fireConfetti();
  }
}

// ===== Wochenansicht =====

function renderWeek() {
  const label = $("#dateLabel");
  label.textContent = formatWeek(weekData.start);
  label.classList.toggle("not-today", weekData.start !== mondayOf(todayIso()));

  const board = $("#board");
  const empty = $("#emptyState");
  board.innerHTML = "";
  board.className = "week-wrap";

  if (!weekData.kids.length) {
    empty.hidden = false;
    board.hidden = true;
    return;
  }
  empty.hidden = true;
  board.hidden = false;

  const today = todayIso();
  const grid = document.createElement("div");
  grid.className = "week-grid";

  const corner = document.createElement("div");
  corner.className = "wg-corner";
  grid.appendChild(corner);

  weekData.days.forEach((iso, i) => {
    const d = new Date(iso + "T12:00:00");
    const head = document.createElement("div");
    head.className = "wg-head" + (iso === today ? " today" : "");
    head.innerHTML = `${WEEKDAYS[i]}<span class="wg-date">${d.toLocaleDateString("de-DE", { day: "numeric", month: "numeric" })}</span>`;
    grid.appendChild(head);
  });

  for (const kid of weekData.kids) {
    const kc = document.createElement("div");
    kc.className = "wg-kid";
    const streakBadge = kid.streak >= 2
      ? `<span class="badge streak">🔥 ${kid.streak}</span>` : "";
    kc.innerHTML = `
      <div class="kid-avatar" style="background:${kid.color}">${kid.emoji}</div>
      <div class="wg-kid-name">${escapeHtml(kid.name)}</div>
      <div class="kid-badges"><span class="badge stars">⭐ ${kid.pointsTotal}</span>${streakBadge}</div>`;
    grid.appendChild(kc);

    kid.days.forEach((tasks, i) => {
      const iso = weekData.days[i];
      const cell = document.createElement("div");
      cell.className = "wg-cell" + (iso === today ? " today" : "");
      const sorted = sortTasks(tasks);
      if (!sorted.length) {
        cell.innerHTML = `<span class="wg-empty">·</span>`;
      } else {
        for (const t of sorted) cell.appendChild(renderWeekTask(kid, t, iso));
        if (sorted.every((t) => t.done)) {
          const done = document.createElement("div");
          done.className = "wg-alldone";
          done.textContent = "🎉 Alles erledigt";
          cell.appendChild(done);
        }
      }
      grid.appendChild(cell);
    });
  }

  board.appendChild(grid);
}

function renderWeekTask(kid, task, dateIso) {
  const cat = CATEGORIES[task.category] || CATEGORIES.haushalt;
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "wtask" + (task.done ? " done" : "");
  btn.style.setProperty("--cat-color", `var(--cat-${task.category})`);
  btn.title = `${cat.icon} ${cat.label} · +${task.points} ⭐${task.note ? " · " + task.note : ""}`;
  btn.setAttribute("aria-pressed", String(task.done));
  btn.innerHTML = `
    <span class="wt-check">${task.done ? "✓" : ""}</span>
    <span class="wt-body">
      <span class="wt-title">${escapeHtml(task.title)}</span>
      ${task.time ? `<span class="wt-time">🕐 ${task.time}</span>` : ""}
    </span>`;
  btn.addEventListener("click", async () => {
    try {
      const res = await api("api/toggle", {
        method: "POST",
        body: JSON.stringify({ taskId: task.id, date: dateIso }),
      });
      await loadView();
      if (res.done && dateIso === todayIso()) {
        const k = weekData.kids.find((x) => x.id === kid.id);
        const dayTasks = k ? k.days[weekData.days.indexOf(dateIso)] : [];
        maybeCelebrate(kid.id, dateIso, dayTasks.length && dayTasks.every((t) => t.done));
      }
    } catch {
      toast("Hoppla, das hat nicht geklappt 😕");
    }
  });
  return btn;
}

// ===== Navigation & Ansicht-Umschalter =====

const NAV_STEP = () => (viewMode === "week" ? 7 : 1);

$("#prevDay").addEventListener("click", () => { currentDate = shiftDate(currentDate, -NAV_STEP()); loadView(); });
$("#nextDay").addEventListener("click", () => { currentDate = shiftDate(currentDate, NAV_STEP()); loadView(); });
$("#datePill").addEventListener("click", () => { currentDate = todayIso(); loadView(); });

function setViewMode(mode) {
  viewMode = mode;
  localStorage.setItem("tt-view", mode);
  $("#viewDayBtn").classList.toggle("active", mode === "day");
  $("#viewWeekBtn").classList.toggle("active", mode === "week");
  loadView().catch(() => toast("Server nicht erreichbar 😕"));
}

$("#viewDayBtn").addEventListener("click", () => setViewMode("day"));
$("#viewWeekBtn").addEventListener("click", () => setViewMode("week"));

// ===== Eltern-Bereich (PIN + Settings) =====

$("#openSettings").addEventListener("click", openParentArea);
$("#emptyStart").addEventListener("click", openParentArea);

async function openParentArea() {
  if (hasPinFlag && !parentPin) {
    $("#pinInput").value = "";
    $("#pinError").hidden = true;
    $("#pinDialog").showModal();
    setTimeout(() => $("#pinInput").focus(), 50);
    return;
  }
  await openSettings();
}

$("#pinForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const pin = $("#pinInput").value.trim();
  const res = await api("api/pin/verify", { method: "POST", body: JSON.stringify({ pin }) });
  if (res.ok) {
    parentPin = pin;
    sessionStorage.setItem("tt-pin", pin);
    $("#pinDialog").close();
    await openSettings();
  } else {
    $("#pinError").hidden = false;
    $("#pinInput").value = "";
    $("#pinInput").focus();
  }
});

async function openSettings() {
  try {
    adminData = await api("api/admin");
  } catch (err) {
    if (err.status === 403) {
      parentPin = null;
      sessionStorage.removeItem("tt-pin");
      return openParentArea();
    }
    return toast("Fehler beim Laden 😕");
  }
  renderKidList();
  renderTaskAdmin();
  $("#settingsDialog").showModal();
}

// Tabs
document.querySelectorAll(".tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach((t) => t.classList.toggle("active", t === tab));
    document.querySelectorAll(".tab-panel").forEach((p) => {
      p.hidden = p.id !== `panel-${tab.dataset.tab}`;
    });
  });
});

// Dialog-Schließen (X / Abbrechen / Backdrop)
document.querySelectorAll("[data-close]").forEach((btn) => {
  btn.addEventListener("click", () => btn.closest("dialog").close());
});
document.querySelectorAll("dialog.modal").forEach((dlg) => {
  dlg.addEventListener("click", (e) => {
    if (e.target === dlg) dlg.close();
  });
});
$("#settingsDialog").addEventListener("close", () => loadView());

// ===== Kinder verwalten =====

function renderKidList() {
  const list = $("#kidList");
  list.innerHTML = "";
  if (!adminData.kids.length) {
    list.innerHTML = `<p class="muted">Noch keine Kinder angelegt.</p>`;
  }
  for (const kid of adminData.kids) {
    const count = adminData.tasks.filter((t) => t.kidId === kid.id).length;
    const item = document.createElement("div");
    item.className = "admin-item";
    item.innerHTML = `
      <div class="mini-avatar" style="background:${kid.color}">${kid.emoji}</div>
      <div class="grow">
        <div class="title">${escapeHtml(kid.name)}</div>
        <div class="sub">${count} Aufgabe${count === 1 ? "" : "n"}</div>
      </div>
      <span class="edit-hint">✏️</span>`;
    item.addEventListener("click", () => openKidForm(kid));
    list.appendChild(item);
  }
}

$("#addKid").addEventListener("click", () => openKidForm(null));

function openKidForm(kid) {
  editingKidId = kid?.id || null;
  $("#kidFormTitle").textContent = kid ? "Kind bearbeiten" : "Kind hinzufügen";
  $("#kidName").value = kid?.name || "";
  $("#deleteKid").hidden = !kid;
  buildPicker($("#emojiGrid"), EMOJIS, kid?.emoji || EMOJIS[0], "emoji-option",
    (v, el) => { el.textContent = v; });
  buildPicker($("#colorGrid"), COLORS, kid?.color || COLORS[0], "color-option",
    (v, el) => { el.style.background = v; });
  $("#kidDialog").showModal();
  setTimeout(() => $("#kidName").focus(), 50);
}

function buildPicker(container, values, selected, cls, decorate) {
  container.innerHTML = "";
  for (const v of values) {
    const el = document.createElement("button");
    el.type = "button";
    el.className = cls + (v === selected ? " active" : "");
    el.dataset.value = v;
    decorate(v, el);
    el.addEventListener("click", () => {
      container.querySelectorAll("." + cls).forEach((o) => o.classList.remove("active"));
      el.classList.add("active");
    });
    container.appendChild(el);
  }
}

$("#kidForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const payload = {
    name: $("#kidName").value.trim(),
    emoji: $("#emojiGrid .active")?.dataset.value || EMOJIS[0],
    color: $("#colorGrid .active")?.dataset.value || COLORS[0],
  };
  try {
    if (editingKidId) {
      await api(`api/kids/${editingKidId}`, { method: "PUT", body: JSON.stringify(payload) });
    } else {
      await api("api/kids", { method: "POST", body: JSON.stringify(payload) });
    }
    $("#kidDialog").close();
    adminData = await api("api/admin");
    renderKidList();
    renderTaskAdmin();
  } catch (err) {
    toast(err.message);
  }
});

$("#deleteKid").addEventListener("click", async () => {
  const kid = adminData.kids.find((k) => k.id === editingKidId);
  if (!confirm(`${kid?.name} und alle zugehörigen Aufgaben wirklich löschen?`)) return;
  await api(`api/kids/${editingKidId}`, { method: "DELETE" });
  $("#kidDialog").close();
  adminData = await api("api/admin");
  renderKidList();
  renderTaskAdmin();
});

// ===== Aufgaben verwalten =====

function describeRecurrence(rec) {
  if (rec.type === "once") {
    return "📅 " + new Date(rec.date + "T12:00:00")
      .toLocaleDateString("de-DE", { day: "numeric", month: "short", year: "numeric" });
  }
  const days = rec.days || [];
  if (days.length === 7) return "Täglich";
  if (days.join() === "0,1,2,3,4") return "Mo–Fr";
  if (days.join() === "5,6") return "Wochenende";
  return days.map((d) => WEEKDAYS[d]).join(", ");
}

function renderTaskAdmin() {
  // Filter-Chips
  const filter = $("#taskFilter");
  filter.innerHTML = "";
  const options = [{ id: "all", label: "Alle" }, ...adminData.kids.map((k) => ({ id: k.id, label: `${k.emoji} ${k.name}` }))];
  if (!options.some((o) => o.id === taskFilterKid)) taskFilterKid = "all";
  for (const opt of options) {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "chip" + (taskFilterKid === opt.id ? " active" : "");
    chip.textContent = opt.label;
    chip.addEventListener("click", () => { taskFilterKid = opt.id; renderTaskAdmin(); });
    filter.appendChild(chip);
  }

  const list = $("#taskList");
  list.innerHTML = "";
  const tasks = adminData.tasks
    .filter((t) => taskFilterKid === "all" || t.kidId === taskFilterKid)
    .sort((a, b) => (a.time || "99").localeCompare(b.time || "99"));

  if (!tasks.length) {
    list.innerHTML = `<p class="muted">Keine Aufgaben vorhanden.</p>`;
  }
  for (const task of tasks) {
    const kid = adminData.kids.find((k) => k.id === task.kidId);
    const cat = CATEGORIES[task.category] || CATEGORIES.haushalt;
    const item = document.createElement("div");
    item.className = "admin-item";
    item.innerHTML = `
      <div class="mini-avatar" style="background:${kid?.color || "#888"}">${kid?.emoji || "❓"}</div>
      <div class="grow">
        <div class="title">${cat.icon} ${escapeHtml(task.title)}</div>
        <div class="sub">${task.time ? task.time + " · " : ""}${describeRecurrence(task.recurrence)} · +${task.points} ⭐</div>
      </div>
      <span class="edit-hint">✏️</span>`;
    item.addEventListener("click", () => openTaskForm(task));
    list.appendChild(item);
  }
}

$("#addTask").addEventListener("click", () => openTaskForm(null));

function openTaskForm(task) {
  editingTaskId = task?.id || null;
  $("#taskFormTitle").textContent = task ? "Aufgabe bearbeiten" : "Aufgabe hinzufügen";
  $("#taskTitle").value = task?.title || "";
  $("#taskTime").value = task?.time || "";
  $("#taskPoints").value = task?.points ?? 10;
  $("#taskNote").value = task?.note || "";
  $("#taskError").hidden = true;
  $("#deleteTask").hidden = !task;

  // Kinder-Chips (bei Bearbeitung: Einzelauswahl fix, bei Neuanlage: Mehrfachauswahl)
  const kidRow = $("#taskKids");
  kidRow.innerHTML = "";
  for (const kid of adminData.kids) {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "chip";
    chip.dataset.kidId = kid.id;
    chip.textContent = `${kid.emoji} ${kid.name}`;
    const preselect = task ? kid.id === task.kidId
      : (taskFilterKid !== "all" ? kid.id === taskFilterKid : adminData.kids.length === 1);
    chip.classList.toggle("active", preselect);
    chip.addEventListener("click", () => {
      if (task) {
        kidRow.querySelectorAll(".chip").forEach((c) => c.classList.remove("active"));
        chip.classList.add("active");
      } else {
        chip.classList.toggle("active");
      }
    });
    kidRow.appendChild(chip);
  }

  // Kategorie-Chips
  const catRow = $("#taskCategory");
  catRow.innerHTML = "";
  const selectedCat = task?.category || "haushalt";
  for (const [key, cat] of Object.entries(CATEGORIES)) {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = `chip cat-${key}` + (key === selectedCat ? " active" : "");
    chip.dataset.category = key;
    chip.textContent = `${cat.icon} ${cat.label}`;
    chip.addEventListener("click", () => {
      catRow.querySelectorAll(".chip").forEach((c) => c.classList.remove("active"));
      chip.classList.add("active");
    });
    catRow.appendChild(chip);
  }

  // Wochentage
  const wdRow = $("#weekdayChips");
  wdRow.innerHTML = "";
  const rec = task?.recurrence || { type: "weekly", days: [0, 1, 2, 3, 4, 5, 6] };
  for (let i = 0; i < 7; i++) {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "chip" + (rec.type === "weekly" && rec.days.includes(i) ? " active" : "");
    chip.dataset.day = i;
    chip.textContent = WEEKDAYS[i];
    chip.addEventListener("click", () => {
      chip.classList.toggle("active");
      setOnceMode(false);
    });
    wdRow.appendChild(chip);
  }

  setOnceMode(rec.type === "once", rec.date);
  $("#taskDialog").showModal();
  setTimeout(() => $("#taskTitle").focus(), 50);
}

function setOnceMode(once, dateValue) {
  const onceInput = $("#onceDate");
  onceInput.hidden = !once;
  $("#weekdayChips").style.display = once ? "none" : "";
  document.querySelector('[data-preset="once"]').classList.toggle("active", once);
  if (once) onceInput.value = dateValue || currentDate;
}

document.querySelectorAll("#recPresets .chip").forEach((chip) => {
  chip.addEventListener("click", () => {
    const preset = chip.dataset.preset;
    if (preset === "once") return setOnceMode(true);
    setOnceMode(false);
    const days = preset === "daily" ? [0, 1, 2, 3, 4, 5, 6]
      : preset === "school" ? [0, 1, 2, 3, 4] : [5, 6];
    $("#weekdayChips").querySelectorAll(".chip").forEach((c) => {
      c.classList.toggle("active", days.includes(Number(c.dataset.day)));
    });
  });
});

document.querySelectorAll(".stepper-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    const input = $("#taskPoints");
    input.value = Math.max(0, Math.min(100, (Number(input.value) || 0) + Number(btn.dataset.step)));
  });
});

$("#taskForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const errEl = $("#taskError");
  errEl.hidden = true;

  const kidIds = [...document.querySelectorAll("#taskKids .chip.active")].map((c) => c.dataset.kidId);
  if (!kidIds.length) {
    errEl.textContent = "Bitte mindestens ein Kind auswählen.";
    errEl.hidden = false;
    return;
  }

  const once = !$("#onceDate").hidden;
  const recurrence = once
    ? { type: "once", date: $("#onceDate").value }
    : { type: "weekly", days: [...document.querySelectorAll("#weekdayChips .chip.active")].map((c) => Number(c.dataset.day)) };

  if (!once && !recurrence.days.length) {
    errEl.textContent = "Bitte mindestens einen Wochentag auswählen.";
    errEl.hidden = false;
    return;
  }
  if (once && !recurrence.date) {
    errEl.textContent = "Bitte ein Datum wählen.";
    errEl.hidden = false;
    return;
  }

  const payload = {
    title: $("#taskTitle").value.trim(),
    category: $("#taskCategory .chip.active")?.dataset.category || "haushalt",
    time: $("#taskTime").value || null,
    points: Number($("#taskPoints").value) || 0,
    note: $("#taskNote").value.trim(),
    recurrence,
  };

  try {
    if (editingTaskId) {
      payload.kidId = kidIds[0];
      await api(`api/tasks/${editingTaskId}`, { method: "PUT", body: JSON.stringify(payload) });
    } else {
      payload.kidIds = kidIds;
      await api("api/tasks", { method: "POST", body: JSON.stringify(payload) });
    }
    $("#taskDialog").close();
    adminData = await api("api/admin");
    renderTaskAdmin();
    renderKidList();
  } catch (err) {
    errEl.textContent = err.message;
    errEl.hidden = false;
  }
});

$("#deleteTask").addEventListener("click", async () => {
  if (!confirm("Diese Aufgabe wirklich löschen?")) return;
  await api(`api/tasks/${editingTaskId}`, { method: "DELETE" });
  $("#taskDialog").close();
  adminData = await api("api/admin");
  renderTaskAdmin();
  renderKidList();
});

// ===== PIN ändern =====

$("#changePin").addEventListener("click", () => {
  $("#newPin").value = "";
  $("#pinChangeError").hidden = true;
  $("#pinChangeDialog").showModal();
});

$("#pinChangeForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const pin = $("#newPin").value.trim();
  if (pin && !/^\d{4,8}$/.test(pin)) {
    $("#pinChangeError").textContent = "PIN muss 4–8 Ziffern haben.";
    $("#pinChangeError").hidden = false;
    return;
  }
  try {
    await api("api/pin/set", { method: "POST", body: JSON.stringify({ pin: pin || null }) });
    parentPin = pin || null;
    if (pin) sessionStorage.setItem("tt-pin", pin);
    else sessionStorage.removeItem("tt-pin");
    $("#pinChangeDialog").close();
    toast(pin ? "PIN gespeichert 🔒" : "PIN entfernt");
  } catch (err) {
    $("#pinChangeError").textContent = err.message;
    $("#pinChangeError").hidden = false;
  }
});

// ===== Konfetti-Einstellung =====

function confettiEnabled() {
  return localStorage.getItem("tt-confetti") !== "off";
}
$("#confettiToggle").checked = confettiEnabled();
$("#confettiToggle").addEventListener("change", (e) => {
  localStorage.setItem("tt-confetti", e.target.checked ? "on" : "off");
});

// ===== Display wach halten (Kiosk-Geräte wie Echo Show / Wandtablets) =====
//
// Zwei Mechanismen parallel:
// 1. Screen Wake Lock API – verhindert das Abschalten des Displays.
// 2. Stumme Audio-Schleife – hält auf Fire-OS-Geräten (Echo Show) die
//    "Medienwiedergabe aktiv"-Erkennung am Leben, ohne die der Silk-Browser
//    nach kurzer Zeit zum Alexa-Homescreen zurückwechselt.
// Die Einstellung gilt pro Gerät (localStorage).

const KEEP_AWAKE_KEY = "tt-keepawake";
let wakeLockSentinel = null;
let awakeAudio = null;

function keepAwakeEnabled() {
  return localStorage.getItem(KEEP_AWAKE_KEY) === "on";
}

function silentWavUri() {
  // 1 Sekunde 8-Bit-Mono-Stille (8 kHz), zur Laufzeit generiert
  const rate = 8000;
  const size = 44 + rate;
  const buf = new Uint8Array(size);
  const dv = new DataView(buf.buffer);
  const str = (o, s) => { for (let i = 0; i < s.length; i++) buf[o + i] = s.charCodeAt(i); };
  str(0, "RIFF"); dv.setUint32(4, size - 8, true); str(8, "WAVEfmt ");
  dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, 1, true);
  dv.setUint32(24, rate, true); dv.setUint32(28, rate, true);
  dv.setUint16(32, 1, true); dv.setUint16(34, 8, true);
  str(36, "data"); dv.setUint32(40, rate, true);
  buf.fill(128, 44); // 128 = Nulllinie bei 8-Bit-PCM
  let bin = "";
  buf.forEach((b) => { bin += String.fromCharCode(b); });
  return "data:audio/wav;base64," + btoa(bin);
}

async function acquireWakeLock() {
  if (!("wakeLock" in navigator)) return;
  try {
    wakeLockSentinel = await navigator.wakeLock.request("screen");
    wakeLockSentinel.addEventListener("release", () => {
      wakeLockSentinel = null;
      // Der Browser gibt den Lock z. B. beim Tab-Wechsel frei → neu anfordern
      if (keepAwakeEnabled() && document.visibilityState === "visible") {
        acquireWakeLock();
      }
    });
  } catch {
    // Wake Lock nicht verfügbar/erlaubt – Audio-Schleife bleibt als Fallback
  }
}

function startAwakeAudio() {
  if (!awakeAudio) {
    awakeAudio = new Audio(silentWavUri());
    awakeAudio.loop = true;
    awakeAudio.muted = true; // stumm → Autoplay ist erlaubt
    awakeAudio.setAttribute("playsinline", "");
  }
  awakeAudio.play().catch(() => {
    // Autoplay blockiert → beim ersten Antippen erneut starten
    document.addEventListener("pointerdown", () => {
      if (keepAwakeEnabled()) awakeAudio.play().catch(() => {});
    }, { once: true });
  });
}

function startKeepAwake() {
  acquireWakeLock();
  startAwakeAudio();
  $("#awakeBadge").hidden = false;
}

function stopKeepAwake() {
  if (wakeLockSentinel) {
    wakeLockSentinel.release().catch(() => {});
    wakeLockSentinel = null;
  }
  if (awakeAudio) awakeAudio.pause();
  $("#awakeBadge").hidden = true;
}

$("#keepAwakeToggle").checked = keepAwakeEnabled();
$("#keepAwakeToggle").addEventListener("change", (e) => {
  localStorage.setItem(KEEP_AWAKE_KEY, e.target.checked ? "on" : "off");
  if (e.target.checked) {
    startKeepAwake();
    toast("Display bleibt wach ☕");
  } else {
    stopKeepAwake();
  }
});

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && keepAwakeEnabled() && !wakeLockSentinel) {
    acquireWakeLock();
  }
});

if (keepAwakeEnabled()) startKeepAwake();

// ===== Konfetti =====

function fireConfetti() {
  const canvas = $("#confetti");
  const ctx = canvas.getContext("2d");
  canvas.width = innerWidth;
  canvas.height = innerHeight;
  const colors = ["#6366f1", "#ec4899", "#10b981", "#f59e0b", "#3b82f6", "#a855f7"];
  const pieces = Array.from({ length: 140 }, () => ({
    x: Math.random() * canvas.width,
    y: -20 - Math.random() * canvas.height * 0.4,
    w: 7 + Math.random() * 7,
    h: 10 + Math.random() * 8,
    vy: 2.2 + Math.random() * 3.2,
    vx: -1.6 + Math.random() * 3.2,
    rot: Math.random() * Math.PI,
    vr: -0.12 + Math.random() * 0.24,
    color: colors[(Math.random() * colors.length) | 0],
  }));
  const start = performance.now();
  (function frame(now) {
    const t = now - start;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (const p of pieces) {
      p.x += p.vx;
      p.y += p.vy;
      p.rot += p.vr;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.color;
      ctx.globalAlpha = Math.max(0, 1 - t / 3400);
      ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      ctx.restore();
    }
    if (t < 3500) requestAnimationFrame(frame);
    else ctx.clearRect(0, 0, canvas.width, canvas.height);
  })(start);
}

// ===== Auto-Refresh (Wandtablet: Daten & Tageswechsel aktuell halten) =====

setInterval(() => {
  if (document.visibilityState === "visible" && !document.querySelector("dialog[open]")) {
    loadView().catch(() => {});
  }
}, 60_000);

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") loadView().catch(() => {});
});

// ===== Start =====

$("#viewDayBtn").classList.toggle("active", viewMode === "day");
$("#viewWeekBtn").classList.toggle("active", viewMode === "week");
loadView().catch(() => toast("Server nicht erreichbar 😕"));
