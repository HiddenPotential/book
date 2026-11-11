# Change log

A dated log of every change to Next Read. Newest first. Add an entry every time something changes.

## 2026-11-11: Double-check and polish

- **Safety fix:** if the author check failed (slow or offline internet), a lightly tagged kids' book was treated as an adult book, with no age filter. Now it plays it safe and treats it as a kids' or teen book.
- **Fixed:** clicking a genre button also un-highlighted the "Surprise me" age and kind buttons and the daily-goal buttons.
- **Fixed:** in "Surprise me", tapping a different age while rolling could label the book with the wrong age.
- **Backups now include everything:** your pet's name and kind, reader age, tags-or-AI choice, blind test votes and safety check results. Restoring checks every book and session, so a damaged file can't break the pages.
- **Fixed:** blind test and safety spreadsheets: a title or tester number starting with "=", "+", "-" or "@" could run as a formula in Excel.
- **Fixed:** one bad saved value could stop the reading pages from showing.
- **Looks:** a "mystery book" card in Surprise me before your first roll; long "Recently read" titles are shortened; on phones, the age and kind choices are one swipeable line each, the search box placeholder fits, the sticky notes are smaller, and the timer's book picker text fits; in dark mode, the salmon buttons have dark text so they're readable.

## 2026-11-11: Bug fixes for recommendations, the blind test and the reading timer

- **Fixed:** clicking a second book while the first was still loading could show the first book's results. The same happened with searches and the genre buttons (Horror highlighted, Fantasy books showing). Now a slower, older request is ignored once you've asked for something newer.
- **Fixed (blind test data):** pressing "Blind test" while a new book was loading compared the *previous* book's lists but saved the vote under the new book. The old lists are now cleared straight away, and the Blind test button waits until both new lists are ready.
- **Fixed:** pausing at night and pressing Finish the next morning counted the reading for the wrong day and broke the streak. The timer now remembers when each stretch of reading really happened, and splits reading that crosses midnight between the two days.
- **Fixed:** a timer left running overnight logged hours of "reading" (and made the pet royal at once). The timer now pauses itself after 2 hours and asks if you're still reading.
- **Added:** a ✕ button on each recent reading session, to delete one saved by mistake.
- **Fixed:** with the timer open in two tabs, the same session could be saved twice. Tabs now stay in sync.
- **Fixed:** "Start timer" on a book in My books switched the timer to that book even when it already had minutes for another book.
- **Fixed (AI):** if a book's description failed to load once (for example when offline), the AI remembered it as blank forever, which made its picks worse. Failed lookups are now tried again, and old blank ones were cleared.

## 2026-11-11: Surprise me, a random book for your age

- **Added:** "Surprise me" at the top of the Discover page. Pick an age (0–5, 6–8, 9–12, Teens, Adults) and, if you like, a kind of book (funny, animals, adventure, mystery, fantasy, friendship). Then roll for one random book, with its cover, a short description, "Find books like this" and "Save to Want to read". The site remembers your age.
- **How it picks:** it jumps to a random spot among the most popular books for that age, so picks are good, well-known books, and different every time.
- **Safety:** kids' ages use the same age and content checks as recommendations, plus no romance for young kids.
- **Fixed during testing:** *The Eternal Ones*, a teen romance, came up for ages 6–8. Its only "chapter books" tag was a New York Times bestseller-list label. Ages 6–8 now need a real early-reader tag.

## 2026-11-11: Automatic safety check (for the Presidential SI Challenge)

- **Added:** an automatic safety check on the Testing page (renamed from "Blind test"). It runs 18 popular kids' books, from *The Gruffalo* to *Holes*, through Next Read and checks every recommendation with its own simple rules: murder, horror, grown-up topics, reading level grade 7+, or no kids' tags. It also runs each book with the age filter turned off for comparison. Results can be downloaded as a CSV.
- **First results:** with no age filter, 132 of 205 picks had problems. With tag matching, 0 of 198. With the AI, 0 of 216.
- **Found:** the filter can be too strict for some books (*Dog Man* got only 1 tag-matching recommendation). Next step: fix that without letting adult books through.

## 2026-11-11: Better designs for the new pages

- **Blind test:** the two lists are now notebook pages with big "A" and "B" stamps. The vote buttons stay at the bottom of the screen, so you can vote without scrolling. After voting, each list is stamped "AI" or "Tags" and the one you picked is outlined.
- **Blind test results:** a bar chart of which list students picked, numbered step cards, and a bookworm picture when there are no votes yet.
- **About page:** a picture comparing tags and AI, a before-and-after picture of the Encyclopedia Brown bug fix with real book covers, checkmark lists, and a timeline of changes. Text now sits on the notebook lines.
- **Recommendations:** the "Matching tags / AI" choice is now a clear two-option switch.
- **Phones:** the page links in the top bar stay on one line you can swipe, so the bar takes up half as much of the screen.

## 2026-11-10: AI recommender and blind test

- **Added:** an AI recommender that runs in the browser. A small model (all-MiniLM-L6-v2, about 23 MB) reads each book's description and finds books with a similar meaning. It's free, needs no account or API key, and the descriptions never go to an AI company.
- **Safety:** the AI only re-orders books that already passed the age and content checks, so it can't bring adult books back for kids.
- **Added:** a blind test. A student sees two lists of 6 books (List A and List B). One is from the AI and one from tag matching, chosen at random, and the student picks the one they'd rather read from. Votes are saved in the browser and can be downloaded as a CSV.
- **Added:** an About page explaining both methods, the kid-safety checks, the privacy features and this change log.
- **Added:** `research/` folder with a librarian interview guide and a blind test plan.
- **Added:** a pet chooser. Your reading pet can be a dragon, kitty, bunny, owl or fox.

## 2026-11-09: Reading pet and new pictures

- **Added:** a reading pet. Every minute of reading is 1 treat. The pet hatches from an egg and grows through 7 stages, and saving reading time shows a prize screen.
- **Added:** hand-drawn pictures beside the search box, a book that flips pages on the timer, a bookworm for empty shelves, and a browser-tab icon.
- **Fixed:** searching "Wonder" found *The Wonderful Wizard of Oz* instead of *Wonder*.
- **Fixed:** the total reading time spilled onto two lines on the sticky notes.

## 2026-11-08: Kids no longer get adult books

- **Bug:** kids who read *Encyclopedia Brown* were getting *Murder on the Orient Express*, *A Study in Scarlet* and *Crooked House*. *The Westing Game* got Fear Street horror. *Wonder* got teen romances.
- **Cause:** many adult books have one kids' edition, so Open Library tags them "juvenile". The site saw a single kids' tag and treated the book as a kids' book.
- **Fix:**
  - A book counts as a kids' book only if it has several kids' tags, or kids' tags make up a big share of its tags. Real kids' books have lots; adult classics have one or two.
  - Reading levels ("Reading level-Grade 9", "Grades 4-6", "Ages 8-12") are checked. Kids don't get books for grade 7 and up.
  - Murder, horror and grown-up topics are blocked for kids. Scary books appear only if the kid's own book is scary.
  - A new teen level, and an author check for books with too few tags.
- **Result:** *Encyclopedia Brown* now gets Enola Holmes, the Hardy Boys and Nancy Drew.

## 2026-11-08: First version

- Book recommendations from Open Library based on the last book you read, using subject tags.
- Picture books and early readers only get picture books back.
- Homepage with trending books, genre shelves and "Picked for you".
- Reading timer with a daily goal, a book log (reading, want to read, finished), star ratings, a reading calendar, badges, and backup/restore.
- Published at https://annawang.net/book/
