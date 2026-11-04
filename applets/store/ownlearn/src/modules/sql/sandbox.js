// Runs a lesson query on a fresh in-memory SQLite database and compares it with the solution.
// Every run starts from the same seed, so a DELETE in one try can't spoil the next.
import { execFile } from "node:child_process";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

const MAX_ROWS = 100;

// The practice database lives in memory: nothing here may touch a file, whatever a request sends.
const FILE_ACCESS = /\b(attach|vacuum)\b/i;

function run(schema, sql) {
  if (FILE_ACCESS.test(sql)) throw new Error("This statement is not available in practice.");
  const db = new DatabaseSync(":memory:");
  try {
    db.exec(schema);
    const stmt = db.prepare(sql.trim());
    stmt.setReturnArrays(true);
    const rows = stmt.all();
    return { columns: stmt.columns().map((c) => c.name), rows };
  } finally {
    db.close();
  }
}

/**
 * The answer's columns, as the task needs them: `table.column` where a column comes straight from a
 * table; for a column the query calculates, only what kind of value it is (count, sum…, or "value"
 * for CASE, COALESCE…): writing the expression would give the answer away.
 */
export function wants(schema, sql) {
  const db = new DatabaseSync(":memory:");
  try {
    db.exec(schema);
    return db.prepare(sql.trim()).columns().map((c) => (c.table && c.column ? `${c.table}.${c.column}`
      : { calc: calcKind(sql, c.name), name: /^[a-z_]\w*$/i.test(c.name) ? c.name : null }));
  } catch {
    return [];
  } finally {
    db.close();
  }
}

/** What kind of value a calculated column is, from its expression or from the expression it names (`… AS n`). */
function calcKind(sql, name) {
  const fn = (t) => /^\s*(count|sum|avg|min|max|row_number|rank|dense_rank)\s*\(/i.exec(t)?.[1].toLowerCase();
  const esc = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const named = new RegExp(`\\b(count|sum|avg|min|max|row_number|rank|dense_rank)\\s*\\([^()]*(?:\\([^()]*\\)[^()]*)*\\)[^,]*?\\bAS\\s+${esc}\\b`, "i").exec(sql);
  const k = fn(name) || named?.[1].toLowerCase();
  return k === "dense_rank" || k === "rank" || k === "row_number" ? "rank" : k || "value";
}

/** Values as they would print: 9 and 9.0 are equal, text stays text. */
const norm = (v) => (v === null || v === undefined ? null : typeof v === "number" || typeof v === "bigint" ? Number(v) : String(v));
const key = (row) => JSON.stringify(row.map(norm));

export function tableInfo(schema) {
  const db = new DatabaseSync(":memory:");
  try {
    db.exec(schema);
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY rowid").all();
    return tables.map(({ name }) => ({
      name,
      columns: db.prepare(`PRAGMA table_info(${name})`).all().map((c) => ({ name: c.name, type: c.type, pk: !!c.pk })),
      refs: db.prepare(`PRAGMA foreign_key_list(${name})`).all().map((f) => ({ from: f.from, table: f.table, to: f.to })),
      rows: Number(db.prepare(`SELECT COUNT(*) AS n FROM ${name}`).get().n),
      // the practice rows themselves, so the learner can look inside a table, not only at its shape
      data: (() => {
        const st = db.prepare(`SELECT * FROM ${name}`);
        st.setReturnArrays(true);
        return st.all().slice(0, MAX_ROWS).map((r) => r.map(norm));
      })(),
    }));
  } finally {
    db.close();
  }
}

/**
 * `check` for a query someone typed: it runs in a process of its own, so one that never ends costs a few seconds
 * of that process and the dashboard keeps answering.
 */
export function checkLimited(schema, sql, lesson, ms = 3000) {
  return new Promise((done) => {
    const child = execFile(process.execPath, ["--max-old-space-size=256", join(import.meta.dirname, "sandbox-child.js")],
      { timeout: ms, killSignal: "SIGKILL", maxBuffer: 5 * 1024 * 1024 }, (err, stdout) => {
        done(err ? { ok: false, limit: true, error: "This query took too long or got too big, so it was stopped." } : JSON.parse(stdout));
      });
    child.stdin.on("error", () => {}); // the process can be gone before it has read the query
    child.stdin.end(JSON.stringify({ schema, sql, lesson: lesson ? { solution: lesson.solution, ordered: lesson.ordered } : null }));
  });
}

/**
 * Runs `sql`; with a lesson, also checks it. The check looks at values, not column names:
 * `COUNT(*)` and `COUNT(*) AS n` are both fine. Row order only counts when the lesson says so.
 */
export function check(schema, sql, lesson) {
  let mine;
  try {
    mine = run(schema, sql);
  } catch (e) {
    return { ok: false, error: String(e.message || e).replace(/^.*?: /, "") };
  }
  const shown = { columns: mine.columns, rows: mine.rows.slice(0, MAX_ROWS).map((r) => r.map(norm)), total: mine.rows.length };
  if (!lesson) return { ...shown, ok: null };
  const want = run(schema, lesson.solution);
  const reasons = [];
  if (mine.columns.length !== want.columns.length) reasons.push({ code: "columns", got: mine.columns.length, want: want.columns.length });
  if (mine.rows.length !== want.rows.length) reasons.push({ code: "rows", got: mine.rows.length, want: want.rows.length });
  if (!reasons.length) {
    const a = mine.rows.map(key), b = want.rows.map(key);
    const same = (x, y) => x.length === y.length && x.every((v, i) => v === y[i]);
    if (!same([...a].sort(), [...b].sort())) reasons.push({ code: "values" });
    else if (lesson.ordered && !same(a, b)) reasons.push({ code: "order" });
  }
  return { ...shown, ok: !reasons.length, reasons };
}
