// Walks a repository and records where each of a module's topics appears. How a file is split
// into statements and how a statement is described comes from the module (modules/<id>/).
// Nothing leaves the machine: the result is a JSON map in ~/.ownlearn/<repo>/.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const SKIP = new Set(["node_modules", ".git", "dist", "build", ".next", ".turbo", ".cache", "vendor", "coverage", ".encore"]);
const MAX_EXAMPLES = 40;
const SNIPPET_LINES = 16;

function* walk(dir, test) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (SKIP.has(entry.name) || entry.name.startsWith(".")) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      yield* walk(full, test);
    } else if (test.test(entry.name)) {
      yield full;
    }
  }
}

/** The lines around a match: the whole statement if short, else a window around the match. */
function snippet(stmt, matchIndex) {
  let lines = stmt.text.split("\n");
  let hit = stmt.text.slice(0, matchIndex).split("\n").length - 1;
  let first = stmt.startLine;
  while (lines.length > 1 && !lines[0].trim()) { lines.shift(); hit--; first++; }
  while (lines.length > 1 && !lines[lines.length - 1].trim()) lines.pop();
  let from = 0, to = lines.length;
  if (lines.length > SNIPPET_LINES) {
    from = Math.max(0, Math.min(hit - 5, lines.length - SNIPPET_LINES));
    to = from + SNIPPET_LINES;
  }
  // drop common indentation so the snippet reads cleanly
  const shown = lines.slice(from, to);
  const widths = shown.filter((l) => l.trim()).map((l) => l.match(/^\s*/)[0].length);
  const indent = widths.length ? Math.min(...widths) : 0;
  return { lines: shown.map((l) => l.slice(indent)), hit: hit - from, firstLine: first + from, cut: from > 0 || to < lines.length };
}

/** [file, text] for every file of the module under root. */
export function readSources(root, module) {
  const sources = [];
  for (const file of walk(root, module.files)) {
    try {
      if (statSync(file).size <= 2_000_000) sources.push([file, readFileSync(file, "utf8")]);
    } catch {
      // unreadable file: skip
    }
  }
  return sources;
}

export function scan(root, module) {
  const map = { root, module: module.name, scannedAt: new Date().toISOString(), files: 0, statements: 0, topics: {} };
  for (const t of module.topics) map.topics[t.id] = { count: 0, files: [], examples: [] };
  const sources = readSources(root, module);
  const ctx = module.context(sources);
  for (const [file, source] of sources) {
    map.files++;
    const rel = relative(root, file);
    const note = module.fileNote(source);
    for (const stmt of module.split(source)) {
      map.statements++;
      for (const t of module.topics) {
        const m = t.pattern.exec(stmt.code);
        if (!m) continue;
        const entry = map.topics[t.id];
        entry.count++;
        if (!entry.files.includes(rel)) entry.files.push(rel);
        if (entry.examples.length < MAX_EXAMPLES || Math.random() < MAX_EXAMPLES / entry.count) {
          const ex = { file: rel, ...snippet(stmt, m.index), ...module.describe(stmt, ctx, note), match: m[0].trim() };
          // the question variant needs the statement around the match, keep a compact copy
          ex.context = stmt.code.slice(Math.max(0, m.index - 2000), m.index + 2000);
          if (entry.examples.length < MAX_EXAMPLES) entry.examples.push(ex);
          else entry.examples[Math.floor(Math.random() * MAX_EXAMPLES)] = ex;
        }
      }
    }
  }
  return map;
}
