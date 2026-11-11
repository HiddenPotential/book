// AI recommender for Next Read.
//
// A small AI model (all-MiniLM-L6-v2, about 23 MB) turns each book's description into a list
// of 384 numbers that capture its meaning (an "embedding"). Books whose numbers point in a
// similar direction are about similar things, even if they share no subject tags.
//
// Everything runs in your browser with Transformers.js: no account, no API key, no cost, and
// the descriptions never go to an AI company. The model is downloaded once from Hugging Face
// and then cached by the browser.
//
// Safety: the AI only re-orders books that already passed the same age and content checks as
// the tag method (ageAppropriate in app.js), so it can't bring back adult books for kids.

const AI_LIBRARY = "https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.3.2";
const AI_MODEL = "Xenova/all-MiniLM-L6-v2";
const AI_POOL = 48;              // how many candidate books the AI reads
const DESC_CACHE_KEY = "nextread-descriptions";

let extractorPromise = null;
const vectorCache = new Map(); // book key -> embedding

// ======================================================================
// Loading the model
// ======================================================================
function loadModel(onProgress) {
  if (!extractorPromise) {
    const files = {}; // file name -> [loaded, total], for one combined progress number
    extractorPromise = import(AI_LIBRARY)
      .then(({ pipeline }) => pipeline("feature-extraction", AI_MODEL, {
        dtype: "q8", // the small 23 MB version of the model
        progress_callback: (p) => {
          if (p.status === "progress" && p.total) {
            files[p.file] = [p.loaded, p.total];
            const [loaded, total] = Object.values(files).reduce((a, [l, t]) => [a[0] + l, a[1] + t], [0, 0]);
            onProgress?.(loaded / total);
          }
        },
      }))
      .catch((err) => { extractorPromise = null; throw err; }); // allow a retry
  }
  return extractorPromise;
}

async function embed(texts) {
  const extractor = await loadModel();
  const output = await extractor(texts, { pooling: "mean", normalize: true });
  return output.tolist();
}

// Vectors are normalized, so the dot product is the cosine similarity (1 = same meaning).
function similarity(a, b) {
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += a[i] * b[i];
  return sum;
}

// ======================================================================
// Book descriptions (from Open Library), cached in the browser
// ======================================================================
const descCache = (() => {
  let cache = {};
  try { cache = JSON.parse(localStorage.getItem(DESC_CACHE_KEY)) || {}; } catch { /* start fresh */ }
  // Older versions saved a blank description when a lookup failed. Drop blanks once so they get re-checked.
  if (!localStorage.getItem("nextread-descriptions-cleaned")) {
    for (const k of Object.keys(cache)) if (!cache[k]) delete cache[k];
    try {
      localStorage.setItem(DESC_CACHE_KEY, JSON.stringify(cache));
      localStorage.setItem("nextread-descriptions-cleaned", "1");
    } catch { /* storage full: try again next time */ }
  }
  return cache;
})();

function saveDescCache() {
  const keys = Object.keys(descCache);
  for (const k of keys.slice(0, Math.max(0, keys.length - 600))) delete descCache[k]; // keep it small
  try { localStorage.setItem(DESC_CACHE_KEY, JSON.stringify(descCache)); } catch { /* storage full: fine */ }
}

function cleanDescription(text) {
  return String(text)
    .split(/\n-{3,}|\(\[source\]|\[source\]/i)[0] // drop "----" footers and source links
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")      // markdown links -> their text
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 700);
}

// Books whose description couldn't be loaded this time (offline, server busy).
// These are never saved, so they get another try next time instead of staying blank forever.
const descFailed = new Set();

async function fetchDescription(key) {
  if (key in descCache) return descCache[key];
  try {
    const res = await fetch(`https://openlibrary.org${key}.json`);
    if (res.ok || res.status === 404) { // 404: Open Library has no page for it, which won't change
      const data = res.ok ? await res.json() : {};
      const d = data.description;
      const text = cleanDescription(typeof d === "string" ? d : d?.value || "");
      descCache[key] = text;
      descFailed.delete(key);
      return text;
    }
  } catch { /* offline or blocked: fall through */ }
  descFailed.add(key);
  return ""; // use the fallback text (title and subjects) just for now
}

// Runs jobs a few at a time so we don't flood Open Library with requests.
async function inBatches(items, size, job) {
  const results = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await job(items[i], i);
    }
  };
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, worker));
  return results;
}

// What the AI reads for each book: its title, description (or first sentence) and topics.
function bookText(book, description) {
  const topics = cleanSubjects(book.subject).slice(0, 10).join(", ");
  const first = Array.isArray(book.first_sentence) ? book.first_sentence[0] : "";
  return [book.title, description || first, topics && `Topics: ${topics}`].filter(Boolean).join(". ");
}

// ======================================================================
// Ranking
// ======================================================================
// Which books the AI looks at: the same safe candidates the tag method used.
function aiCandidatePool(book, candidates, age, tagRanked) {
  const source = sourceInfo(book);
  const safe = candidates.filter((c) => c.key !== book.key && readableInEnglish(c) && ageAppropriate(c, age, source));
  // The most popular safe books, plus the tag method's best picks, so both lists draw from
  // similar books and the blind test is a fair comparison of the ranking.
  const pool = new Map();
  for (const c of tagRanked.slice(0, 16)) pool.set(c.key, c);
  for (const c of safe) { if (pool.size >= AI_POOL) break; pool.set(c.key, c); }
  return [...pool.values()].filter((c) => safe.some((s) => s.key === c.key));
}

async function aiRank(book, candidates, age, tagRanked, onStatus) {
  onStatus?.("Waking up the AI…", null);
  await loadModel((fraction) => onStatus?.("Downloading the AI model (about 23 MB, only the first time)…", fraction));

  const pool = aiCandidatePool(book, candidates, age, tagRanked);
  if (pool.length === 0) return [];

  let done = 0;
  onStatus?.(`The AI is reading ${pool.length + 1} book descriptions…`, 0);
  const books = [book, ...pool];
  const descriptions = await inBatches(books, 8, async (b) => {
    const d = await fetchDescription(b.key);
    onStatus?.(`The AI is reading ${books.length} book descriptions…`, ++done / books.length);
    return d;
  });
  saveDescCache();

  // Turn every description into numbers (skip books we've already done)
  const todo = books.filter((b) => !vectorCache.has(b.key));
  const fresh = new Map(); // vectors made in this run, including ones we won't keep
  if (todo.length) {
    onStatus?.("The AI is comparing their meanings…", null);
    const vectors = await embed(todo.map((b) => bookText(b, descriptions[books.indexOf(b)])));
    todo.forEach((b, i) => {
      fresh.set(b.key, vectors[i]);
      if (!descFailed.has(b.key)) vectorCache.set(b.key, vectors[i]); // retry failed ones next time
    });
  }
  const vectorOf = (key) => vectorCache.get(key) || fresh.get(key);

  const mine = vectorOf(book.key);
  return pool
    .map((c) => {
      const sim = similarity(mine, vectorOf(c.key));
      const score = sim * (c.cover_i ? 1 : 0.92); // books with no cover are usually obscure
      return { ...c, score, aiSimilarity: sim, shared: [`${Math.round(Math.max(0, sim) * 100)}% similar`] };
    })
    .sort((a, b) => b.score - a.score);
}

// ======================================================================
// Showing AI results on the page
// ======================================================================
function showAiProgress(message, fraction) {
  showStatus(message);
  const bar = $("ai-progress");
  bar.hidden = false;
  bar.classList.toggle("busy", fraction === null);
  bar.style.setProperty("--done", fraction ?? 0);
}

function hideAiProgress() {
  $("ai-progress").hidden = true;
}

// Make sure the AI ranking for the current book is ready (used by the list and the blind test).
async function ensureAiRanking() {
  const book = currentBook;
  if (aiScored) return aiScored;
  const ranked = await aiRank(book, lastCandidates, lastAge, lastScored, showAiProgress);
  if (currentBook?.key !== book?.key) return null; // the user moved on to another book
  aiScored = ranked;
  return ranked;
}

// Called by app.js when the AI method is chosen.
async function aiRecommend() {
  const book = currentBook;
  recList.replaceChildren(...skeletonCards(8));
  $("show-more").hidden = true;
  try {
    const ranked = await ensureAiRanking();
    if (!ranked || currentBook?.key !== book?.key) return;
    hideAiProgress();
    recList.replaceChildren();
    renderRecommendations();
  } catch (err) {
    hideAiProgress();
    showStatus(`The AI couldn't load (${err.message}). Showing tag matches instead.`);
    recList.replaceChildren();
    const keepMethod = recMethod;
    recMethod = "tags";
    renderRecommendations();
    recMethod = keepMethod;
  }
}

function setMethod(method) {
  recMethod = method;
  localStorage.setItem("nextread-method", method);
  for (const b of document.querySelectorAll("[data-method]")) b.setAttribute("aria-pressed", b.dataset.method === method);
  $("method-note").textContent = method === "ai"
    ? "A small AI on your device reads each book's description and finds ones with a similar meaning."
    : "Books that share subjects with yours, like \"dragons\" or \"friendship\".";
  if (!currentBook || !lastCandidates.length) return;
  if (method === "ai" && !aiScored) {
    aiRecommend();
  } else {
    hideAiProgress();
    recList.replaceChildren();
    renderRecommendations();
  }
}

for (const b of document.querySelectorAll("[data-method]")) {
  b.addEventListener("click", () => setMethod(b.dataset.method));
}
setMethod(recMethod);
