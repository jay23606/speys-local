// SQL-specific reading of source files: statements, what each one is, why it exists.
// The generic scanner (../../scan.js) asks a module for these through split / context / describe.

/**
 * Splits SQL into statements at `;` outside strings, comments and dollar-quoted bodies
 * ($$ … $$, $fn$ … $fn$), so a whole CREATE FUNCTION stays one statement.
 * Returns { text, code, startLine } where `code` has comments blanked out (for matching).
 */
export function split(source) {
  const out = [];
  let start = 0, i = 0, line = 1, startLine = 1;
  let code = "";
  const n = source.length;
  const push = (end) => {
    const text = source.slice(start, end);
    if (text.trim()) out.push({ text, code, startLine });
    code = "";
  };
  while (i < n) {
    const c = source[i];
    if (c === "\n") { line++; code += c; i++; continue; }
    if (c === "-" && source[i + 1] === "-") {
      while (i < n && source[i] !== "\n") { code += " "; i++; }
      continue;
    }
    if (c === "/" && source[i + 1] === "*") {
      const end = source.indexOf("*/", i + 2);
      const stop = end === -1 ? n : end + 2;
      for (; i < stop; i++) { if (source[i] === "\n") line++; code += source[i] === "\n" ? "\n" : " "; }
      continue;
    }
    if (c === "'") {
      code += c; i++;
      while (i < n) {
        if (source[i] === "'" && source[i + 1] === "'") { code += "''"; i += 2; continue; }
        if (source[i] === "\n") line++;
        code += source[i];
        if (source[i++] === "'") break;
      }
      continue;
    }
    if (c === "$") {
      const tag = /^\$[A-Za-z_]*\$/.exec(source.slice(i, i + 64));
      if (tag) {
        const end = source.indexOf(tag[0], i + tag[0].length);
        const stop = end === -1 ? n : end + tag[0].length;
        for (; i < stop; i++) { if (source[i] === "\n") line++; code += source[i]; }
        continue;
      }
    }
    if (c === ";") {
      code += c; i++;
      push(i);
      start = i;
      startLine = line; // the line the next statement's text begins on
      continue;
    }
    code += c; i++;
  }
  push(n);
  return out;
}

const KEYWORDS = new Set(["select", "lateral", "only", "unnest", "jsonb_array_elements", "jsonb_each", "generate_series", "new", "old", "excluded", "public"]);

/**
 * What a statement is and why it exists: its object ("function crm.save_stages"), the comment
 * written right above it (most migrations explain themselves there) and the tables it touches.
 */
const clean = (lines) => lines.map((l) => l.trim().replace(/^--+\s?/, "")).filter((l) => !/^[-=─—\s]*$/.test(l)).join("\n").trim();

/** Comment blocks of a text: runs of `--` lines. */
function commentBlocks(text) {
  const blocks = [];
  let cur = [];
  for (const line of text.split("\n")) {
    if (line.trim().startsWith("--")) cur.push(line);
    else { if (cur.length) blocks.push(clean(cur)); cur = []; }
  }
  if (cur.length) blocks.push(clean(cur));
  return blocks.filter((b) => b.length > 12);
}

export function describe(stmt, known, fileNote) {
  // The block right above the statement explains it; else the first comment inside it
  // (a function body often starts with one); else the note at the top of the file.
  const firstCode = stmt.text.split("\n").findIndex((l) => l.trim() && !l.trim().startsWith("--"));
  const above = commentBlocks(stmt.text.split("\n").slice(0, Math.max(0, firstCode)).join("\n"));
  const inside = commentBlocks(stmt.text.split("\n").slice(Math.max(0, firstCode)).join("\n"));
  const purpose = (above.at(-1) || inside[0] || null)?.slice(0, 600) ?? null;
  const create = /\bCREATE\s+(?:OR\s+REPLACE\s+)?(?:UNIQUE\s+)?(FUNCTION|TABLE|INDEX|VIEW|MATERIALIZED\s+VIEW|TRIGGER|POLICY|TYPE)\s+(?:IF\s+NOT\s+EXISTS\s+)?([\w."]+)/i.exec(stmt.code);
  const other = /\b(INSERT\s+INTO|UPDATE|DELETE\s+FROM|ALTER\s+TABLE(?:\s+IF\s+EXISTS)?|SELECT)\s+([\w."]+)?/i.exec(stmt.code);
  const object = create
    ? { kind: create[1].toLowerCase().replace(/\s+/g, " "), name: create[2].replace(/"/g, "") }
    : other ? { kind: other[1].toLowerCase().replace(/\s+/g, " ").replace(/ if exists/, ""), name: other[1].toUpperCase() === "SELECT" ? "" : (other[2] || "").replace(/"/g, "") } : null;
  const tables = new Set();
  for (const m of stmt.code.matchAll(/\b(?:FROM|JOIN|INTO|UPDATE|REFERENCES|ON\s+TABLE)\s+([a-z_][\w]*(?:\.[a-z_][\w]*)?)/gi)) {
    const name = m[1].toLowerCase();
    // PL/pgSQL `SELECT … INTO variable` looks like a table; only names created somewhere count
    if (!KEYWORDS.has(name) && known.has(name) && name !== object?.name?.toLowerCase()) tables.add(name);
    if (tables.size >= 8) break;
  }
  return { object, purpose, purposeFrom: purpose ? null : fileNote ? "file" : null, fileNote: purpose ? null : fileNote, tables: [...tables] };
}


/** Every table created anywhere, by full and by bare name, to tell tables from variables. */
export function context(sources) {
  const known = new Set();
  for (const [, source] of sources) {
    for (const m of source.matchAll(/\bCREATE\s+(?:UNLOGGED\s+)?(?:TABLE|VIEW|MATERIALIZED\s+VIEW)\s+(?:IF\s+NOT\s+EXISTS\s+)?([\w."]+)/gi)) {
      const name = m[1].replace(/"/g, "").toLowerCase();
      known.add(name);
      known.add(name.split(".").pop());
    }
  }
  return known;
}

/** The note at the top of a file: the first comment block in its first 40 lines. */
export const fileNote = (source) => commentBlocks(source.split("\n").slice(0, 40).join("\n"))[0]?.slice(0, 600) ?? null;

/**
 * The tables of a repo as its migrations create them: name, columns (name + type), references,
 * and the comment above the CREATE TABLE. Postgres DDL is read loosely; it is context for Claude
 * when it builds a practice copy of these tables, not a parser.
 */
export function schemaSummary(sources, relative) {
  const tables = new Map();
  for (const [file, source] of sources) {
    for (const stmt of split(source)) {
      const m = /\bCREATE\s+(?:UNLOGGED\s+)?TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?([\w."]+)\s*\(/i.exec(stmt.code);
      if (m) {
        const name = m[1].replace(/"/g, "");
        // the column list ends at the parenthesis that closes the one after the name
        const parts = [];
        let depth = 0, cur = "";
        for (const ch of stmt.code.slice(m.index + m[0].length)) {
          if (ch === "(") depth++;
          if (ch === ")" && depth-- === 0) break;
          if (ch === "," && depth === 0) { parts.push(cur); cur = ""; } else cur += ch;
        }
        parts.push(cur);
        const columns = [], refs = [];
        for (const raw of parts) {
          const p = raw.trim().replace(/\s+/g, " ");
          if (!p || /^(PRIMARY|FOREIGN|CONSTRAINT|UNIQUE|CHECK|EXCLUDE)\b/i.test(p)) continue;
          const c = /^"?(\w+)"?\s+([\w\[\]]+(?:\s*\([^)]*\))?(?:\s+(?:WITH(?:OUT)?\s+TIME\s+ZONE|VARYING|PRECISION))?)/i.exec(p);
          if (!c) continue;
          columns.push({ name: c[1], type: c[2].toLowerCase() });
          const r = /\bREFERENCES\s+([\w."]+)/i.exec(p);
          if (r) refs.push({ column: c[1], table: r[1].replace(/"/g, "") });
        }
        const purpose = describe(stmt, new Set(), null).purpose;
        if (!tables.has(name)) tables.set(name, { name, file: relative(file), columns, refs, purpose });
      }
      const alter = /\bALTER\s+TABLE\s+(?:IF\s+EXISTS\s+)?(?:ONLY\s+)?([\w."]+)\s+ADD\s+COLUMN\s+(?:IF\s+NOT\s+EXISTS\s+)?"?(\w+)"?\s+([\w\[\]]+)/gi;
      for (const a of stmt.code.matchAll(alter)) {
        const t = tables.get(a[1].replace(/"/g, ""));
        if (t && !t.columns.some((c) => c.name === a[2])) t.columns.push({ name: a[2], type: a[3].toLowerCase() });
      }
    }
  }
  return [...tables.values()];
}
