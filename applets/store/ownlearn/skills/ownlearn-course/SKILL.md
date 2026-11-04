---
name: ownlearn-course
description: Build the ownlearn course for this repository - a practice copy of the repo's own database tables and lessons rewritten on them - then verify it. Use when the user wants ownlearn to teach SQL (or another module) with their own schema, or says "make my ownlearn course".
---

# Make the ownlearn course for this repo

You are writing the **repo layer** of an ownlearn course: lessons that teach the general concepts
on a practice copy of this repo's own tables. Everything you write stays on this machine.

1. **Read the rules first:** `docs/course.md` in the ownlearn package (the path is also in the
   `rules` field of step 2). Follow every rule there; they are the user's.
2. **Get the context:** run `npx ownlearn context <repo dir>` (or `node <ownlearn>/bin/ownlearn.js
   context <dir>`). It prints JSON per module: `write` (where the course file goes), `tables`
   (from the migrations, with the comment above each), `topicsUsed`, and `lessons` (the general
   lessons with their default task, solution, examples and visual). The JSON can be large: read
   it with `jq` or in parts rather than all at once.
3. **Choose 4–6 related tables** that say what the product does. Use the table comments
   (`purpose`) and the topics the repo uses to decide. Tell the user in one line which tables you
   picked and why.
4. **Write the practice schema** in SQLite with made-up rows (rules in `docs/course.md`: types,
   foreign keys, NULLs, repeated values, an unmatched row; never real data).
5. **Rewrite every general lesson** (both packages, `sql-basics` and `sql-advanced`) on those tables: task (plain words in the user's language, plus English;
   the page shows the answer's columns under it),
   hint, solution, examples (one per thing the lesson mentions, each with a note), and the visual
   of the lesson's kind; for the first lesson (`how`), its `anatomy`. Keep the general lesson's
   concept and order; only the data changes.
6. **Your own queries:** pick 3–6 long queries from the repo that do real work (rules under
   "Your own queries" in `docs/course.md`) and write a `yours` lesson for each: the code as it is,
   its purpose, a walk through its parts with why, and a SQLite practice version to write.
7. **Write the file** to the `write` path from step 2.
8. **Verify:** run `npx ownlearn verify <repo dir>`. Fix every problem it lists and run it again
   until it prints `course OK`. Do not stop at a course that fails.
9. Tell the user to open it with `npx ownlearn <repo dir>` (refresh the page if it is open).

Never send the repo, its schema or the course anywhere; never copy rows from a real database,
seed file or fixture into the practice data.
