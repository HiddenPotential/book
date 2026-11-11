// Blind test for Next Read: is the AI better than tag matching?
//
// A student picks a book they've read. They see two lists of 6 books, "List A" and "List B".
// One came from the AI and one from tag matching, but the student isn't told which (it's random
// each time, and the lists look the same). They pick the list they'd rather read from.
// Votes are saved in this browser and shown on the Blind test page, with a CSV download.
// Uses app.js and ai.js (currentBook, lastScored, pickResults, bookCard, ensureAiRanking…).

const TEST_KEY = "nextread-blindtest";
const TEST_LIST_SIZE = 6;
let blind = null; // { aiSide: "A" | "B", book, age, overlap }

function loadVotes() {
  try { return JSON.parse(localStorage.getItem(TEST_KEY)) || []; } catch { return []; }
}

function saveVotes(votes) {
  localStorage.setItem(TEST_KEY, JSON.stringify(votes));
}

// ======================================================================
// Running a test (on the recommendations page)
// ======================================================================
function showBlindTest(on) {
  $("blind-test").hidden = !on;
  for (const id of ["rec-list", "method-row"]) $(id).hidden = on;
  if (on) { $("show-more").hidden = true; $("by-author").hidden = true; }
}

async function startBlindTest() {
  if (!currentBook || !lastScored.length) return;
  const book = currentBook;
  showBlindTest(true);
  $("bt-reveal").hidden = true;
  $("bt-votes").hidden = false;
  for (const side of ["a", "b"]) {        // hide last test's "AI" / "Tags" stamps
    $(`bt-box-${side}`).removeAttribute("data-method");
    $(`bt-method-${side}`).textContent = "";
  }
  for (const b of document.querySelectorAll("[data-vote]")) b.disabled = true;
  $("bt-list-a").replaceChildren(...skeletonCards(TEST_LIST_SIZE));
  $("bt-list-b").replaceChildren(...skeletonCards(TEST_LIST_SIZE));
  $("bt-tester").value = sessionStorage.getItem("nextread-tester") || "";
  $("blind-test").scrollIntoView({ behavior: "smooth", block: "start" });

  try {
    const ai = await ensureAiRanking();
    if (!ai || currentBook?.key !== book.key) return;
    hideAiProgress();
    showStatus("");
    const tagList = pickResults(book, lastScored, false, TEST_LIST_SIZE);
    const aiList = pickResults(book, ai, false, TEST_LIST_SIZE);
    if (tagList.length < 3 || aiList.length < 3) {
      showStatus("Not enough books for a fair test with this one. Try another book.");
      showBlindTest(false);
      return;
    }
    const aiSide = Math.random() < 0.5 ? "A" : "B";
    const overlap = aiList.filter((a) => tagList.some((t) => t.key === a.key)).length;
    blind = { aiSide, book, age: lastAge, overlap };
    // No tags or scores on the cards, so nothing gives away which list is which.
    const cards = (list) => list.map((b, i) => bookCard(b, i));
    $("bt-list-a").replaceChildren(...cards(aiSide === "A" ? aiList : tagList));
    $("bt-list-b").replaceChildren(...cards(aiSide === "B" ? aiList : tagList));
    for (const b of document.querySelectorAll("[data-vote]")) b.disabled = false;
  } catch (err) {
    hideAiProgress();
    showStatus(`The AI couldn't load, so the blind test can't run right now (${err.message}).`);
    showBlindTest(false);
  }
}

function castVote(picked) {
  if (!blind) return;
  const tester = $("bt-tester").value.trim().slice(0, 20);
  sessionStorage.setItem("nextread-tester", tester);
  const winner = picked === "same" ? "same" : picked === blind.aiSide ? "ai" : "tags";
  const votes = loadVotes();
  votes.push({
    time: new Date().toISOString(),
    book: blind.book.title,
    bookKey: blind.book.key,
    ageGroup: blind.age || "adult",
    tester,
    picked,               // "A", "B" or "same"
    aiList: blind.aiSide, // which list was the AI
    winner,               // "ai", "tags" or "same"
    overlap: blind.overlap,
  });
  saveVotes(votes);
  blind = null;

  const aiSide = votes[votes.length - 1].aiList;
  const tagSide = aiSide === "A" ? "B" : "A";
  $("bt-votes").hidden = true;
  $("bt-reveal").hidden = false;
  // Stamp each list with what it really was, and mark the one they picked
  for (const side of ["A", "B"]) {
    const box = $(`bt-box-${side.toLowerCase()}`);
    const isAi = side === aiSide;
    box.dataset.method = isAi ? "ai" : "tags";
    box.classList.toggle("picked", picked === side);
    $(`bt-method-${side.toLowerCase()}`).textContent = isAi ? "✨ AI" : "📚 Tags";
  }
  $("bt-reveal-text").textContent =
    `List ${aiSide} was the AI ✨ and List ${tagSide} was tag matching 📚. ` +
    (winner === "same" ? "You said they were about the same." : `You picked the ${winner === "ai" ? "AI" : "tag matching"} list!`) +
    ` Saved. That's ${votes.length} vote${votes.length === 1 ? "" : "s"} so far.`;
}

// ======================================================================
// Results (on the Blind test page)
// ======================================================================
function percent(n, total) {
  return total ? `${Math.round((n / total) * 100)}%` : "–";
}

function renderTestResults() {
  const votes = loadVotes();
  const count = (list, w) => list.filter((v) => v.winner === w).length;
  const total = votes.length;

  $("test-stats").replaceChildren(
    statCard(String(total), "Votes"),
    statCard(percent(count(votes, "ai"), total), `Picked the AI (${count(votes, "ai")})`),
    statCard(percent(count(votes, "tags"), total), `Picked tag matching (${count(votes, "tags")})`),
    statCard(percent(count(votes, "same"), total), `About the same (${count(votes, "same")})`),
  );

  // Breakdown by reading age
  const groups = ["little", "kids", "teen", "adult"];
  const labels = { little: "Picture books", kids: "Children's", teen: "Teen", adult: "Adult" };
  const rows = groups
    .map((g) => [g, votes.filter((v) => v.ageGroup === g)])
    .filter(([, list]) => list.length);
  $("test-groups").replaceChildren(...rows.map(([g, list]) => {
    const tr = document.createElement("tr");
    for (const cell of [labels[g], list.length, count(list, "ai"), count(list, "tags"), count(list, "same")]) {
      tr.append(textEl("td", "", String(cell)));
    }
    return tr;
  }));
  $("test-groups-wrap").hidden = rows.length === 0;

  // Every vote, newest first
  $("test-votes").replaceChildren(...votes.slice().reverse().map((v) => {
    const tr = document.createElement("tr");
    const when = new Date(v.time).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
    const result = { ai: "AI ✨", tags: "Tags 📚", same: "Same" }[v.winner];
    for (const cell of [when, v.tester || "–", v.book, labels[v.ageGroup] || v.ageGroup, result]) {
      tr.append(textEl("td", "", String(cell)));
    }
    return tr;
  }));
  $("test-votes-wrap").hidden = total === 0;
  $("test-empty").hidden = total > 0;
  if (!total && !$("test-empty").children.length) {
    $("test-empty").append(emptyShelf("No votes yet. Run a blind test from the Discover page."));
  }

  // Bar chart: one bar per answer, as a share of all votes
  $("test-chart-wrap").hidden = total === 0;
  const bars = [["ai", "✨ AI list"], ["tags", "📚 Tag list"], ["same", "🤝 About the same"]];
  $("test-chart").replaceChildren(...bars.map(([key, label]) => {
    const n = count(votes, key);
    const row = document.createElement("div");
    row.className = `bar-row bar-${key}`;
    const track = document.createElement("div");
    track.className = "bar-track";
    const fill = document.createElement("span");
    fill.className = "bar-fill";
    fill.style.setProperty("--share", total ? n / total : 0);
    track.append(fill);
    row.append(textEl("span", "bar-label", label), track, textEl("span", "bar-value", `${n} (${percent(n, total)})`));
    return row;
  }));
}

function csvCell(value) {
  let s = String(value ?? "");
  // A cell starting with = + - @ would run as a formula in Excel or Sheets
  if (/^[=+\-@]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function downloadVotes() {
  const votes = loadVotes();
  const header = ["time", "tester", "book", "age_group", "picked_list", "ai_list", "winner", "books_in_both_lists"];
  const lines = [header.join(",")].concat(votes.map((v) =>
    [v.time, v.tester, v.book, v.ageGroup, v.picked, v.aiList, v.winner, v.overlap].map(csvCell).join(",")));
  const blob = new Blob([lines.join("\n")], { type: "text/csv" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `next-read-blind-test-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

function clearVotes() {
  if (!confirm("Delete all blind test votes on this device? Download them first if you need them.")) return;
  saveVotes([]);
  renderTestResults();
}

// ======================================================================
// Wire up
// ======================================================================
$("blind-test-btn").addEventListener("click", startBlindTest);
for (const b of document.querySelectorAll("[data-vote]")) b.addEventListener("click", () => castVote(b.dataset.vote));
$("bt-again").addEventListener("click", startBlindTest);
$("bt-done").addEventListener("click", () => {
  showBlindTest(false);
  recList.replaceChildren();
  renderRecommendations();
});
$("bt-new-book").addEventListener("click", () => { location.hash = "discover"; goHome(); $("search-input").focus(); });
$("test-download").addEventListener("click", downloadVotes);
$("test-clear").addEventListener("click", clearVotes);
window.addEventListener("hashchange", () => { if (location.hash === "#test") renderTestResults(); });
if (location.hash === "#test") renderTestResults();
