// "Surprise me": a random book for your age, on the Discover homepage.
//
// Picking from ALL books gives obscure ones nobody has heard of, so instead we jump to a random
// spot in the list of popular books for that age (sorted by how many readers have shelved them)
// and pick one there. Kids' ages go through the same safety checks as recommendations
// (ageAppropriate in app.js), so no murder, horror or grown-up books.
// Uses app.js, ai.js and reading.js (searchOpenLibrary, ageAppropriate, coverEl, fetchDescription,
// addToLog, findInLog, recommendFor, showToast).

const AGE_KEY = "nextread-reader-age";

// No love stories for young kids, even ones the library tags "juvenile"
const NOT_FOR_YOUNG_KIDS = /romance|love stories|\blove, fiction/;
// A real early-reader tag. Bestseller-list tags like "nyt:chapter_books" don't count.
const EARLY_READER_TAG = /^(easy readers?|beginner readers|early readers?|readers \(primary\)|chapter books?)\b/;
const noRomance = (b) => !NOT_FOR_YOUNG_KIDS.test(rawSubjects(b).join("|"));
const SURPRISE_AGES = [
  {
    id: "0-5", label: "Ages 0–5", emoji: "🧸", age: "little",
    query: AGE_GROUPS.little.query,
    fits: (b) => !(b.number_of_pages_median > 80) && noRomance(b),
  },
  {
    id: "6-8", label: "Ages 6–8", emoji: "🪁", age: "kids",
    query: '(subject:"easy readers" OR subject:"chapter books" OR subject:"readers (primary)" OR subject:"beginner readers" OR subject:"early readers")' +
           ' AND subject:"juvenile fiction" -subject:"young adult fiction"',
    fits: (b) => !(b.number_of_pages_median > 220) && !(lowestGrade(b) > 4) && noRomance(b) &&
                 rawSubjects(b).some((x) => EARLY_READER_TAG.test(x)),
  },
  {
    id: "9-12", label: "Ages 9–12", emoji: "🚲", age: "kids",
    query: AGE_GROUPS.kids.query,
    fits: (b) => littleSigns(b) < 2 && !(b.number_of_pages_median < 90) && noRomance(b),
  },
  {
    id: "teen", label: "Teens", emoji: "🎧", age: "teen",
    query: '(subject:"young adult fiction" OR subject:"teenagers") -subject:"erotic stories" -subject:"erotica"',
    fits: () => true,
  },
  {
    id: "adult", label: "Adults", emoji: "☕", age: null,
    query: 'subject:"fiction" -subject:"juvenile fiction" -subject:"young adult fiction" -subject:"erotica" -subject:"erotic stories"',
    fits: (b) => !clearlyForKids(b) && !/erotic|erotica/.test(rawSubjects(b).join("|")),
  },
];

// Kinds of books (optional). Each adds one more subject to the search.
const SURPRISE_KINDS = [
  { id: "any", label: "Anything", subject: null },
  { id: "funny", label: "😂 Funny", subject: "humorous stories" },
  { id: "animals", label: "🐾 Animals", subject: "animals" },
  { id: "adventure", label: "🧭 Adventure", subject: "adventure stories" },
  { id: "mystery", label: "🔍 Mystery", subject: "mystery and detective stories" },
  { id: "fantasy", label: "🐉 Fantasy", subject: "fantasy" },
  { id: "friendship", label: "🤝 Friendship", subject: "friendship" },
];

let surpriseAge = SURPRISE_AGES.find((a) => a.id === localStorage.getItem(AGE_KEY)) || SURPRISE_AGES[2];
let surpriseKind = SURPRISE_KINDS[0];
const surpriseSeen = new Set(); // don't show the same book twice in one visit
let surpriseBook = null;
let surpriseBusy = false;

async function findSurpriseBook(group = surpriseAge, kind = surpriseKind) {
  const q = kind.subject ? `(${group.query}) AND subject:"${kind.subject}"` : group.query;
  // Try a random spot among the top ~400 popular books first, then nearer the top if that's empty.
  for (const maxOffset of [400, 120, 0]) {
    const offset = Math.floor(Math.random() * (maxOffset / 40 + 1)) * 40;
    const docs = await searchOpenLibrary({ q, sort: "readinglog", limit: 40, offset });
    const good = docs.filter((b) =>
      b.cover_i && !surpriseSeen.has(b.key) && readableInEnglish(b) && group.fits(b) &&
      (!group.age || ageAppropriate(b, group.age, {})));
    if (good.length) return good[Math.floor(Math.random() * good.length)];
  }
  return null;
}

async function rollSurprise() {
  if (surpriseBusy) return;
  surpriseBusy = true;
  const card = $("surprise-card");
  const roll = $("surprise-roll");
  roll.disabled = true;
  roll.classList.add("rolling");
  card.hidden = false;
  card.classList.remove("revealed", "placeholder");
  card.classList.add("shuffling");
  $("surprise-status").textContent = "";
  try {
    // Remember what this roll was for, in case a chip is tapped while it's rolling
    const group = surpriseAge, kind = surpriseKind;
    const [book] = await Promise.all([findSurpriseBook(group, kind), new Promise((r) => setTimeout(r, 700))]);
    if (!book) {
      showSurprisePlaceholder();
      $("surprise-status").textContent = "Couldn't find a book for that. Try another kind of book!";
      return;
    }
    surpriseSeen.add(book.key);
    surpriseBook = book;
    showSurprise(book, group, kind);
    // The description loads after the card appears, so the reveal feels quick.
    fetchDescription(book.key).then((d) => {
      if (surpriseBook?.key !== book.key) return;
      const text = d || (Array.isArray(book.first_sentence) ? book.first_sentence[0] : "");
      $("surprise-desc").textContent = text ? (text.length > 260 ? `${text.slice(0, 257).trim()}…` : text) : "";
    });
  } catch (err) {
    showSurprisePlaceholder();
    $("surprise-status").textContent = `Couldn't reach the library (${err.message}). Try again.`;
  } finally {
    card.classList.remove("shuffling");
    roll.disabled = false;
    roll.classList.remove("rolling");
    roll.textContent = "🎲 Another one!";
    surpriseBusy = false;
  }
}

function showSurprise(book, group = surpriseAge, kind = surpriseKind) {
  const link = document.createElement("a");
  link.href = `https://openlibrary.org${book.key}`;
  link.target = "_blank";
  link.rel = "noopener";
  link.className = "surprise-cover";
  link.title = "Open on Open Library";
  link.append(coverEl(book, "L"));
  $("surprise-cover").replaceChildren(link);
  $("surprise-title").textContent = book.title;
  $("surprise-meta").replaceChildren(metaEl(book));
  $("surprise-desc").textContent = "";
  const tags = cleanSubjects(book.subject).slice(0, 3);
  $("surprise-tags").replaceChildren(...tags.map((t) => textEl("span", "tag", t)));
  $("surprise-for").textContent = `${group.emoji} ${group.label}${kind.subject ? ` · ${kind.label}` : ""}`;
  updateSurpriseSave();
  const card = $("surprise-card");
  void card.offsetWidth; // restart the flip animation
  card.classList.add("revealed");
}

function updateSurpriseSave() {
  const btn = $("surprise-save");
  const entry = surpriseBook && findInLog(surpriseBook.key);
  btn.disabled = Boolean(entry);
  btn.textContent = entry ? `✓ In my books (${STATUS_LABEL[entry.status].toLowerCase()})` : "🔖 Save to Want to read";
}

function chipRow(containerId, items, isOn, onPick) {
  $(containerId).replaceChildren(...items.map((item) => {
    const chip = textEl("button", "chip", item.emoji ? `${item.emoji} ${item.label}` : item.label);
    chip.type = "button";
    chip.setAttribute("aria-pressed", isOn(item));
    chip.addEventListener("click", () => onPick(item));
    return chip;
  }));
}

function renderSurpriseChips() {
  chipRow("surprise-ages", SURPRISE_AGES, (a) => a === surpriseAge, (a) => {
    surpriseAge = a;
    localStorage.setItem(AGE_KEY, a.id);
    renderSurpriseChips();
  });
  chipRow("surprise-kinds", SURPRISE_KINDS, (k) => k === surpriseKind, (k) => {
    surpriseKind = k;
    renderSurpriseChips();
  });
}

$("surprise-roll").addEventListener("click", rollSurprise);
$("surprise-similar").addEventListener("click", () => { if (surpriseBook) recommendFor(surpriseBook); });
$("surprise-save").addEventListener("click", () => {
  if (!surpriseBook) return;
  addToLog(surpriseBook, "want");
  updateSurpriseSave();
  showToast(`🔖 Saved "${surpriseBook.title}" to Want to read`);
});
// Before the first roll: a "mystery book" card, so the space isn't empty
function showSurprisePlaceholder() {
  const card = $("surprise-card");
  card.hidden = false;
  card.classList.add("placeholder");
  const mystery = document.createElement("div");
  mystery.className = "cover mystery-cover";
  mystery.append(textEl("span", "mystery-mark", "?"));
  $("surprise-cover").replaceChildren(mystery);
  $("surprise-for").textContent = "Your surprise book";
  $("surprise-title").textContent = "Who knows what you'll get?";
  $("surprise-meta").replaceChildren();
  $("surprise-tags").replaceChildren();
  $("surprise-desc").textContent = "Pick an age (and a kind of book, if you like), then press Surprise me. Every roll is a different book!";
}

renderSurpriseChips();
showSurprisePlaceholder();
