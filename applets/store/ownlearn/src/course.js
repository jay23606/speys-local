// The two layers of a course.
//
// General layer (ships with ownlearn, the same for everyone): the module's lessons — order, titles,
// explanations, rules, slips, visual kinds — and a neutral practice database.
//
// Repo layer (made on the user's machine, never shipped): course-<module>.json in ~/.ownlearn/<repo>/,
// written by Claude after reading the repo (docs/course.md, skills/ownlearn-course/). It brings a
// practice copy of the repo's own tables and rewrites each lesson's task, examples, solution and
// visual on them. Anything it leaves out falls back to the general layer.
import { existsSync } from "node:fs";
import { join } from "node:path";
import { readJson } from "./learn.js";

export const courseFile = (dir, mod) => join(dir, `course-${mod.id}.json`);

const OVERRIDES = ["task", "hint", "solution", "ordered", "examples", "visual", "anatomy"];

/**
 * The course to teach: every general lesson, the repo layer's fields on top where it rewrote one,
 * and the repo layer's own lessons (`yours`) in the package that has none of its own. Each lesson
 * carries the practice database it runs on (`schema`) and where it comes from (`source`): a lesson
 * the course does not cover keeps the general rows, so a package can be half yours, half sample.
 */
export function loadCourse(dir, mod) {
  const file = courseFile(dir, mod);
  const own = existsSync(file) ? readJson(file, null) : null;
  const has = !!(own?.schema && own.lessons);
  const lessons = mod.lessons.map((l) => {
    const o = has && own.lessons[l.id];
    if (!o) return { ...l, schema: mod.schema, source: "default" };
    const merged = { ...l, schema: own.schema, source: "repo" };
    for (const k of OVERRIDES) if (o[k] !== undefined) merged[k] = o[k];
    if (o.examples) delete merged.example;
    return merged;
  });
  const pkg = mod.packages?.find((p) => p.repo)?.id;
  if (pkg) for (const y of own?.yours || []) lessons.push({ ...y, pkg, yours: true, schema: y.schema || own.schema, source: "repo" });
  return { lessons, source: has ? "repo" : "default", generatedAt: own?.generatedAt || null, tables: own?.tables || [] };
}

/**
 * Checks the repo layer the way the browser will use it: each practice database builds, every
 * example and visual query runs, every solution runs and returns rows. Returns a list of problems.
 */
export function verifyCourse(mod, course) {
  const problems = [];
  const built = new Map();
  for (const l of course.lessons.filter((x) => x.source === "repo")) {
    const where = (part) => `${l.id} ${part}`;
    if (!built.has(l.schema)) {
      try {
        mod.tableInfo(l.schema);
        built.set(l.schema, true);
      } catch (e) {
        built.set(l.schema, false);
        problems.push(`${where("schema")}: ${e.message}`);
      }
    }
    if (!built.get(l.schema)) continue;
    const run = (sql, part) => {
      const r = mod.check(l.schema, sql);
      if (r.error) problems.push(`${where(part)}: ${r.error}`);
      return r;
    };
    if (l.read) {
      // a lesson to read: its one query must run and return rows, and every line says why it is there
      const r = run(l.anatomy.lines.map((x) => x.sql).join("\n"), "anatomy");
      if (!r.error && r.total === 0) problems.push(`${where("anatomy")}: returns no rows`);
      for (const x of l.anatomy.lines) if (!x.why) problems.push(`${where("anatomy")}: line without a why: ${x.sql}`);
      continue;
    }
    if (l.yours) {
      for (const k of ["title", "purpose", "task"]) if (!l[k]) problems.push(`${where(k)}: missing`);
      if (!l.from?.file || !l.from?.code) problems.push(`${where("from")}: needs file, line and code`);
      if (!l.walk?.length) problems.push(`${where("walk")}: missing (the parts of the query, each with why)`);
    }
    const sol = run(l.solution, "solution");
    if (!sol.error && sol.total === 0) problems.push(`${where("solution")}: returns no rows; the task has nothing to find`);
    for (const [n, e] of (l.examples || (l.example ? [{ sql: l.example }] : [])).entries()) run(e.sql, `example ${n + 1}`);
    const v = l.visual;
    if (!v && !l.yours) problems.push(`${where("visual")}: missing (every lesson has one)`);
    else if (v) for (const k of ["source", "result", "left", "right"]) if (v[k]) run(v[k], `visual.${k}`);
    if (v?.kind === "filter" && v.source && !/\b_keep\b/.test(v.source)) problems.push(`${where("visual")}: filter needs a _keep column`);
    if (/"[^"]*"\s*(?:,|\)|$)|=\s*"/m.test(l.solution)) problems.push(`${where("solution")}: text in double quotes`);
  }
  return problems;
}
