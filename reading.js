// Reading timer + book log for Next Read.
// Everything is saved in this browser with localStorage, so there's no account or server.
// This file uses helpers from app.js (textEl, coverEl, authorText, findBooks, recommendFor, saveRecent).

const LOG_KEY = "nextread-log";       // { books: [...], sessions: [...] }
const TIMER_KEY = "nextread-timer";   // the timer that's running (survives a page reload)
const GOAL_KEY = "nextread-goal";     // daily goal in minutes
const CELEBRATED_KEY = "nextread-goal-celebrated"; // date we last celebrated hitting the goal
const GOAL_OPTIONS = [10, 15, 20, 30, 45, 60];
const DAY_MS = 24 * 60 * 60 * 1000;

// ======================================================================
// Saving and loading
// ======================================================================
function loadLog() {
  try {
    const data = JSON.parse(localStorage.getItem(LOG_KEY)) || {};
    return { books: data.books || [], sessions: data.sessions || [] };
  } catch {
    return { books: [], sessions: [] };
  }
}

function saveLog(log) {
  localStorage.setItem(LOG_KEY, JSON.stringify(log));
}

// Only keep the fields we need (the full Open Library record is large).
function bookSnapshot(book) {
  const { key, title, author_name, author_key, cover_i, subject, number_of_pages_median, first_publish_year } = book;
  return { key, title, author_name, author_key, cover_i, subject, number_of_pages_median, first_publish_year };
}

function findInLog(key) {
  return loadLog().books.find((b) => b.key === key);
}

const STATUS_LABEL = { want: "Want to read", reading: "Reading", finished: "Finished" };

// status: "want" (saved for later), "reading", or "finished".
function addToLog(book, status = "reading") {
  const log = loadLog();
  let entry = log.books.find((b) => b.key === book.key);
  if (!entry) {
    entry = { ...bookSnapshot(book), status, addedAt: Date.now(),
              finishedAt: status === "finished" ? Date.now() : null, rating: 0 };
    log.books.unshift(entry);
  } else if (status === "reading" && entry.status === "want") {
    entry.status = "reading";
  } else if (status === "finished" && entry.status !== "finished") {
    entry.status = "finished";
    entry.finishedAt = Date.now();
  }
  saveLog(log);
  // Finished books feed the "Picked for you" recommendations on the Discover page.
  if (status === "finished") saveRecent(bookSnapshot(book));
  refreshReadingViews();
  return entry;
}

function updateBook(key, changes) {
  const log = loadLog();
  const entry = log.books.find((b) => b.key === key);
  if (!entry) return;
  Object.assign(entry, changes);
  saveLog(log);
  refreshReadingViews();
}

function removeBook(key) {
  const log = loadLog();
  log.books = log.books.filter((b) => b.key !== key);
  saveLog(log); // reading sessions are kept, so your total minutes don't go down
  timer = loadTimer();
  if (timer.bookKey === key) { timer.bookKey = ""; saveTimer(); }
  refreshReadingViews();
}

// ======================================================================
// Time helpers
// ======================================================================
function startOfDay(t = Date.now()) {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function formatClock(totalSeconds) {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = Math.floor(totalSeconds % 60);
  const pad = (n) => String(n).padStart(2, "0");
  return h ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

// Short form for the big sticky-note numbers: "11h 47m" fits on one line, "11 hr 47 min" doesn't.
function formatShort(seconds) {
  const mins = Math.round(seconds / 60);
  if (mins < 60) return formatMinutes(seconds);
  const h = Math.floor(mins / 60);
  return mins % 60 ? `${h}h ${mins % 60}m` : `${h}h`;
}

function formatMinutes(seconds) {
  if (seconds > 0 && seconds < 60) return "under 1 min";
  const mins = Math.round(seconds / 60);
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  return mins % 60 ? `${h} hr ${mins % 60} min` : `${h} hr`;
}

function formatWhen(t) {
  const time = new Date(t).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  const daysAgo = Math.round((startOfDay() - startOfDay(t)) / DAY_MS);
  if (daysAgo === 0) return `Today, ${time}`;
  if (daysAgo === 1) return `Yesterday, ${time}`;
  return new Date(t).toLocaleDateString([], { month: "short", day: "numeric" }) + `, ${time}`;
}

function formatDate(t) {
  return new Date(t).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" });
}

// ======================================================================
// Stats
// ======================================================================
function secondsSince(sessions, since) {
  return sessions.filter((s) => s.start >= since).reduce((sum, s) => sum + s.seconds, 0);
}

function secondsForBook(sessions, key) {
  const mine = sessions.filter((s) => s.bookKey === key);
  return { seconds: mine.reduce((sum, s) => sum + s.seconds, 0), count: mine.length };
}

// Days in a row with at least one reading session (today counts if you've read; if not, the
// streak from yesterday still holds until the day is over).
function readingStreak(sessions) {
  const days = new Set(sessions.map((s) => startOfDay(s.start)));
  let day = startOfDay();
  if (!days.has(day)) day -= DAY_MS;
  let streak = 0;
  while (days.has(day)) {
    streak++;
    day = startOfDay(day - DAY_MS / 2); // step back one day (safe across daylight-saving changes)
  }
  return streak;
}

function statCard(value, label, icon) {
  const card = document.createElement("div");
  card.className = "stat";
  const valueEl = textEl("div", "stat-value", String(value));
  if (icon) valueEl.append(iconEl(icon, "stat-icon"));
  card.append(valueEl, textEl("div", "stat-label", label));
  return card;
}

// ======================================================================
// Reading timer
// ======================================================================
// The timer stores when it was started rather than counting ticks, so it stays correct
// even if the tab is in the background or the page is reloaded.
// Each start-to-pause stretch is kept as a "run" [start, end], so finished reading
// is counted on the day it really happened, even if you press Finish the next morning.
const MAX_RUN_MS = 2 * 60 * 60 * 1000; // the timer pauses itself after 2 hours (forgotten timers)
let timer = loadTimer();
let tickHandle = null;

function loadTimer() {
  const empty = { bookKey: "", startedAt: null, runs: [] };
  try {
    const saved = { ...empty, ...JSON.parse(localStorage.getItem(TIMER_KEY)) };
    if (!Array.isArray(saved.runs)) saved.runs = [];
    // Older versions only stored the total paused time; treat it as reading that just ended.
    if (saved.elapsed > 0 && saved.runs.length === 0) saved.runs = [[Date.now() - saved.elapsed, Date.now()]];
    delete saved.elapsed;
    return saved;
  } catch {
    return empty;
  }
}

// A timer left running for hours (say, overnight) was almost certainly forgotten.
// Stop it at 2 hours so it can't log a whole night of "reading".
function stopForgottenTimer() {
  if (!timer.startedAt || Date.now() - timer.startedAt <= MAX_RUN_MS) return false;
  timer.runs.push([timer.startedAt, timer.startedAt + MAX_RUN_MS]);
  timer.startedAt = null;
  saveTimer();
  showToast("The timer paused itself after 2 hours. Still reading? Press Resume.");
  return true;
}

// Split reading runs at midnight and add them up per day.
// Returns [{ start, seconds }] with one entry per day, oldest first.
function runsByDay(runs) {
  const days = new Map();
  for (let [start, end] of runs) {
    while (start < end) {
      const dayStart = startOfDay(start);
      const nextDay = new Date(dayStart); nextDay.setDate(nextDay.getDate() + 1);
      const pieceEnd = Math.min(end, nextDay.getTime());
      const day = days.get(dayStart) || { start, ms: 0 };
      day.start = Math.min(day.start, start);
      day.ms += pieceEnd - start;
      days.set(dayStart, day);
      start = pieceEnd;
    }
  }
  return [...days.entries()].sort((a, b) => a[0] - b[0])
    .map(([, d]) => ({ start: d.start, seconds: Math.round(d.ms / 1000) }))
    .filter((d) => d.seconds >= 1);
}

function saveTimer() {
  localStorage.setItem(TIMER_KEY, JSON.stringify(timer));
}

function goalMinutes() {
  return Number(localStorage.getItem(GOAL_KEY)) || 20;
}

function timerSeconds() {
  const running = timer.startedAt ? Date.now() - timer.startedAt : 0;
  return (timer.runs.reduce((sum, [a, b]) => sum + (b - a), 0) + running) / 1000;
}

function startOrPause() {
  timer = loadTimer(); // another tab may have changed the timer
  if (stopForgottenTimer()) return renderTimer();
  if (timer.startedAt) {
    timer.runs.push([timer.startedAt, Date.now()]); // pause
    timer.startedAt = null;
  } else {
    timer.startedAt = Date.now(); // start / resume
  }
  saveTimer();
  renderTimer();
}

function finishSession() {
  timer = loadTimer(); // if another tab already saved this session, there's nothing left to save
  stopForgottenTimer();
  const runs = timer.startedAt ? [...timer.runs, [timer.startedAt, Date.now()]] : timer.runs;
  const days = runsByDay(runs);
  const seconds = days.reduce((sum, d) => sum + d.seconds, 0);
  if (seconds < 1) { renderTimer(); return; }
  const log = loadLog();
  for (const day of days) { // oldest first, so the newest ends up at the top of the list
    log.sessions.unshift({
      bookKey: timer.bookKey || null,
      title: findInLog(timer.bookKey)?.title || null, // kept so the session still makes sense if the book is removed
      start: day.start,
      seconds: day.seconds,
    });
  }
  saveLog(log);
  timer = { bookKey: timer.bookKey, startedAt: null, runs: [] };
  saveTimer();
  refreshReadingViews();
  // Feed the reading pet and show the prize screen (pet.js)
  if (!(typeof petReward === "function" && petReward(seconds))) {
    showToast(`Saved ${formatMinutes(seconds)} of reading. Nice work!`);
  }
}

function resetTimer() {
  if (timerSeconds() > 60 && !confirm("Throw away this reading session without saving it?")) return;
  timer = { bookKey: timer.bookKey, startedAt: null, runs: [] };
  saveTimer();
  renderTimer();
}

const RING_LENGTH = 2 * Math.PI * 96; // circumference of the progress circle (r = 96)

function renderTimer() {
  stopForgottenTimer();
  const seconds = timerSeconds();
  const running = Boolean(timer.startedAt);
  const goalSeconds = goalMinutes() * 60;
  const todaySeconds = secondsSince(loadLog().sessions, startOfDay()) + seconds;

  $("timer-clock").textContent = formatClock(seconds);
  const left = Math.max(0, goalSeconds - todaySeconds);
  $("timer-goal-text").textContent = left > 0
    ? `${Math.ceil(left / 60)} min to today's goal`
    : "Goal reached today! 🎉";

  const progress = Math.min(1, todaySeconds / goalSeconds);
  const ring = $("ring-progress");
  ring.style.strokeDasharray = RING_LENGTH;
  ring.style.strokeDashoffset = RING_LENGTH * (1 - progress);
  ring.classList.toggle("done", progress >= 1);

  const startBtn = $("timer-start");
  startBtn.textContent = running ? "Pause" : seconds > 0 ? "Resume" : "Start";
  startBtn.classList.toggle("running", running);
  $("timer-finish").disabled = seconds < 1;
  $("timer-reset").disabled = seconds < 1;
  $("timer-book").disabled = running;
  $("nav-timer-dot").hidden = !running;
  document.querySelector(".timer-ring").classList.toggle("running", running);
  document.title = running ? `⏱ ${formatClock(seconds)} · Next Read` : "Next Read: book recommendations";

  // Celebrate once a day when the goal is reached.
  const today = new Date().toDateString();
  if (progress >= 1 && running && localStorage.getItem(CELEBRATED_KEY) !== today) {
    localStorage.setItem(CELEBRATED_KEY, today);
    chime();
    showToast(`🎉 You reached your ${goalMinutes()}-minute goal today!`);
  }

  if (running && !tickHandle) tickHandle = setInterval(renderTimer, 250);
  if (!running && tickHandle) { clearInterval(tickHandle); tickHandle = null; }
}

function renderTimerBookPicker() {
  const select = $("timer-book");
  const books = loadLog().books;
  const reading = books.filter((b) => b.status === "reading");
  const finished = books.filter((b) => b.status === "finished");

  const option = (value, label) => { const o = document.createElement("option"); o.value = value; o.textContent = label; return o; };
  const group = (label, list) => {
    const g = document.createElement("optgroup");
    g.label = label;
    g.append(...list.map((b) => option(b.key, b.title)));
    return g;
  };

  select.replaceChildren(option("", books.length ? "Choose a book (optional)" : "No books yet (add some in My books)"));
  if (reading.length) select.append(group("Reading now", reading));
  if (finished.length) select.append(group("Finished", finished));
  if (!books.some((b) => b.key === timer.bookKey)) timer.bookKey = "";
  select.value = timer.bookKey;
}

function renderGoalChips() {
  $("goal-chips").replaceChildren(...GOAL_OPTIONS.map((mins) => {
    const chip = textEl("button", "chip", `${mins} min`);
    chip.type = "button";
    chip.setAttribute("aria-pressed", mins === goalMinutes());
    chip.addEventListener("click", () => {
      localStorage.setItem(GOAL_KEY, mins);
      renderGoalChips();
      renderTimer();
      renderTimerStats();
      renderCalendar();
    });
    return chip;
  }));
}

function renderTimerStats() {
  const { sessions } = loadLog();
  const weekAgo = startOfDay() - 6 * DAY_MS;
  $("timer-stats").replaceChildren(
    statCard(formatMinutes(secondsSince(sessions, startOfDay())), "Read today"),
    statCard(formatMinutes(secondsSince(sessions, weekAgo)), "Last 7 days"),
    statCard(readingStreak(sessions), "Day streak", "flame"),
  );

  const list = $("session-list");
  const recent = sessions.slice(0, 8);
  if (recent.length === 0) {
    const li = document.createElement("li");
    li.className = "empty";
    li.append(emptyShelf("No sessions yet. Press Start and read for a bit!"));
    list.replaceChildren(li);
    return;
  }
  const books = loadLog().books;
  list.replaceChildren(...recent.map((s) => {
    const li = document.createElement("li");
    const title = books.find((b) => b.key === s.bookKey)?.title || s.title || "Free reading";
    const del = textEl("button", "session-delete", "✕");
    del.type = "button";
    del.title = "Delete this session";
    del.setAttribute("aria-label", `Delete ${formatMinutes(s.seconds)} of ${title}, ${formatWhen(s.start)}`);
    del.addEventListener("click", () => deleteSession(s));
    li.append(textEl("span", "session-title", title), textEl("span", "session-when", formatWhen(s.start)),
              textEl("span", "session-time", formatMinutes(s.seconds)), del);
    return li;
  }));
}

// A short two-note "ding" using the browser's built-in sound generator (no audio file needed).
function chime() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    [880, 1318.5].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = freq;
      osc.type = "sine";
      const t = ctx.currentTime + i * 0.18;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.25, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.9);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 1);
    });
  } catch { /* sound isn't essential */ }
}

// Remove a session saved by mistake (e.g. a timer that was left running).
function deleteSession(session) {
  const treats = Math.floor(session.seconds / 60);
  const note = treats > 0 ? ` Your pet loses ${treats} treat${treats === 1 ? "" : "s"}.` : "";
  if (!confirm(`Delete ${formatMinutes(session.seconds)} of reading from ${formatWhen(session.start)}?${note}`)) return;
  const log = loadLog();
  const i = log.sessions.findIndex((s) => s.start === session.start && s.seconds === session.seconds && s.bookKey === session.bookKey);
  if (i === -1) return;
  log.sessions.splice(i, 1);
  saveLog(log);
  refreshReadingViews();
  if (typeof renderPet === "function") renderPet();
  showToast("Session deleted");
}

// Add reading time without the timer (e.g. "I read 15 minutes at bedtime").
function addManualTime(minutes) {
  const seconds = Math.round(minutes * 60);
  const log = loadLog();
  log.sessions.unshift({
    bookKey: timer.bookKey || null,
    title: findInLog(timer.bookKey)?.title || null,
    start: Math.max(startOfDay(), Date.now() - seconds * 1000), // counts for today
    seconds,
    manual: true,
  });
  saveLog(log);
  refreshReadingViews();
  if (!(typeof petReward === "function" && petReward(seconds))) {
    showToast(`Added ${formatMinutes(seconds)} of reading`);
  }
}

// ======================================================================
// Reading calendar (like a chart of colored squares, one per day)
// ======================================================================
const CALENDAR_WEEKS = 16;

function renderCalendar() {
  const { sessions } = loadLog();
  const perDay = {};
  for (const s of sessions) perDay[startOfDay(s.start)] = (perDay[startOfDay(s.start)] || 0) + s.seconds;
  const goal = goalMinutes() * 60;
  const level = (sec) => !sec ? 0 : sec < goal * 0.34 ? 1 : sec < goal * 0.67 ? 2 : sec < goal ? 3 : 4;

  // Start on the Sunday CALENDAR_WEEKS - 1 weeks ago, end today.
  const day = new Date(startOfDay());
  day.setDate(day.getDate() - day.getDay() - (CALENDAR_WEEKS - 1) * 7);
  const today = startOfDay();

  const grid = $("calendar");
  const cells = [];
  const months = [];
  let col = 0;
  let readDays = 0;
  while (day.getTime() <= today) {
    if (day.getDay() === 0 && day.getDate() <= 7) {
      months.push([col, day.toLocaleDateString([], { month: "short" })]); // label the first week of each month
    }
    const t = day.getTime();
    const sec = perDay[t] || 0;
    if (sec) readDays++;
    const cell = document.createElement("i");
    cell.className = `lv${level(sec)}${t === today ? " today" : ""}`;
    cell.style.gridColumn = col + 2; // column 1 holds the weekday labels
    cell.style.gridRow = day.getDay() + 2; // row 1 holds the month labels
    cell.title = `${day.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" })}: ${sec ? formatMinutes(sec) : "no reading"}`;
    cells.push(cell);
    if (day.getDay() === 6) col++;
    day.setDate(day.getDate() + 1);
  }

  const labels = [];
  for (const [c, name] of months) {
    const m = textEl("span", "cal-month", name);
    m.style.gridColumn = `${c + 2} / span 3`;
    m.style.gridRow = 1;
    labels.push(m);
  }
  for (const [row, name] of [[1, "Mon"], [3, "Wed"], [5, "Fri"]]) {
    const d = textEl("span", "cal-day", name);
    d.style.gridRow = row + 2;
    d.style.gridColumn = 1;
    labels.push(d);
  }
  grid.replaceChildren(...labels, ...cells);
  grid.setAttribute("aria-label", `Reading calendar: you read on ${readDays} of the last ${CALENDAR_WEEKS} weeks' days`);
}

// ======================================================================
// Badges
// ======================================================================
const BADGES_KEY = "nextread-badges";

function bestStreak(sessions) {
  const days = [...new Set(sessions.map((s) => startOfDay(s.start)))].sort((a, b) => a - b);
  let best = 0, run = 0, prev = null;
  for (const d of days) {
    run = prev !== null && startOfDay(prev + DAY_MS * 1.5) === d ? run + 1 : 1;
    best = Math.max(best, run);
    prev = d;
  }
  return best;
}

function badgeFacts() {
  const { books, sessions } = loadLog();
  const perDay = {};
  for (const s of sessions) perDay[startOfDay(s.start)] = (perDay[startOfDay(s.start)] || 0) + s.seconds;
  return {
    finished: books.filter((b) => b.status === "finished").length,
    rated: books.filter((b) => b.rating > 0).length,
    sessions: sessions.length,
    seconds: sessions.reduce((sum, s) => sum + s.seconds, 0),
    streak: bestStreak(sessions),
    goalDays: Object.values(perDay).filter((sec) => sec >= goalMinutes() * 60).length,
  };
}

// Line icons for badges and stats (24x24, drawn with strokes so they match the site's search icon).
const ICONS = {
  stopwatch: '<circle cx="12" cy="13.5" r="7.5"/><path d="M12 13.5V9.5M10 2.5h4M12 2.5V6M18.5 6.5l1.5-1.5"/>',
  book: '<path d="M12 6.5C10 5 7 4.5 3.5 5v13c3.5-.5 6.5 0 8.5 1.5 2-1.5 5-2 8.5-1.5V5C17 4.5 14 5 12 6.5zM12 6.5v13"/>',
  target: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.5"/><path d="M12 12l7-7M16.5 3.5 19 5l1.5 2.5"/>',
  flame: '<path d="M12 21.5c-3.9 0-6.5-2.7-6.5-6.3 0-3.5 2.6-5.6 3.8-8.7.5 1.8 1.4 3 2.6 3.6C12 6.8 13.3 4 15.8 2.5c-.4 3.1 2.7 6.3 2.7 11 0 4.7-2.6 8-6.5 8z"/><path d="M12 21.5c-1.7 0-2.8-1.2-2.8-2.9 0-1.9 1.6-2.8 2.4-4.4.6 1.1 3.2 2.3 3.2 4.6 0 1.6-1.1 2.7-2.8 2.7z"/>',
  hourglass: '<path d="M6 2.5h12M6 21.5h12M7.5 2.5c0 5 9 6.5 9 9.5s-9 4.5-9 9.5M16.5 2.5c0 5-9 6.5-9 9.5s9 4.5 9 9.5"/><path d="M9.5 18.5h5"/>',
  books: '<rect x="3" y="4" width="4" height="16" rx="1"/><rect x="7" y="7" width="4" height="13" rx="1"/><path d="m12.5 7.5 3.8-1 3.4 13-3.8 1z"/><path d="M3 8h4M7 10.5h4"/>',
  star: '<path d="m12 3 2.7 5.6 6.1.8-4.5 4.3 1.1 6.1L12 16.9l-5.4 2.9 1.1-6.1-4.5-4.3 6.1-.8z"/>',
  calendar: '<rect x="3.5" y="5" width="17" height="15.5" rx="2"/><path d="M3.5 9.5h17M8 3v4M16 3v4"/><path d="m9 14.5 2 2 4-4"/>',
  trophy: '<path d="M7.5 3.5h9v6a4.5 4.5 0 0 1-9 0z"/><path d="M7.5 5.5h-3c0 3 1.3 4.5 3.3 4.7M16.5 5.5h3c0 3-1.3 4.5-3.3 4.7M12 14v3.5M8.5 21h7M9.5 17.5h5V21h-5z"/>',
  sparkle: '<path d="M12 3c.6 4.4 2.6 6.4 7 7-4.4.6-6.4 2.6-7 7-.6-4.4-2.6-6.4-7-7 4.4-.6 6.4-2.6 7-7z"/><path d="M19 15.5c.2 1.6.9 2.3 2.5 2.5-1.6.2-2.3.9-2.5 2.5-.2-1.6-.9-2.3-2.5-2.5 1.6-.2 2.3-.9 2.5-2.5z"/>',
  medal: '<path d="M8 2.5 10.5 9M16 2.5 13.5 9"/><circle cx="12" cy="15" r="6"/><path d="m12 12 1 2 2.1.3-1.5 1.5.4 2.1L12 17l-2 .9.4-2.1-1.5-1.5L11 14z"/>',
  mountain: '<path d="M2.5 20.5 9 9l3.5 6 2.5-4 6.5 9.5z"/><path d="M9 9V3.5l4 1.5-4 1.5"/>',
  crown: '<path d="M3.5 8 7.5 12 12 5l4.5 7 4-4-1.5 10.5h-14z"/><path d="M5 21h14"/>',
  rocket: '<path d="M14 4.5c3-1.8 5.5-2 6-1.5s.3 3-1.5 6l-6.5 6.5-4.5-4.5z"/><path d="M7.5 11l-3-.5 3-3.5h4M13 16.5l.5 3 3.5-3v-4"/><circle cx="15.5" cy="8.5" r="1.5"/><path d="M6.5 15.5c-1.5.5-2.5 2-2.5 4.5 2.5 0 4-1 4.5-2.5"/>',
  lock: '<rect x="5.5" y="10.5" width="13" height="10" rx="2"/><path d="M8.5 10.5V7.5a3.5 3.5 0 0 1 7 0v3"/>',
  download: '<path d="M12 3.5v12M7 11l5 5 5-5M4.5 20.5h15"/>',
  upload: '<path d="M12 16V4M7 8.5l5-5 5 5M4.5 20.5h15"/>',
};

function iconEl(name, cls = "icon") {
  const span = document.createElement("span");
  span.className = cls;
  span.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[name]}</svg>`; // fixed markup from ICONS
  return span;
}

// Each badge: [id, icon, name, how to earn it, test, tier]. Tier sets the medal color.
const BADGES = [
  ["first-session", "stopwatch", "First minutes", "Save your first reading session", (f) => f.sessions >= 1, "bronze"],
  ["first-book", "book", "First book", "Finish a book", (f) => f.finished >= 1, "bronze"],
  ["goal", "target", "Goal getter", "Reach your daily goal", (f) => f.goalDays >= 1, "bronze"],
  ["streak-3", "flame", "On fire", "Read 3 days in a row", (f) => f.streak >= 3, "bronze"],
  ["hour", "hourglass", "One hour", "Read for 1 hour in total", (f) => f.seconds >= 3600, "bronze"],
  ["five-books", "books", "Bookworm", "Finish 5 books", (f) => f.finished >= 5, "silver"],
  ["critic", "star", "Book critic", "Rate 3 books", (f) => f.rated >= 3, "silver"],
  ["streak-7", "calendar", "Week warrior", "Read 7 days in a row", (f) => f.streak >= 7, "silver"],
  ["ten-books", "trophy", "Super reader", "Finish 10 books", (f) => f.finished >= 10, "silver"],
  ["five-hours", "sparkle", "Five hours", "Read for 5 hours in total", (f) => f.seconds >= 5 * 3600, "silver"],
  ["goal-10", "medal", "Goal champion", "Reach your goal on 10 days", (f) => f.goalDays >= 10, "gold"],
  ["streak-30", "mountain", "Unstoppable", "Read 30 days in a row", (f) => f.streak >= 30, "gold"],
  ["25-books", "crown", "Reading royalty", "Finish 25 books", (f) => f.finished >= 25, "gold"],
  ["20-hours", "rocket", "Twenty hours", "Read for 20 hours in total", (f) => f.seconds >= 20 * 3600, "gold"],
];

function renderBadges() {
  const facts = badgeFacts();
  const earned = BADGES.filter(([, , , , test]) => test(facts)).map(([id]) => id);
  $("badge-count").textContent = `${earned.length} of ${BADGES.length}`;
  $("badges").replaceChildren(...BADGES.map(([id, icon, name, how, , tier]) => {
    const has = earned.includes(id);
    const b = document.createElement("div");
    b.className = `badge tier-${tier}${has ? " earned" : ""}`;
    b.title = has ? `${name}: ${how} ✓` : `Locked: ${how}`;
    const medal = iconEl(icon, "badge-icon");
    if (!has) medal.append(iconEl("lock", "badge-lock"));
    b.append(medal, textEl("div", "badge-name", name), textEl("div", "badge-how", how));
    return b;
  }));

  // Celebrate badges earned since last time (but not all at once on the very first visit).
  let seen = null;
  try { seen = JSON.parse(localStorage.getItem(BADGES_KEY) || "null"); } catch { /* treat as a first visit */ }
  if (!Array.isArray(seen)) seen = null;
  if (seen) {
    const fresh = BADGES.filter(([id]) => earned.includes(id) && !seen.includes(id));
    if (fresh.length) {
      const [, , name] = fresh[fresh.length - 1];
      setTimeout(() => showToast(`New badge: ${name}!`), 900); // after any other message
      chime();
    }
  }
  localStorage.setItem(BADGES_KEY, JSON.stringify(earned));
}

// ======================================================================
// Backup and restore
// ======================================================================
// Other things saved in this browser that a backup should bring back too
const BACKUP_EXTRA_KEYS = {
  pet: "nextread-pet",                 // pet's name and kind
  readerAge: "nextread-reader-age",    // age picked in "Surprise me"
  method: "nextread-method",           // tags or AI
  blindTest: "nextread-blindtest",     // blind test votes (testing evidence!)
  safetyCheck: "nextread-safetycheck", // last safety check results
};

function backupExtras() {
  const extras = {};
  for (const [name, key] of Object.entries(BACKUP_EXTRA_KEYS)) {
    const raw = localStorage.getItem(key);
    if (raw === null) continue;
    try { extras[name] = JSON.parse(raw); } catch { extras[name] = raw; } // some are plain text
  }
  return extras;
}

function restoreExtras(extras) {
  if (!extras || typeof extras !== "object") return;
  for (const [name, key] of Object.entries(BACKUP_EXTRA_KEYS)) {
    if (!(name in extras)) continue;
    const value = extras[name];
    localStorage.setItem(key, typeof value === "string" ? value : JSON.stringify(value));
  }
}

function exportBackup() {
  const data = {
    app: "next-read",
    version: 1,
    exportedAt: new Date().toISOString(),
    log: loadLog(),
    recent: loadRecent(),
    goal: goalMinutes(),
    extras: backupExtras(),
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `next-read-backup-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  showToast("Backup downloaded");
}

async function importBackup(file) {
  try {
    const data = JSON.parse(await file.text());
    if (data.app !== "next-read" || !Array.isArray(data.log?.books) || !Array.isArray(data.log?.sessions)) {
      throw new Error("not a Next Read backup");
    }
    // Keep only entries that make sense, so a damaged file can't break the pages
    const books = data.log.books
      .filter((b) => b && typeof b.key === "string" && typeof b.title === "string")
      .map((b) => ({ ...b, status: b.status in STATUS_LABEL ? b.status : "reading", rating: Number(b.rating) || 0 }));
    const sessions = data.log.sessions.filter((x) => x && Number.isFinite(x.start) && Number.isFinite(x.seconds) && x.seconds > 0);
    const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;
    if (!confirm(`Restore ${plural(books.length, "book")} and ${plural(sessions.length, "reading session")}? This replaces what's in My books now.`)) return;
    saveLog({ books, sessions });
    restoreExtras(data.extras);
    if (Array.isArray(data.recent)) localStorage.setItem(RECENT_KEY, JSON.stringify(data.recent));
    if (GOAL_OPTIONS.includes(data.goal)) localStorage.setItem(GOAL_KEY, data.goal);
    localStorage.removeItem(BADGES_KEY); // don't fire a pile of "new badge" messages
    renderGoalChips();
    renderRecent();
    refreshReadingViews();
    showToast("Backup restored");
  } catch (err) {
    showToast(`Couldn't restore that file (${err.message})`);
  }
}

// ======================================================================
// Book log
// ======================================================================
let logFilter = "reading";

// A bookworm peeking out of a book, for empty lists.
const BOOKWORM_ART = `
  <svg class="art" viewBox="0 0 160 110" aria-hidden="true">
    <g class="worm">
      <path class="ink fill-green" d="M74 70c-2-18 0-34 10-42 9-7 22-3 24 8 2 9-6 14-12 12" />
      <circle class="ink fill-green" cx="96" cy="30" r="13" />
      <circle cx="92" cy="27" r="2.2" fill="currentColor" />
      <circle cx="101" cy="27" r="2.2" fill="currentColor" />
      <path class="ink thin" d="M91 35c3 3 7 3 10 0" />
      <path class="ink thin" d="M90 18c-2-6-6-8-9-7M101 17c1-6 5-9 8-8" />
    </g>
    <path class="ink fill-accent" d="M14 92c22-6 44-5 66 4 22-9 44-10 66-4v8c-22-6-44-5-66 4-22-9-44-10-66-4z" />
    <path class="ink fill-card" d="M80 70c-20-10-44-12-64-6v30c20-6 44-4 64 6z" />
    <path class="ink fill-card" d="M80 70c20-10 44-12 64-6v30c-20-6-44-4-64 6z" />
    <path class="ink thin" d="M28 74c14-3 30-2 42 2M28 84c14-3 30-2 42 2M92 76c12-4 28-5 42-2M92 86c12-4 28-5 42-2" />
  </svg>`;

function emptyShelf(message) {
  const box = document.createElement("div");
  box.className = "empty-art";
  box.innerHTML = BOOKWORM_ART; // fixed drawing, no user data
  box.append(textEl("p", "empty", message));
  return box;
}

function renderLogStats() {
  const { books, sessions } = loadLog();
  const total = sessions.reduce((sum, s) => sum + s.seconds, 0);
  $("log-stats").replaceChildren(
    statCard(String(books.filter((b) => b.status === "finished").length), "Books finished"),
    statCard(String(books.filter((b) => b.status === "reading").length), "Reading now"),
    statCard(String(books.filter((b) => b.status === "want").length), "Want to read"),
    statCard(formatShort(total), "Total reading time"),
    statCard(readingStreak(sessions), "Day streak", "flame"),
  );
}

function starRating(entry) {
  const box = document.createElement("div");
  box.className = "stars";
  box.setAttribute("role", "radiogroup");
  box.setAttribute("aria-label", `Rate ${entry.title}`);
  for (let n = 1; n <= 5; n++) {
    const star = textEl("button", n <= entry.rating ? "star on" : "star", "★");
    star.type = "button";
    star.setAttribute("aria-label", `${n} star${n > 1 ? "s" : ""}`);
    // Clicking the current rating again clears it.
    star.addEventListener("click", () => updateBook(entry.key, { rating: entry.rating === n ? 0 : n }));
    box.append(star);
  }
  return box;
}

function actionButton(label, onClick, className = "pill-button") {
  const btn = textEl("button", className, label);
  btn.type = "button";
  btn.addEventListener("click", onClick);
  return btn;
}

function logItem(entry, sessions, index) {
  const item = document.createElement("article");
  item.className = "log-item";
  item.style.setProperty("--i", index);

  const { seconds, count } = secondsForBook(sessions, entry.key);
  const statusText = {
    finished: `Finished ${formatDate(entry.finishedAt)}`,
    reading: `Reading · added ${formatDate(entry.addedAt)}`,
    want: `Want to read · saved ${formatDate(entry.addedAt)}`,
  }[entry.status];
  const timeText = count ? `${formatMinutes(seconds)} over ${count} session${count > 1 ? "s" : ""}` : "No reading time yet";

  const info = document.createElement("div");
  info.className = "log-info";
  info.append(
    textEl("div", "title", entry.title),
    metaEl(entry),
    textEl("div", `log-status ${entry.status}`, statusText),
    textEl("div", "log-time", timeText),
    starRating(entry),
  );

  const actions = document.createElement("div");
  actions.className = "log-actions";
  if (entry.status === "want") {
    actions.append(actionButton("▶ Start reading", () => {
      updateBook(entry.key, { status: "reading", addedAt: Date.now() });
      showToast(`Happy reading! "${entry.title}" moved to Reading now`);
    }));
  } else {
    actions.append(actionButton("⏱ Start timer", () => {
      timer = loadTimer();
      // Don't move minutes already on the clock over to a different book.
      if (timerSeconds() >= 1 && timer.bookKey !== entry.key) {
        const other = findInLog(timer.bookKey)?.title || "free reading";
        showToast(`The timer already has time for ${other}. Finish or reset it first.`);
      } else {
        timer.bookKey = entry.key;
        saveTimer();
      }
      location.hash = "timer";
    }));
  }
  if (entry.status === "reading") {
    actions.append(actionButton("✓ Mark finished", () => {
      updateBook(entry.key, { status: "finished", finishedAt: Date.now() });
      saveRecent(bookSnapshot(entry));
      showToast(`🎉 You finished ${entry.title}!`);
    }));
  } else if (entry.status === "finished") {
    actions.append(actionButton("Read again", () => updateBook(entry.key, { status: "reading", finishedAt: null })));
  }
  actions.append(
    actionButton("Find similar", () => { location.hash = "discover"; recommendFor(entry); }),
    actionButton("Remove", () => {
      if (confirm(`Remove "${entry.title}" from your books?`)) removeBook(entry.key);
    }, "text-button"),
  );
  info.append(actions);

  item.append(coverEl(entry), info);
  return item;
}

function renderLog() {
  const { books, sessions } = loadLog();
  for (const tab of document.querySelectorAll(".log-tabs .chip")) {
    tab.setAttribute("aria-pressed", tab.dataset.filter === logFilter);
  }
  const shown = logFilter === "all" ? books : books.filter((b) => b.status === logFilter);
  // Finished books: most recently finished first.
  if (logFilter === "finished") shown.sort((a, b) => b.finishedAt - a.finishedAt);

  if (shown.length === 0) {
    const msg = {
      reading: "You're not reading anything yet. Search above to add a book.",
      finished: "No finished books yet. Mark a book as finished when you're done!",
      want: "Nothing saved yet. Tap the bookmark on any recommended book to save it here.",
      all: "Your shelf is empty. Search above to add your first book.",
    }[logFilter];
    $("log-list").replaceChildren(emptyShelf(msg));
    return;
  }
  $("log-list").replaceChildren(...shown.map((b, i) => logItem(b, sessions, i)));
}

// Search to add a book
let addSearchRequest = 0;
async function searchToAdd(text) {
  const results = $("log-search-results");
  const req = ++addSearchRequest; // a slower, older search mustn't replace a newer one
  $("log-status").textContent = "Searching…";
  results.replaceChildren();
  try {
    const books = await findBooks(text);
    if (req !== addSearchRequest) return;
    $("log-status").textContent = books.length ? "" : "No books found. Try the author's name too.";
    results.replaceChildren(...books.slice(0, 6).map((book) => {
      const row = document.createElement("div");
      row.className = "add-row";
      const info = document.createElement("div");
      info.className = "add-info";
      info.append(textEl("div", "title", book.title), metaEl(book));
      const buttons = document.createElement("div");
      buttons.className = "add-buttons";
      const inLog = findInLog(book.key);
      if (inLog) {
        buttons.append(textEl("span", "in-log", `✓ ${STATUS_LABEL[inLog.status]}`));
      } else {
        buttons.append(
          actionButton("Reading now", () => addFromSearch(book, "reading")),
          actionButton("Already read", () => addFromSearch(book, "finished")),
          actionButton("Want to read", () => addFromSearch(book, "want")),
        );
      }
      row.append(coverEl(book, "S"), info, buttons);
      return row;
    }));
  } catch (err) {
    if (req !== addSearchRequest) return;
    $("log-status").textContent = `Couldn't reach Open Library (${err.message}).`;
  }
}

async function addFromSearch(book, status) {
  // Fill in missing subjects so "Find similar" works well later.
  try { book = await withSubjects(book); } catch { /* fine without */ }
  addToLog(book, status);
  logFilter = status;
  $("log-search-results").replaceChildren();
  $("log-search-input").value = "";
  showToast({
    finished: `Added "${book.title}" to finished books`,
    reading: `Added "${book.title}" — happy reading!`,
    want: `Saved "${book.title}" for later`,
  }[status]);
}

// ======================================================================
// Button on the Discover page: "Add to my books"
// ======================================================================
// app.js calls this when it shows the "Because you read" banner.
function logButtonFor(book) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "pill-button add-to-log";
  const update = () => {
    const entry = findInLog(book.key);
    btn.textContent = entry ? `✓ In my books (${STATUS_LABEL[entry.status].toLowerCase()})` : "+ I read this — add to my books";
    btn.disabled = Boolean(entry && entry.status !== "want");
  };
  btn.addEventListener("click", () => {
    addToLog(book, "finished");
    showToast(`Added "${book.title}" to your finished books`);
    update();
  });
  update();
  return btn;
}

// Bookmark button on recommended books: saves them to "Want to read".
const BOOKMARK_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3h12a1 1 0 0 1 1 1v17l-7-4-7 4V4a1 1 0 0 1 1-1z"/></svg>';

function saveButtonFor(book) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "save-btn";
  btn.innerHTML = BOOKMARK_ICON; // fixed icon markup, no book data in it
  const update = () => {
    const entry = findInLog(book.key);
    btn.classList.toggle("saved", Boolean(entry));
    const label = entry ? `In your books: ${STATUS_LABEL[entry.status]}` : "Save to Want to read";
    btn.title = label;
    btn.setAttribute("aria-label", `${label}: ${book.title}`);
  };
  btn.addEventListener("click", () => {
    if (findInLog(book.key)) {
      showToast(`"${book.title}" is already in My books`);
      return;
    }
    addToLog(book, "want");
    update();
    showToast(`🔖 Saved "${book.title}" to Want to read`);
  });
  update();
  return btn;
}

// ======================================================================
// Pages (Discover / Reading timer / My books) and small helpers
// ======================================================================
function refreshReadingViews() {
  if (typeof renderPet === "function") renderPet();
  renderTimerBookPicker();
  renderTimer();
  renderTimerStats();
  renderLogStats();
  renderCalendar();
  renderBadges();
  renderLog();
}

function route() {
  const view = (location.hash.replace("#", "") || "discover");
  const known = ["discover", "timer", "log", "test", "about"].includes(view) ? view : "discover";
  for (const el of document.querySelectorAll("[data-view]")) el.hidden = el.dataset.view !== known;
  for (const link of document.querySelectorAll("[data-nav]")) {
    link.classList.toggle("active", link.dataset.nav === known);
    if (link.dataset.nav === known) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  }
  if (known !== "discover") refreshReadingViews();
  window.scrollTo({ top: 0 });
}

let toastHandle = null;
function showToast(message) {
  const toast = $("toast");
  toast.textContent = message;
  toast.hidden = false;
  toast.classList.remove("show");
  void toast.offsetWidth; // restart the animation
  toast.classList.add("show");
  clearTimeout(toastHandle);
  toastHandle = setTimeout(() => { toast.hidden = true; }, 3200);
}

// ---------- Wire up buttons ----------
$("timer-start").addEventListener("click", startOrPause);
// If the timer or the log changes in another tab, show the change here too.
window.addEventListener("storage", (e) => {
  if (e.key === TIMER_KEY) { timer = loadTimer(); renderTimer(); }
  if (e.key === LOG_KEY) { refreshReadingViews(); if (typeof renderPet === "function") renderPet(); }
});
$("timer-finish").addEventListener("click", finishSession);
$("timer-reset").addEventListener("click", resetTimer);
$("timer-book").addEventListener("change", (e) => { timer.bookKey = e.target.value; saveTimer(); });

$("manual-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const minutes = Number($("manual-minutes").value);
  if (minutes > 0) {
    addManualTime(minutes);
    $("manual-minutes").value = "";
    e.target.closest("details").open = false;
  }
});
$("export-btn").addEventListener("click", exportBackup);
$("import-file").addEventListener("change", (e) => {
  if (e.target.files[0]) importBackup(e.target.files[0]);
  e.target.value = ""; // so choosing the same file again still works
});

$("log-search-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const text = $("log-search-input").value.trim();
  if (text) searchToAdd(text);
});
for (const tab of document.querySelectorAll(".log-tabs .chip")) {
  tab.addEventListener("click", () => { logFilter = tab.dataset.filter; renderLog(); });
}

// The logo and "Back to home" links go to the Discover page.
for (const el of document.querySelectorAll("[data-home]")) {
  el.addEventListener("click", () => { if (location.hash !== "#discover") location.hash = "discover"; });
}

window.addEventListener("hashchange", route);
renderGoalChips();
refreshReadingViews();
route();
