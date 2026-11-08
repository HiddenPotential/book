# Next Read

Tell it the last book you read and it suggests what to read next. Works great for picture books and early readers too.

**Try it:** https://annawang.net/book/

## What it does

- **Discover:** search for a book you read and get similar books, plus trending books, genre shelves, and "More by this author".
- **Reading timer:** time your reading, set a daily goal, and keep a streak going.
- **My books:** a log of what you're reading, what you've finished, and what you want to read, with star ratings, a reading calendar, and badges.

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
