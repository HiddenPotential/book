// Next Read — recommends books similar to the one you last read.
// Uses only the free Open Library Search API (no key needed).
//
// How it works:
//   1. Search Open Library for the book you typed.
//   2. You pick the right match. We read its subjects (e.g. "dystopias", "survival").
//   3. We search for popular books that share any of those subjects.
//   4. Each candidate is scored by how many subjects it shares with your book.
//      Rare subjects (shared by few candidates) count more than broad ones
//      like "science fiction", so the results are more specific.

const API = "https://openlibrary.org/search.json";
const FIELDS = "key,title,author_name,author_key,cover_i,first_publish_year,subject,number_of_pages_median,language,edition_count";
const MAX_QUERY_SUBJECTS = 12; // how many of your book's subjects to search with
const POOL_SIZE = 150;         // how many candidates to fetch and score
const RESULTS_SHOWN = 12;

// ---------- Page elements ----------
const $ = (id) => document.getElementById(id);
const form = $("search-form");
const input = $("search-input");
const statusEl = $("status");
const matchesSection = $("matches");
const matchList = $("match-list");
const resultsSection = $("results");
const chosenEl = $("chosen");
const recList = $("rec-list");
const sameAuthorBox = $("same-author");

let currentBook = null;  // the book the user picked
let lastScored = [];     // scored candidates, so the checkbox can re-filter without refetching
let shownCount = RESULTS_SHOWN; // grows when "Show more" is clicked

// ---------- Subject cleanup ----------
// Open Library subjects are messy: "Survival, fiction", "nyt:series_books=...",
// "Reading Level-Grade 9", etc. We tidy them and drop ones that say nothing about the story.
const JUNK_SUBJECTS = new Set([
  "fiction", "novels", "novel", "literature", "general", "juvenile works", "juvenile fiction",
  "juvenile literature", "children's fiction", "young adult works", "accessible book",
  "protected daisy", "in library", "lending library", "large type books", "large print books",
  "new york times bestseller", "new york times reviewed", "long now manual for civilization",
  "open library staff picks", "roman", "amerikanisches englisch", "english language",
  "english fiction", "american fiction", "fiction in english", "book set", "readers",
  "textbooks", "reading materials", "translations into english", "ficción", "romans",
  "children's stories", "stories", "short stories", "fiction, general", "classic literature",
]);

// Subjects about the book's format, language or audience rather than its story,
// plus common French/Spanish/German catalog labels that have no accents.
const JUNK_PATTERN = new RegExp([
  "reading level", "grade \\d", "\\d{4}", "language materials", "translations?",
  "juvenile", "juvenil", "jeunes", "jeunesse", "\\bromans?\\b", "novela", "nouvelles",
  "relaciones", "relations humaines", "supervivencia", "literature and fiction",
  "books and reading", "chinese", "spanish", "french", "german", "japanese",
  "children's books", "young adult works", "staff picks", "bestseller", "award",
  "open_syllabus", "large print", "audiobook", "comic books, strips", "coloring books",
  "^series$", "^history$", "^drama$", "^non-fiction$", "englisch", "xiao shuo",
  // common Spanish/French catalog words without accents
  "\\bhistori[ae]\\b", "^histoire", "hermanas", "hermanos", "^magia$", "^magos$", "hombre",
  "amours?", "sociales", "cuentos", "\\bamor\\b", "ciencia", "aventuras", "famil(ia|le)",
  "amistad", "amitie", "freundschaft", "cerdos", "dragones", "elefantes", "grenouilles", "crapauds",
  "couleurs?", "chat domestique", "animales", "animaux", "\\btiere\\b", "orugas", "mariposas",
  "papillons", "conejos", "lapins", "gatos", "perros", "chiens", "osos", "\\bours\\b", "monstruos",
  "ranas", "sapos", "insectos", "muestras", "juguete", "lectura", "\\blecture\\b", "libros?\\b",
  "livres?\\b", "lengua", "\\blangue\\b", "inglesa", "anglais", "tong hua", "kinder", "enfants",
  "ninos", "cuento", "\\bhistoires\\b", "noche", "\\bnuit\\b",
  // Catalog labels about the format, not the story (kids' books have lots of these)
  "child and youth", "pictorial works", "children's (stories|literature|poetry)", "bilingual",
  "specimens", "toy and movable", "textured books", "board books", "picture books", "^concepts?$",
  "^classics?$", "\\breaders?\\b", "beginner", "beginning reader", "chapter books?", "accelerated reader",
  "study and teaching", "social themes", "kid'?s", "^children'?s?$", "^books?$", "^english$",
  "^american$", "newbery", "caldecott", "medal", "honor book", "stories, (american|english)",
  "\\bebook", "miniature books", "imaginary (places|creatures)?$", "^animals?$",
  "curriculum", "school subject", "key stage", "lexile", "ouvrages", "illustr", "saisons",
  "^(english|american|british|irish|scottish|canadian|australian|world|modern|classical) literature$",
  "^literature", "^literary", "^classic (fiction|novels?)$", "^popular (fiction|literature)$",
  "^#", "^p\\.?i$",
  "non-classifiable", "fictional works", "read aloud", "storytime", "haur eta", "irakurgai", "ingelesa",
].join("|"));

function cleanSubject(raw) {
  let s = raw.toLowerCase().trim();
  // Bookstore codes like "fiction / mystery & detective / general": keep the most specific part.
  if (s.includes(" / ")) {
    const parts = s.split(" / ").filter((p) => p !== "general" && p !== "fiction");
    s = parts[parts.length - 1] || "";
  }
  s = s.replace(/\s*--\s*fiction$/, "")   // "Survival -- Fiction"
       .replace(/,\s*fiction$/, "")        // "Survival, fiction"
       .replace(/^fiction,\s*/, "")        // "Fiction, science fiction, general"
       .replace(/,\s*general$/, "")
       .trim();
  if (s.length < 3 || s.length > 40) return null;
  if (s.includes(":") || s.includes("=")) return null;       // "nyt:..." tags
  if (/[^\x00-\x7f]/.test(s)) return null;                  // non-English labels ("ficción", "compétitions")
  s = s.replace(/[-.,;\s]+$/, "");                         // "animales-" -> "animales"
  if (JUNK_PATTERN.test(s)) return null;
  if (JUNK_SUBJECTS.has(s)) return null;
  return s;
}

// "Colors" and "color", "butterflies" and "butterfly" should count as the same subject.
function subjectKey(s) {
  return s.replace(/ies$/, "y").replace(/([^s])s$/, "$1");
}

function cleanSubjects(list = []) {
  const out = new Set();
  for (const raw of list) {
    const s = cleanSubject(raw);
    if (s) out.add(s);
  }
  return [...out];
}

// ---------- Open Library calls ----------
async function searchOpenLibrary(params) {
  const url = `${API}?${new URLSearchParams({ fields: FIELDS, ...params })}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Open Library returned ${res.status}`);
  return (await res.json()).docs;
}

async function findBooks(text) {
  const books = await searchOpenLibrary({ q: text, limit: 12 });
  // Open Library has some junk duplicate entries with almost no info. Show the
  // well-described ones first so people pick the entry we can recommend from.
  const richness = (b) => Math.min(cleanSubjects(b.subject).length, 5) + (b.cover_i ? 1 : 0);
  // Exact title matches go first ("Educated" should find Educated, not A Deadly Education).
  // Main entries (lots of editions) go before adaptations and one-off duplicates: searching
  // "Harry Potter and the Sorcerer's Stone" should find the real book, not a pop-up book version.
  const wanted = titleKey(text);
  const mostEditions = Math.max(1, ...books.map((b) => b.edition_count || 1));
  return books
    .map((b, i) => ({ b, i, poor: richness(b) < 3, exact: titleKey(b.title) === wanted,
                      major: (b.edition_count || 1) >= mostEditions * 0.2 }))
    .sort((x, y) =>
      (y.major && y.exact && !y.poor) - (x.major && x.exact && !x.poor) ||
      (y.major && !y.poor) - (x.major && !x.poor) ||
      x.poor - y.poor || x.i - y.i)
    .slice(0, 8)
    .map((x) => x.b);
}

function findBooksWithSubjects(subjects, age = null) {
  if (subjects.length === 0) return Promise.resolve([]);
  // Builds: (subject:"dystopias" OR subject:"survival" OR ...)
  let q = "(" + subjects.map((s) => `subject:"${s.replace(/"/g, "")}"`).join(" OR ") + ")";
  // For kids' books, only search books for the same age (see AGE_GROUPS below).
  if (age) q += " AND " + AGE_GROUPS[age].query;
  // sort=readinglog puts books many people have shelved first, so results are well-known books.
  return searchOpenLibrary({ q, limit: POOL_SIZE, sort: "readinglog" });
}

// ---------- Reading age ----------
// Open Library tags tell us who a book is for. Kids should only get kids' books, never a murder
// mystery or an adult novel, and adults shouldn't get board books.
//
// The tricky part: many adult books (Murder on the Orient Express, Of Mice and Men) have ONE
// kids' edition, so they carry a "juvenile" tag or two. Real kids' books have lots of them.
// So we count kids' tags instead of just checking for one.
const KIDS_SIGNS = /juvenile|children'?s|picture books|easy readers?|early readers?|chapter books?|school stories|accelerated reader|infantil|pour la jeunesse/;
const TEEN_SIGNS = /\byoung adult\b|\bteens?\b|\bteenage/;

// Grown-up topics. Never shown to kids or teens.
const ADULT_ONLY = /\bsex\b|sexual|erotic|erotica|pornograph|rape|incest|prostitut|bdsm|adultery|new adult/;
// Violent topics. Never shown to young kids; only shown to older kids if their book has them too.
const VIOLENT = /murder|homicide|serial (killer|murder)|killers?\b|assassin|torture|massacre|gore|psychopath|mass shooting/;
// Scary books. Only shown to kids whose own book is scary too (Goosebumps readers can get Goosebumps).
const SCARY = /horror|ghost stories|haunted|zombies?|vampires?|slasher|thrillers?\b|psychological fiction/;

// School grade a book is meant for, from tags like "Reading level-Grade 9", "Grades 4-6"
// or "Ages 8-12". Returns the lowest grade mentioned, or null if there are none.
function lowestGrade(book) {
  const grades = [];
  for (const x of rawSubjects(book)) {
    let m;
    if ((m = x.match(/reading level-?\s*grade (\d+)/))) grades.push(+m[1]);
    else if ((m = x.match(/\bgrades? (\d+)/))) grades.push(+m[1]);
    else if ((m = x.match(/\bages? (\d+)/))) grades.push(+m[1] - 5); // age 8 is about grade 3
    else if (/kindergarten|preschool/.test(x)) grades.push(0);
  }
  return grades.length ? Math.min(...grades) : null;
}

const AGE_GROUPS = {
  little: {
    label: "Picture books & early readers",
    // Tags that mean "for little kids"
    signs: /picture books|board books|stories in rhyme|bedtime|easy readers|beginner readers|early readers|i can read|caldecott|nursery rhymes|lift-the-flap|toddlers?|preschool|counting|alphabet|libros de l[aá]minas|livres illustr/,
    query: '(subject:"picture books" OR subject:"board books" OR subject:"stories in rhyme" OR subject:"bedtime" OR subject:"easy readers")' +
           ' -subject:"young adult fiction" -subject:"chapter books" -subject:"murder" -subject:"horror tales"',
  },
  kids: {
    label: "Children's books",
    query: '(subject:"juvenile fiction" OR subject:"children\'s fiction" OR subject:"juvenile literature")' +
           ' -subject:"young adult fiction" -subject:"romance" -subject:"love stories"' +
           ' -subject:"murder" -subject:"serial murders" -subject:"sex" -subject:"erotic stories" -subject:"horror tales"',
  },
  teen: {
    label: "Teen & young adult books",
    query: '(subject:"young adult fiction" OR subject:"juvenile fiction" OR subject:"teenagers")' +
           ' -subject:"erotic stories" -subject:"erotica" -subject:"sex"',
  },
};

function rawSubjects(book) {
  return (book.subject || []).map((x) => x.toLowerCase());
}

function countTags(book, re) {
  return rawSubjects(book).filter((x) => re.test(x)).length;
}

// Is this clearly a kids' book (not an adult book that happens to have a kids' edition)?
function clearlyForKids(book) {
  const kids = countTags(book, KIDS_SIGNS);
  const share = kids / (rawSubjects(book).length || 1);
  // Lightly tagged kids' books (Goosebumps: 2 of 18 tags) still pass; adult classics with
  // a kids' edition (Murder on the Orient Express: 2 of 58) don't.
  return kids >= 4 || share >= 0.15 || (kids >= 2 && share >= 0.07) || littleSigns(book) >= 2;
}

// Share of a book's tags that say it's for kids or teens.
function youngShare(book) {
  return (countTags(book, KIDS_SIGNS) + countTags(book, TEEN_SIGNS)) / (rawSubjects(book).length || 1);
}

// Is it a kids' or teen book at all?
function clearlyForYoungReaders(book) {
  const young = countTags(book, KIDS_SIGNS) + countTags(book, TEEN_SIGNS);
  const share = youngShare(book);
  return young >= 3 || share >= 0.12 || (young >= 2 && share >= 0.07) || littleSigns(book) >= 2;
}

// Returns "little", "kids", "teen", or null (adults).
function ageGroupOf(book) {
  const pages = book.number_of_pages_median;
  const kids = countTags(book, KIDS_SIGNS);
  const teen = countTags(book, TEEN_SIGNS);
  const isForKids = kids >= 1 || littleSigns(book) >= 1;

  const grade = lowestGrade(book);

  // Clearly a picture book: several little-kid tags, or a short kids' book.
  if (littleSigns(book) >= 2 || (isForKids && pages && pages <= 64)) return "little";
  if (!isForKids && !teen) return null;
  // Adult books with one kids' edition aren't kids' books.
  if (!clearlyForYoungReaders(book) && !book.authorWritesForKids) return null;
  // Meant for grade 7 and up, lots of teen tags, a long book, or grown-up topics: a teen book.
  if (grade !== null && grade >= 7) return "teen";
  if (teen && (teen * 2 >= kids || pages >= 400 || countTags(book, ADULT_ONLY) >= 1)) return "teen";
  if (littleSigns(book) >= 1 && !(pages > 100)) return "little";
  return isForKids ? "kids" : "teen";
}

// Some Open Library entries have hardly any tags (one Harry Potter entry has 18, only 2 for kids).
// For those, check whether the author mostly writes kids' books.
async function detectAge(book) {
  const age = ageGroupOf(book);
  if (age || countTags(book, KIDS_SIGNS) + countTags(book, TEEN_SIGNS) === 0 || !book.author_key?.[0]) return age;
  try {
    const works = (await searchOpenLibrary({ q: `author_key:${book.author_key[0]}`, sort: "readinglog", limit: 12 }))
      .filter((w) => rawSubjects(w).length >= 3);
    // Kids' authors (R.L. Stine) have kids' tags all over their books; adult authors
    // (Agatha Christie) only have the odd kids' edition.
    const avgShare = works.reduce((sum, w) => sum + youngShare(w), 0) / (works.length || 1);
    const mostlyYoung = works.filter((w) => countTags(w, KIDS_SIGNS) + countTags(w, TEEN_SIGNS) > 0).length >= works.length * 0.7;
    if (works.length >= 3 && avgShare >= 0.08 && mostlyYoung) return ageGroupOf({ ...book, authorWritesForKids: true });
  } catch { /* fall back to adult */ }
  return age;
}

// Is this candidate OK to show to someone who reads books for this age group?
// "source" is the book they read: a scary or murder-mystery book allows a bit more.
function ageAppropriate(c, age, source = {}) {
  const subs = rawSubjects(c).join("|");
  const grade = lowestGrade(c);
  if (age === "little" || age === "kids") {
    if (!clearlyForKids(c)) return false;          // adult book with a kids' edition
    if (ADULT_ONLY.test(subs)) return false;
    if (/tragedies|english drama|middle english|poetry, medieval/.test(subs)) return false; // King Lear, Canterbury Tales
    if (TEEN_SIGNS.test(subs) && countTags(c, TEEN_SIGNS) * 2 >= countTags(c, KIDS_SIGNS)) return false; // mostly a teen book
    if (VIOLENT.test(subs) && (age === "little" || !source.violent)) return false;
    if (SCARY.test(subs) && (age === "little" || !source.scary)) return false;
    // Reading level: no grade 7+ books for kids, no grade 3+ books for little kids.
    const maxGrade = age === "little" ? 2 : Math.max(6, (source.grade ?? 0) + 2);
    if (grade !== null && grade > maxGrade) return false;
    return true;
  }
  if (age === "teen") {
    return clearlyForYoungReaders(c) && !ADULT_ONLY.test(subs);
  }
  return true;
}

// How strongly a candidate looks like a little-kid book (0, 1, 2+ signs).
function littleSigns(book) {
  return new Set(rawSubjects(book).filter((x) => AGE_GROUPS.little.signs.test(x))).size;
}

// ---------- Genre check ----------
// Broad story types. If your book is a mystery, recommendations must be mysteries too,
// so a book that only shares "humour" or "England" with it doesn't sneak in.
const GENRE_FAMILIES = {
  mystery: /myster|detective|crime|murder|private investigator|police procedural|whodunit/,
  thriller: /thriller|suspense/,
  fantasy: /fantasy|magic|wizard|dragon|elves|fairy tale/,
  scifi: /science fiction|dystopi|space (opera|travel|flight)|robots?$|time travel|extraterrestrial|aliens?$/,
  romance: /romance|love stories/,
  horror: /horror|ghost|supernatural|vampire|zombie|haunted/,
  history: /^history|historical/,
  biography: /biograph|memoir|autobiograph/,
  selfhelp: /self-help|success|habit|personal development|self-actualization|motivation/,
};

// Nonfiction readers (history, science, self-help) shouldn't get novels, and vice versa.
const FICTION_SIGNS = /fiction|novel|stories|fairy tales|folklore/;
const NONFICTION_SIGNS = /non-?fiction|^history|biography|science|self-help|psychology|economics|philosophy|essays/;
function isFiction(book) {
  const subs = rawSubjects(book);
  const fiction = subs.filter((x) => FICTION_SIGNS.test(x) && !/non-?fiction/.test(x)).length;
  const nonfiction = subs.filter((x) => NONFICTION_SIGNS.test(x)).length;
  return fiction > nonfiction;
}

function genresOf(subjects) {
  const found = new Set();
  for (const [name, re] of Object.entries(GENRE_FAMILIES)) {
    if (subjects.some((x) => re.test(x))) found.add(name);
  }
  return found;
}

// ---------- Recommendation scoring ----------
function scoreCandidates(book, candidates, age = null) {
  // Compare subjects by key so "colors"/"color" and "butterflies"/"butterfly" match.
  const myKeys = new Set(cleanSubjects(book.subject).map(subjectKey));
  // Picture books are already filtered by age, and their genre tags are loose, so skip the check there.
  const myGenres = age === "little" ? new Set() : genresOf(cleanSubjects(book.subject));
  const myFiction = isFiction(book);
  const mine = rawSubjects(book).join("|");
  const source = { violent: VIOLENT.test(mine), scary: SCARY.test(mine), grade: lowestGrade(book) };
  const pool = candidates
    .filter((c) => c.key !== book.key)
    .map((c, rank) => {
      const cleaned = cleanSubjects(c.subject);
      const byKey = new Map(cleaned.map((s) => [subjectKey(s), s])); // key -> readable label
      return { ...c, byKey, rank };
    });

  // Count how many candidates have each subject. Common = broad = worth less.
  const howCommon = {};
  for (const c of pool) for (const k of c.byKey.keys()) howCommon[k] = (howCommon[k] || 0) + 1;
  const weight = (k) => Math.log((pool.length + 1) / ((howCommon[k] || 0) + 1)) + 0.1;

  return pool
    .map((c) => {
      const sharedKeys = [...c.byKey.keys()].filter((k) => myKeys.has(k));
      sharedKeys.sort((x, y) => weight(y) - weight(x)); // most specific first, for display
      let similarity = sharedKeys.reduce((sum, k) => sum + weight(k), 0);
      // Very famous books have 100+ subjects, so they match lots of things by chance.
      // Dividing by the size of their subject list keeps them from crowding out closer matches.
      similarity /= Math.sqrt(Math.max(c.byKey.size, 15) / 15);

      const popularity = 1 - c.rank / pool.length; // small boost for well-known books
      let score = similarity + popularity * 0.5;
      if (!c.cover_i) score *= 0.6; // books with no cover are usually obscure and hard to find
      if (!age && isFiction(c) !== myFiction) score *= 0.25; // novel vs. nonfiction mismatch

      // Age fit: for a picture book, favor books clearly tagged as picture books
      // (some older kids' books are tagged "picture books" only because of an illustrated edition).
      const pages = c.number_of_pages_median;
      if (age === "little") {
        const signs = littleSigns(c);
        score *= signs >= 2 ? 1 : signs === 1 ? 0.6 : 0.3;
        // Picture books are short. Long books here are usually novels with an illustrated edition.
        if (pages > 120) score *= 0.1;
        else if (pages > 72) score *= 0.5;
      }
      if (age === "kids" && pages > 450) score *= 0.3;
      if (age === "kids" && /romance|love stories/.test(rawSubjects(c).join("|"))) score *= 0.2;
      if (age === "kids" && littleSigns(c) >= 2) score *= 0.6; // chapter-book readers: fewer board books
      // Adult readers: no picture books, and kids' books only rarely.
      if (!age && (littleSigns(c) >= 2 || (pages && pages <= 64 && clearlyForKids(c)))) score *= 0.05;
      else if (!age && clearlyForKids(c)) score *= 0.4;

      // A real match shares 2+ subjects, or at least one fairly specific one.
      // Sharing only a broad subject that a quarter of all candidates have is just noise.
      const specific = sharedKeys.filter((k) => howCommon[k] <= pool.length * 0.25);
      const sameGenre = myGenres.size === 0 || [...genresOf(rawSubjects(c))].some((g) => myGenres.has(g));
      const goodMatch = sameGenre && (sharedKeys.length >= 2 || specific.length >= 1) &&
                        ageAppropriate(c, age, source);

      const shared = sharedKeys.map((k) => c.byKey.get(k));
      return { ...c, shared, score, goodMatch };
    })
    .filter((c) => c.goodMatch)
    .sort((a, b) => b.score - a.score);
}

// "Winnie-the-Pooh / The House at Pooh Corner" and "Winnie-the-Pooh" are the same book for us.
function titleKey(title) {
  return title.toLowerCase().split(/[:(/\[]/)[0].replace(/\./g, "")  // "A.B.C." -> "abc"
    .replace(/^(the|a|an) /, "").replace(/[^a-z0-9]+/g, " ").trim();
}

// Skip books readers can't easily find in English (e.g. only a Russian or Chinese edition).
function readableInEnglish(c) {
  if (/[\u0370-\u03ff\u0400-\u04ff\u0590-\u06ff\u0900-\u097f\u3040-\u30ff\u4e00-\u9fff\uac00-\ud7af]/.test(c.title)) return false;
  return !c.language || c.language.includes("eng");
}

function pickResults(book, scored, includeSameAuthor, limit = RESULTS_SHOWN) {
  const myAuthors = new Set(book.author_key || []);
  const myTitle = titleKey(book.title);
  const seenTitles = new Set([myTitle]);
  const perAuthor = {};
  const picked = [];

  for (const c of scored) {
    const authors = c.author_key || [];
    const sameAuthor = authors.some((a) => myAuthors.has(a));
    if (sameAuthor && !includeSameAuthor) continue;
    if (!readableInEnglish(c)) continue;

    // Skip other editions, box sets and duplicates of books already in the list.
    const tKey = titleKey(c.title);
    if (seenTitles.has(tKey) || (myTitle && tKey.includes(myTitle))) continue;

    // At most 2 books per author so one author doesn't take over the list.
    const mainAuthor = authors[0] || c.title;
    perAuthor[mainAuthor] = (perAuthor[mainAuthor] || 0) + 1;
    if (perAuthor[mainAuthor] > 2) continue;

    seenTitles.add(tKey);
    picked.push(c);
    if (picked.length >= limit) break;
  }
  return picked;
}

// ---------- Rendering ----------
const COVER_URL = (id, size) => `https://covers.openlibrary.org/b/id/${id}-${size}.jpg`;

// Cloth colors for books that have no cover image (picked from the title so it's always the same).
const CLOTH = [["#7a3e22", "#4a2414"], ["#2f4a3a", "#1b2c22"], ["#2c3e5c", "#1a2538"],
               ["#6b2f3f", "#3e1a25"], ["#8a6a2c", "#54401a"], ["#4b3b5e", "#2c2238"]];

function textEl(tag, className, text) {
  const el = document.createElement(tag);
  el.className = className;
  el.textContent = text;
  return el;
}

function authorText(book) {
  return (book.author_name || ["Unknown author"]).slice(0, 2).join(", ");
}

function coverEl(book, size = "M") {
  const wrap = document.createElement("div");
  wrap.className = "cover";

  if (book.cover_i) {
    wrap.classList.add("loading");
    const img = document.createElement("img");
    img.alt = `Cover of ${book.title}`;
    img.loading = "lazy";
    img.addEventListener("load", () => { img.classList.add("loaded"); wrap.classList.remove("loading"); });
    img.addEventListener("error", () => { img.remove(); wrap.classList.remove("loading"); wrap.append(plainCover(book)); });
    img.src = COVER_URL(book.cover_i, size);
    wrap.append(img);
  } else {
    wrap.append(plainCover(book));
  }
  return wrap;
}

function plainCover(book) {
  const hash = [...book.title].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) >>> 0, 7);
  const [c1, c2] = CLOTH[hash % CLOTH.length];
  const div = document.createElement("div");
  div.className = "no-cover";
  div.style.setProperty("--c1", c1);
  div.style.setProperty("--c2", c2);
  div.append(textEl("div", "nc-title", book.title), textEl("div", "nc-rule", ""),
             textEl("div", "nc-author", (book.author_name || [""])[0]));
  return div;
}

function metaEl(book) {
  const meta = textEl("div", "meta", authorText(book));
  if (book.first_publish_year) meta.append(textEl("span", "year", ` · ${book.first_publish_year}`));
  return meta;
}

function bookCard(book, index, { asButton = false, tags = [] } = {}) {
  // Search matches are buttons (click to choose); recommendations link to Open Library.
  const link = document.createElement(asButton ? "button" : "a");
  if (asButton) {
    link.type = "button";
  } else {
    link.href = `https://openlibrary.org${book.key}`;
    link.target = "_blank";
    link.rel = "noopener";
    link.title = "Open on Open Library";
  }
  link.append(coverEl(book), textEl("div", "title", book.title), metaEl(book));
  if (tags.length) {
    const tagBox = document.createElement("div");
    tagBox.className = "tags";
    for (const t of tags) tagBox.append(textEl("span", "tag", t));
    link.append(tagBox);
  }

  // Link cards get a "Save for later" bookmark button (from reading.js) on the cover.
  // It sits next to the link, not inside it, so clicking it doesn't open the page.
  let card = link;
  if (!asButton && typeof saveButtonFor === "function") {
    card = document.createElement("div");
    link.className = "card-link";
    card.append(link, saveButtonFor(book));
  }
  card.classList.add("card");
  card.style.setProperty("--i", index); // staggers the fade-in animation
  return card;
}

function skeletonCards(count) {
  return Array.from({ length: count }, (_, i) => {
    const card = document.createElement("div");
    card.className = "card skeleton";
    card.style.setProperty("--i", i);
    card.append(textEl("div", "cover", ""), textEl("div", "bar", ""), textEl("div", "bar short", ""));
    return card;
  });
}

function showStatus(msg) {
  statusEl.textContent = msg;
}

function renderMatches(books) {
  matchList.replaceChildren(...books.map((book, i) => {
    const card = bookCard(book, i, { asButton: true });
    card.addEventListener("click", () => recommendFor(book));
    return card;
  }));
  matchesSection.hidden = false;
}

function renderChosen(book, age = null) {
  const backdrop = document.createElement("div");
  backdrop.className = "backdrop";
  if (book.cover_i) backdrop.style.backgroundImage = `url(${COVER_URL(book.cover_i, "M")})`;

  const info = document.createElement("div");
  info.className = "info";
  info.append(textEl("div", "label", "Because you read"), textEl("div", "title", book.title), metaEl(book));
  if (age) info.append(textEl("div", "age-badge", `Showing: ${AGE_GROUPS[age].label}`));
  // "Add to my books" button (from reading.js)
  if (typeof logButtonFor === "function") info.append(document.createElement("br"), logButtonFor(book));

  chosenEl.replaceChildren(backdrop, coverEl(book), info);
}

function renderRecommendations() {
  // Ask for one extra book so we know whether "Show more" has anything left to show.
  const picks = pickResults(currentBook, lastScored, sameAuthorBox.checked, shownCount + 1);
  const visible = picks.slice(0, shownCount);
  const alreadyShown = recList.querySelectorAll(".card:not(.skeleton)").length;
  // Only animate the newly added cards, not the ones already on screen.
  recList.replaceChildren(...visible.map((b, i) =>
    bookCard(b, Math.max(0, i - alreadyShown), { tags: b.shared.slice(0, 3) })));
  $("show-more").hidden = picks.length <= shownCount;
  showStatus(visible.length ? "" : "No similar books found. Try another edition or book.");
}

// A row of other popular books by the same author (great for kids' series).
async function loadByAuthor(book, age) {
  const section = $("by-author");
  section.hidden = true;
  const authorKey = (book.author_key || [])[0];
  if (!authorKey) return;
  try {
    let docs = await searchOpenLibrary({ q: `author_key:${authorKey}`, sort: "readinglog", limit: 40 });
    if (currentBook?.key !== book.key) return; // the user already moved on to another book
    if (age === "little") docs = docs.filter((d) => !(d.number_of_pages_median > 80));
    // Some authors write for kids and adults (Roald Dahl wrote adult short stories too).
    const mine = rawSubjects(book).join("|");
    if (age) docs = docs.filter((d) => ageAppropriate(d, age, { violent: VIOLENT.test(mine), scary: SCARY.test(mine), grade: lowestGrade(book) }));
    const seen = new Set([titleKey(book.title)]);
    const books = docs.filter((d) => {
      const t = titleKey(d.title);
      if (d.key === book.key || seen.has(t) || !d.cover_i || !readableInEnglish(d)) return false;
      seen.add(t);
      return true;
    }).slice(0, 14);
    if (books.length === 0) return;
    $("by-author-name").textContent = book.author_name?.[0] || "this author";
    $("by-author-shelf").replaceChildren(...books.map((b, i) => bookCard(b, i)));
    section.hidden = false;
  } catch {
    // Not important enough to show an error; just leave the row hidden.
  }
}

// ---------- Recently read (saved in this browser) ----------
const RECENT_KEY = "nextread-recent";

function loadRecent() {
  try { return JSON.parse(localStorage.getItem(RECENT_KEY)) || []; }
  catch { return []; }
}

function saveRecent(book) {
  const list = loadRecent().filter((b) => b.key !== book.key);
  list.unshift(book);
  localStorage.setItem(RECENT_KEY, JSON.stringify(list.slice(0, 6)));
  renderRecent();
}

function renderRecent() {
  const list = loadRecent();
  $("recent").hidden = list.length === 0;
  $("recent-list").replaceChildren(...list.map((book) => {
    const btn = textEl("button", "", book.title);
    btn.type = "button";
    btn.addEventListener("click", () => recommendFor(book));
    return btn;
  }));
}

// ---------- Homepage ----------
const homeSection = $("home");
// Each genre is an Open Library search. The "-subject" parts leave out books that are
// tagged with the genre but don't really belong (e.g. Harry Potter is tagged "science fiction").
const GENRES = [
  ["Picture Books", '(subject:"picture books" OR subject:"board books") AND subject:"juvenile fiction"', 64],
  ["Early Readers", '(subject:"easy readers" OR subject:"readers (primary)" OR subject:"beginner readers") AND subject:"juvenile fiction"', 72],
  ["Fantasy", 'subject:"fantasy fiction" -subject:"science fiction"'],
  ["Mystery", 'subject:"mystery fiction" -subject:"wizards" -subject:"vampires"'],
  ["Romance", 'subject:"romance fiction" -subject:"classic literature" -subject:"tragedies"'],
  ["Sci-Fi", 'subject:"science fiction" -subject:"fantasy" -subject:"wizards" -subject:"horror tales"'],
  ["Thriller", 'subject:"suspense fiction" -subject:"tragedies"'],
  ["Horror", 'subject:"horror tales"'],
  ["Historical", 'subject:"historical fiction"'],
  ["Young Adult", 'subject:"young adult fiction"'],
  ["Biography", 'subject:"biography" -subject:"fiction" -subject:"national socialism"'],
  ["Self-Help", 'subject:"self-help techniques"'],
];
const shelfCache = {}; // so switching genres back and forth doesn't refetch

function homeCard(book, i) {
  // Clicking a homepage book treats it as "I read this" and shows similar books.
  const card = bookCard(book, i, { asButton: true });
  card.addEventListener("click", () => recommendFor(book));
  return card;
}

function fillShelf(shelf, books) {
  shelf.replaceChildren(...books.map(homeCard));
  if (books.length === 0) shelf.replaceChildren(textEl("p", "shelf-empty", "Couldn't load these books right now."));
}

async function loadTrending() {
  const shelf = $("trending-shelf");
  shelf.replaceChildren(...skeletonCards(8));
  try {
    const res = await fetch("https://openlibrary.org/trending/weekly.json?limit=40");
    if (!res.ok) throw new Error(res.status);
    const works = (await res.json()).works || [];
    fillShelf(shelf, varied(works.filter((w) => w.author_name)));
  } catch {
    fillShelf(shelf, []);
  }
}

// Keep a shelf varied: books with covers only, and at most 2 per author.
function varied(books, max = 16) {
  const perAuthor = {};
  return books.filter((b) => {
    if (!b.cover_i) return false;
    const author = (b.author_key || b.author_name || [b.title])[0];
    perAuthor[author] = (perAuthor[author] || 0) + 1;
    return perAuthor[author] <= 2;
  }).slice(0, max);
}

async function showGenre(label) {
  for (const chip of document.querySelectorAll(".chip")) {
    chip.setAttribute("aria-pressed", chip.textContent === label);
  }
  const shelf = $("genre-shelf");
  if (!shelfCache[label]) {
    shelf.replaceChildren(...skeletonCards(8));
    try {
      // An optional third value is a page limit, so kids' shelves only show short books.
      const [, query, maxPages] = GENRES.find(([l]) => l === label);
      let docs = await searchOpenLibrary({ q: query, sort: "readinglog", limit: 60 });
      if (maxPages) docs = docs.filter((d) => d.number_of_pages_median && d.number_of_pages_median <= maxPages);
      shelfCache[label] = varied(docs);
    } catch {
      return fillShelf(shelf, []);
    }
  }
  fillShelf(shelf, shelfCache[label]);
}

function renderGenreChips() {
  $("genre-chips").replaceChildren(...GENRES.map(([label]) => {
    const chip = textEl("button", "chip", label);
    chip.type = "button";
    chip.addEventListener("click", () => showGenre(label));
    return chip;
  }));
}

async function loadPickedForYou() {
  const recent = loadRecent();
  const section = $("for-you");
  if (recent.length === 0) { section.hidden = true; return; }

  let lastBook = recent[0];
  try { lastBook = await withSubjects(lastBook); } catch { /* use what we have */ }
  const subjects = cleanSubjects(lastBook.subject).slice(0, MAX_QUERY_SUBJECTS);
  if (subjects.length === 0) { section.hidden = true; return; }

  section.hidden = false;
  $("for-you-because").textContent = lastBook.title;
  const shelf = $("for-you-shelf");
  shelf.replaceChildren(...skeletonCards(8));
  try {
    const alreadyRead = new Set(recent.map((b) => b.key));
    const age = await detectAge(lastBook);
    const scored = scoreCandidates(lastBook, await findBooksWithSubjects(subjects, age), age)
      .filter((b) => !alreadyRead.has(b.key));
    const picks = pickResults(lastBook, scored, false);
    shelf.replaceChildren(...picks.map((b, i) => bookCard(b, i, { tags: b.shared.slice(0, 2) })));
  } catch {
    section.hidden = true;
  }
}

function goHome() {
  currentBook = null;
  matchesSection.hidden = true;
  resultsSection.hidden = true;
  homeSection.hidden = false;
  showStatus("");
  input.value = "";
  loadPickedForYou(); // refresh in case they just looked up a new book
  window.scrollTo({ top: 0, behavior: "smooth" });
}

// Makes sure a book has enough subjects to find similar books.
// - Books from the trending list come without subjects, so we look them up.
// - Open Library often has duplicate entries for the same book, and some have almost
//   no subjects (one "The ABC Murders" entry only has "English Literature"). In that
//   case we borrow subjects from the other entries with the same title and author.
const ENOUGH_SUBJECTS = 6;

async function withSubjects(book) {
  if (!book.subject) {
    const [full] = await searchOpenLibrary({ q: `key:"${book.key}"`, limit: 1 });
    book = { ...book, ...(full || {}) };
  }
  if (cleanSubjects(book.subject).length >= ENOUGH_SUBJECTS) return book;

  const others = await searchOpenLibrary({ q: `title:"${book.title.replace(/"/g, "")}"`, sort: "readinglog", limit: 10 });
  const myTitle = titleKey(book.title);
  const sameTitle = others.filter((d) => d.key !== book.key && titleKey(d.title) === myTitle);
  // Prefer entries by the same author. Junk entries sometimes list the wrong author,
  // so if none match, use the most-read entry with the same title instead.
  const sameAuthor = sameTitle.filter((d) => (d.author_key || []).some((a) => (book.author_key || []).includes(a)));
  const donors = sameAuthor.length ? sameAuthor : sameTitle.slice(0, 1);
  const subjects = new Set(book.subject || []);
  for (const d of donors) (d.subject || []).forEach((x) => subjects.add(x));
  return { ...book, subject: [...subjects] };
}

// ---------- Main flow ----------
async function recommendFor(book) {
  currentBook = book;
  shownCount = RESULTS_SHOWN;
  $("show-more").hidden = true;
  $("by-author").hidden = true;
  homeSection.hidden = true;
  matchesSection.hidden = true;
  resultsSection.hidden = false;
  renderChosen(book);
  recList.replaceChildren(...skeletonCards(8));
  showStatus("Finding similar books…");
  window.scrollTo({ top: 0, behavior: "smooth" });

  try {
    book = await withSubjects(book);
    currentBook = book;
    const subjects = cleanSubjects(book.subject).slice(0, MAX_QUERY_SUBJECTS);
    if (subjects.length === 0) {
      lastScored = [];
      recList.replaceChildren();
      showStatus("Open Library doesn't list any subjects for this book, so we can't find similar ones. Try a different edition.");
      return;
    }
    const age = await detectAge(book);
    renderChosen(book, age);
    loadByAuthor(book, age); // runs alongside the main search
    const candidates = await findBooksWithSubjects(subjects, age);
    lastScored = scoreCandidates(book, candidates, age);
    recList.replaceChildren();
    renderRecommendations();
    saveRecent({ // store only what we need to re-run recommendations later
      key: book.key, title: book.title, author_name: book.author_name,
      author_key: book.author_key, cover_i: book.cover_i, subject: book.subject,
      number_of_pages_median: book.number_of_pages_median,
    });
  } catch (err) {
    recList.replaceChildren();
    showStatus(`Something went wrong talking to Open Library (${err.message}). Please try again.`);
  }
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const text = input.value.trim();
  if (!text) return;

  homeSection.hidden = true;
  resultsSection.hidden = true;
  matchList.replaceChildren(...skeletonCards(4));
  matchesSection.hidden = false;
  showStatus("Searching the shelves…");
  try {
    const books = await findBooks(text);
    if (books.length === 0) {
      matchesSection.hidden = true;
      showStatus("No books found. Check the spelling or try the author's name too.");
      return;
    }
    showStatus("");
    renderMatches(books);
  } catch (err) {
    matchesSection.hidden = true;
    showStatus(`Something went wrong talking to Open Library (${err.message}). Please try again.`);
  }
});

sameAuthorBox.addEventListener("change", () => {
  if (!currentBook) return;
  recList.replaceChildren();
  renderRecommendations();
});

$("show-more").addEventListener("click", () => {
  shownCount += RESULTS_SHOWN;
  renderRecommendations();
});

for (const el of document.querySelectorAll("[data-home]")) {
  el.addEventListener("click", (e) => { e.preventDefault(); goHome(); });
}

renderRecent();
renderGenreChips();
loadPickedForYou();
loadTrending();
showGenre(GENRES[0][0]);
