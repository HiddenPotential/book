# Next Read

Tell it the last book you read and it suggests what to read next. Works great for picture books and early readers too.

**Try it:** https://annawang.net/book/

## What it does

- **Discover:** search for a book you read and get similar books, plus trending books, genre shelves, and "More by this author". Or press **🎲 Surprise me** for a random book for your age. Pick books by **matching tags** or with the **AI**, which reads book descriptions and finds similar meaning. The AI runs in your browser, so it's free and private.
- **Reading timer:** time your reading, set a daily goal, keep a streak going, and grow a reading pet.
- **My books:** a log of what you're reading, what you've finished, and what you want to read, with star ratings, a reading calendar, and badges.
- **Testing:** an automatic safety check of kids' recommendations, and a blind test where students pick between an AI list and a tag-matching list without knowing which is which. Votes can be downloaded as a CSV.
- **About:** how it works, kid safety, privacy, and a dated list of changes.

Book data comes from [Open Library](https://openlibrary.org) (free, no API key). Your reading log is saved in your own browser, and you can download a backup from the My books page.

## Run it on your computer

It's plain HTML, CSS, and JavaScript, so there's nothing to install:

```bash
python3 -m http.server 8000
```

Then open http://localhost:8000.

## Files

- `index.html`: the page
- `style.css`: the main look
- `scrapbook.css`: the scrapbook theme (remove its `<link>` in `index.html` for the plain look)
- `app.js`: book search and recommendations
- `reading.js`: reading timer and book log
- `pet.js`: the reading pet and prize screen
- `ai.js`: the AI recommender (Transformers.js + all-MiniLM-L6-v2)
- `blindtest.js`: the blind test and its results
- `safetycheck.js`: automatic safety check of kids' recommendations
- `random.js`: "Surprise me", a random book for your age
- `CHANGELOG.md`: dated log of every change
- `research/`: librarian interview guide and blind test plan
