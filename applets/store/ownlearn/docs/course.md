# Making a course from your repo

ownlearn has two layers.

| | general layer | repo layer |
|---|---|---|
| what | concepts, lesson order, explanations, common slips, visual kinds, a neutral practice database | a practice copy of **your** tables and lessons rewritten on them |
| where | `src/modules/<module>/` (ships with ownlearn) | `~/.ownlearn/<repo>-<hash>/course-<module>.json` (your machine only) |
| made by | ownlearn | Claude, on your machine, after reading your repo |

The general layer is the same for everyone. The repo layer is what makes the course about your
code: the tasks ask about your tables, the examples run on rows that look like yours, the
visuals show your data moving. It never leaves your machine and is never committed.

## How it is made

1. `ownlearn context <dir>` prints JSON: your tables (from your migrations), the topics your code
   uses, and every general lesson with its default task, solution, examples and visual.
2. Claude reads it, picks the tables that teach best and writes `course-<module>.json`
   (format below), following the rules below.
3. `ownlearn verify <dir>` builds the practice database and runs every query in the course.
   Claude fixes what it reports and runs it again until it says `course OK`.
4. `ownlearn <dir>` shows the course. Without a course file the general one is shown.

In Claude Code: `/ownlearn-course` (skill in `skills/ownlearn-course/`).

## Packages

The SQL lessons come in packages, each its own page (`#/lessons/<id>`):

| package | what | lessons from |
|---|---|---|
| `sql-basics` | SQL basics: from the first SELECT to CASE WHEN | general, rewritten on your tables by the course |
| `sql-advanced` | subqueries, EXISTS, WITH, window functions, FILTER | general, rewritten on your tables by the course |
| `sql-yours` | long queries from your own code, part by part, then you write them | only the course (`yours`) |

A lesson the course does not rewrite keeps the general sample rows, so a package can be partly
yours. Cover a whole package rather than half of it.

## Rules for lessons

These hold for the general layer and for every course Claude writes.

- **Start from the very basics, in the order of the general lessons.** One concept per lesson.
- **Every lesson has a visual** ("What happens"): a before → after picture of what the concept
  does to rows, drawn from the practice data. Kinds: `select`, `filter`, `sort`, `group`,
  `aggregate`, `join` (with `outer: true` for LEFT JOIN), `transform`. Text alone does not explain
  GROUP BY; the picture does.
- **Everything a lesson mentions has its own example**, with a one-line note above it. A lesson
  on COUNT, AVG and MAX shows each one. Symbols in the syntax are explained (`COUNT(*)`: the `*` is
  the whole row, not a column; `COUNT(column)` skips NULLs).
- **Examples show their result right away**; there is no "try it" button.
- **Queries are written one clause per line**: `SELECT`, `FROM`, `WHERE` on their own lines,
  `AND` / `OR` indented. Text in single quotes, never double quotes.
- **Hints give the way, not the answer.** The page shows the order to write a query in (what a row
  of the answer shows → which table → join → which rows → groups → which groups → order → how many)
  and the first hint walks the task's steps as questions; the steps come from the solution's
  clauses. The lesson's own `hint` is the last hint, shown only after that, so it may be specific.
- **The learner writes the task query.** The solution is shown next to it on request, never over it.
- **The task must have an answer**: its solution returns at least one row, and the task text says
  which columns to return.
- Tasks are short and concrete, **in plain words** in the learner's language: "Every deal's title
  and the name of its pipeline", not "`title` of `deals` and `name` of `pipelines`" (too technical)
  nor "Write a query that joins…". Under the sentence the page shows the answer's columns as they
  are in the schema (`deals.title`, `pipelines.name`; a calculated column only as its kind, "a count", "a new value"…), taken from
  the solution, so the task needs no column names. Values the query compares with go in quotes as
  they are in the data ("won ('won') deals").
- **The first lesson (`how`) is read, not written**: one query, line by line, each line with why it
  is there in the words of the goal ("we want `name` and `district`, so…"), then its answer rows
  and the steps in order. In a course it is `anatomy`: `goal` and `lines` [{ `sql`, `why` }]; the
  query must return rows.

## Rules for the practice copy of your tables

- **Pick 4–6 tables** that relate to each other and say something about the product (orders and
  customers, deals and activities…), not every table. Keep the names readable: drop the schema
  prefix (`crm.deals` → `deals`) unless two tables would clash.
- **SQLite, not Postgres.** `uuid` → `INTEGER PRIMARY KEY` (or `TEXT`), `jsonb` / arrays → `TEXT`,
  `timestamptz` / `date` → `TEXT` (`'2026-10-21'`), `boolean` → `INTEGER`. Keep foreign keys
  (`REFERENCES`) so the diagram can draw them.
- **Made-up rows, never real data.** 6–15 rows per table, believable for the product, with a few
  NULLs, repeated values (so GROUP BY has groups) and at least one row without a match (so LEFT
  JOIN has something to show). Do not copy names, emails, phone numbers or anything from a real
  database or seed file.
- Write the rows in the learner's language when the product is in that language.

## Course file

`course-sql.json`:

```json
{
  "module": "sql",
  "generatedAt": "2026-10-21",
  "tables": [{ "practice": "deals", "from": "crm.deals", "why": "sales pipeline: one row per customer" }],
  "schema": "CREATE TABLE …; INSERT INTO … VALUES …;",
  "lessons": {
    "where": {
      "task": { "en": "Titles of deals in the 'won' stage.", "tr": "Kazanılmış (won) kayıtların başlıkları." },
      "hint": { "en": "WHERE stage = 'won'", "tr": "WHERE stage = 'won'" },
      "solution": "SELECT title\nFROM deals\nWHERE stage = 'won';",
      "examples": [{ "sql": "SELECT title\nFROM deals\nWHERE next_action_at IS NOT NULL;", "note": { "en": "…", "tr": "…" } }],
      "visual": { "kind": "filter", "source": "SELECT title, stage, stage = 'won' AS _keep FROM deals", "note": { "en": "WHERE stage = 'won'", "tr": "WHERE stage = 'won'" } }
    }
  }
}
```

- `lessons` is keyed by the general lesson ids from `ownlearn context`. A lesson left out keeps
  its general version on the general sample database.
- A lesson's `explain` and `title` stay general; the course only replaces `task`, `hint`,
  `solution`, `ordered`, `examples`, `visual` and (for `how`) `anatomy`.
- Visual fields by kind, all queries on the practice schema:
  - `select`: `source`, `pick` (column names)
  - `filter`: `source` with a `_keep` column (1 kept, 0 dropped), `note`
  - `sort`: `source`, `result` (sorted), `limit`
  - `group`: `source` (ordered by the key), `key`, `result` (grouped; optional `_keep` for HAVING), `note`
  - `aggregate`: `source`, `column`, `result` (one row of aggregates)
  - `join`: `left`, `right`, `leftKey`, `rightKey`, `result`, `outer` for LEFT JOIN
  - `transform`: `source`, `result`, `column` (index of the changed column)

### Your own queries (`yours`)

`yours` is a list of lessons for the `sql-yours` package, one per long query from the repo. Pick
3–6 queries that do real work for the product and teach something (joins with conditions in ON,
CTEs, window functions, grouped subqueries…); a CRUD one-liner is not one.

```json
"yours": [{
  "id": "yours-week-plan",
  "title": { "en": "Chores: the week's plan", "tr": "Ev işleri: haftanın planı" },
  "from": { "file": "ev-isleri/migrations/functions.up.sql", "line": 418, "code": "SELECT … (the query exactly as it is in the file)" },
  "purpose": { "en": "What the query is for, in product words: which screen, what it shows.", "tr": "…" },
  "walk": [{ "code": "lines 418–433 exactly as in the file", "why": { "en": "Why this part is there, in the words of what the screen needs.", "tr": "…" } }],
  "practice": { "en": "How the practice copy differs from the real query (fixed dates, no LATERAL in SQLite…).", "tr": "…" },
  "schema": "CREATE TABLE …; INSERT INTO …;   (only the tables this query needs, made-up rows)",
  "task": { "en": "The practice version in plain words: which rows, which columns, in what order.", "tr": "…" },
  "hint": { "en": "…", "tr": "…" },
  "solution": "the practice version of the query, SQLite, one clause per line",
  "ordered": true
}]
```

- `from.code` and every `walk[].code` are copied from the file unchanged, with the real line
  number; the page shows them as they are. `walk` goes through the whole query in order.
- `why` says why the part is there in terms of the goal ("the card asks again when…", "a chore
  without an owner must stay in the list, so LEFT JOIN"), not what the keyword means in general.
- The practice version keeps the shape of the real query and drops what SQLite cannot run
  (functions, `LATERAL`, arrays, jsonb); `practice` says what changed. Its `schema` is its own:
  only the tables it needs, made-up rows that make every part of the query matter (a row the ON
  condition drops, a group with several rows, a tie in the ordering…).

