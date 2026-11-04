#!/usr/bin/env node
// ownlearn — learn from your own code.
//
//   ownlearn [dir]          scan the repo and open the lessons in the browser
//   ownlearn scan [dir]     print what each module found
//   ownlearn context [dir]  JSON for Claude: your tables, the topics you use, the general lessons
//   ownlearn verify [dir]   check the course Claude made for this repo (docs/course.md)
//
// Options: --port 4792  --lang en|tr  --no-open
// A repo gets every module whose files it has (today: SQL). Each module brings lessons (write
// it yourself, checked on a practice database), a map of your code, a daily review and a notebook.
import { execFile, execFileSync } from "node:child_process";
import { join, resolve } from "node:path";
import { dataDir, writeJson } from "../src/learn.js";
import { readSources, scan } from "../src/scan.js";
import { courseFile, loadCourse, verifyCourse } from "../src/course.js";

// node:sqlite (the SQL sandbox) prints an "experimental" warning on load; it is not for the user
process.removeAllListeners("warning");
const { modules } = await import("../src/modules/index.js");
const { serve } = await import("../src/server.js");

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  if (i === -1) return fallback;
  const v = args[i + 1];
  args.splice(i, 2);
  return v;
};
const port = Number(flag("port", 4792));

// LANG is often "C.UTF-8" in terminals; on macOS the real language is in AppleLocale
function systemLang() {
  const env = process.env.LC_ALL || process.env.LANG || "";
  if (/^[a-z]{2}_/i.test(env)) return env.slice(0, 2).toLowerCase();
  if (process.platform === "darwin") {
    try {
      return execFileSync("defaults", ["read", "-g", "AppleLocale"], { encoding: "utf8" }).slice(0, 2).toLowerCase();
    } catch {
      // no AppleLocale: fall through
    }
  }
  return (Intl.DateTimeFormat().resolvedOptions().locale || "en").slice(0, 2);
}
const lang = flag("lang", systemLang() === "tr" ? "tr" : "en");
const noOpen = args.includes("--no-open") && args.splice(args.indexOf("--no-open"), 1);

const command = ["scan", "context", "verify"].includes(args[0]) ? args.shift() : "learn";
const root = resolve(args[0] || ".");

const scanned = modules.map((mod) => ({ mod, map: scan(root, mod) })).filter(({ map }) => map.files > 0);
for (const { mod, map } of scanned) writeJson(join(dataDir(root), `map-${mod.id}.json`), map);

if (command === "context") {
  // What Claude needs to build this repo's course: everything the general layer has, plus the repo.
  const out = scanned.map(({ mod, map }) => ({
    module: mod.id,
    write: courseFile(dataDir(root), mod),
    rules: join(import.meta.dirname, "..", "docs", "course.md"),
    tables: mod.schemaSummary(readSources(root, mod), (f) => f.slice(root.length + 1)),
    topicsUsed: mod.topics.filter((t) => map.topics[t.id].count).map((t) => ({ id: t.id, name: t.name.en, count: map.topics[t.id].count })),
    packages: (mod.packages || []).map((p) => ({ id: p.id, title: p.title.en, repo: !!p.repo, about: p.about.en })),
    lessons: mod.lessons.map((l) => ({
      id: l.id, pkg: l.pkg, title: l.title.en, explain: l.explain.en, topic: l.topic || null, ordered: !!l.ordered,
      ...(l.read
        ? { read: true, default: { anatomy: l.anatomy } }
        : { visualKind: l.visual?.kind, default: { task: l.task, solution: l.solution, examples: l.examples || [{ sql: l.example }], visual: l.visual } }),
    })),
  }));
  // large output to a pipe: exit only after it is written
  process.stdout.write(JSON.stringify({ root, lang, modules: out }, null, 1) + "\n", () => process.exit(0));
}

if (command === "context") await new Promise(() => {}); // the write callback exits

if (command === "verify") {
  let bad = 0;
  for (const { mod } of scanned) {
    const course = loadCourse(dataDir(root), mod);
    if (course.source !== "repo") { console.log(`${mod.name}: no course yet (${courseFile(dataDir(root), mod)})`); continue; }
    const problems = verifyCourse(mod, course);
    bad += problems.length;
    console.log(problems.length ? `${mod.name}: ${problems.length} problem(s)\n` + problems.map((p) => "  - " + p).join("\n") : `${mod.name}: course OK`);
  }
  process.exit(bad ? 1 : 0);
}

if (command === "scan") {
  console.log(root);
  for (const { mod, map } of scanned) {
    console.log(`\n${mod.name}: ${map.files} files, ${map.statements} statements`);
    for (const t of mod.topics) {
      const m = map.topics[t.id];
      console.log(`  ${(t.name[lang] || t.name.en).padEnd(34)} ${String(m.count).padStart(6)}  ${m.files.length} files`);
    }
  }
  if (!scanned.length) console.log(`\nNo files for any module (${modules.map((m) => m.name).join(", ")}).`);
  process.exit(0);
}

if (!scanned.length) {
  console.error(`No files for any module (${modules.map((m) => m.name).join(", ")}) in ${root}.`);
  process.exit(1);
}
serve({ root, scanned, port, lang });
const url = `http://localhost:${port}`;
console.log(`ownlearn · ${scanned.map(({ mod, map }) => `${mod.name} ${map.files} files`).join(" · ")} · ${url}`);
if (!noOpen) execFile(process.platform === "darwin" ? "open" : process.platform === "win32" ? "explorer" : "xdg-open", [url]);
