# Blind test plan

**Question:** Do students like the AI's book recommendations better than tag matching?

**Prediction (hypothesis):** ____________________________________________

## How it works

Next Read has two ways to pick books:
- **Tag matching:** finds books that share Open Library subject tags with your book.
- **AI:** a small AI model reads each book's description and finds books with a similar meaning.

In the blind test, a student sees **List A** and **List B**, 6 books each. One list comes from each method. Which one is the AI is picked at random every time, and the cards look the same, so the student can't tell. The student picks the list they'd rather read from, or "About the same".

This is a fair test because:
- Both lists come from the same safe set of books (same age and content checks).
- The student doesn't know which list is which (blind).
- The side is random, so "always picking A" can't favor one method.

## Steps

1. Get permission from the teacher or librarian (see the librarian interview).
2. Use one laptop. Open https://annawang.net/book/ and check the **Blind test** page shows 0 votes.
3. For each student:
   1. Ask them for a book they read and liked. Search for it on **Discover** and pick it.
   2. Click **🧪 Blind test: compare both**. The first time, the AI downloads (about 23 MB), so wait for it.
   3. Type their tester number (1, 2, 3… **no names**).
   4. Let them look at both lists, then click their choice.
4. Aim for at least 20 students. More is better.
5. On the **Blind test** page, click **Download votes (CSV)** and keep the file.

## What to record

The CSV has: time, tester number, book, age group, which list they picked, which list was the AI, the winner (ai / tags / same), and how many books were in both lists.

## Results

| | Votes | % |
|---|---|---|
| Picked the AI | | |
| Picked tag matching | | |
| About the same | | |
| **Total** | | |

**Did the result match my prediction?**

**Anything surprising?** (For example: did one method win for picture books but not for chapter books?)

## Limits to mention

- Small number of students.
- Some books have short or missing descriptions on Open Library. Then the AI only has the title, first sentence and topics.
- Students might pick the list with covers they like, not the books.
