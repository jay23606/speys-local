// Task file operations: they work with a line number + the expected text and return null if the file changed in
// the meantime (Claude sessions and git write to the same files). No disk or network, text only. The page sees LF;
// a file keeps the line ending it had. Indent is counted in characters here and on the page, so a tab is one.
const BOX_RE = /^(\s*[-*] )\[( |x|X)\] ?(.*)$/;
const TAGS_RE = /((?:\s+#[\p{L}\p{N}_-]+)+)\s*$/u;
const TAG_RE = /^[\p{L}\p{N}_-]+$/u;
const DONE_TAG_RE = /^bitti-\d{4}-\d{2}-\d{2}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export const toLf = (content) => content.replace(/\r\n/g, "\n");
const lines = (content) => content.split(/\r?\n/);
const eolOf = (content) => /\r?\n/.exec(content)?.[0] ?? "\n";

const indent = (s) => s.length - s.replace(/^[ \t]+/, "").length;
const oneLine = (s) => String(s ?? "").replace(/\s+/g, " ").trim();
const isTask = (s, line, text) =>
  Number.isInteger(line) && line >= 0 && line < s.length && s[line] === text && BOX_RE.test(String(text ?? ""));

function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function splitTags(text) {
  const m = TAGS_RE.exec(text);
  if (!m || m.index === 0) return [text, []];
  return [text.slice(0, m.index).trimEnd(), m[1].trim().split(/\s+/).map((t) => t.slice(1))];
}

/** A task block: its line + the more indented lines below it (without trailing blanks). */
function blockEnd(s, start) {
  const own = indent(s[start]);
  let end = start + 1;
  while (end < s.length) {
    const t = s[end];
    if (t.trim() && (indent(t) <= own || t.startsWith("#") || t.trim() === "---")) break;
    end++;
  }
  while (end > start + 1 && !s[end - 1].trim()) end--;
  return end;
}

const shift = (block, by) =>
  block.map((t) => (!t.trim() ? t : by >= 0 ? " ".repeat(by) + t : t.slice(Math.min(-by, indent(t)))));

function prepend(content, block) {
  const s = lines(content);
  let at = s.findIndex((t) => t.startsWith("# ")) + 1;
  while (at < s.length && !s[at].trim()) at++;
  s.splice(at, 0, ...block);
  return s.join(eolOf(content));
}

const buildLine = (m, body, tags) => `${m[1]}[${m[2]}] ` + [body, ...tags.map((t) => `#${t}`)].join(" ");

function withDoneDate(line, date) {
  const m = BOX_RE.exec(line);
  const [body, tags] = splitTags(m[3]);
  return buildLine(m, body, [...tags.filter((t) => !DONE_TAG_RE.test(t)), ...(date ? [`bitti-${date}`] : [])]);
}

export function applyOp(content, op, finishDate = false) {
  const s = lines(content);
  switch (op?.action) {
    case "toggle": {
      if (!isTask(s, op.line, op.text)) return null;
      s[op.line] = op.text.replace(/\[( |x|X)\]/, op.done ? "[x]" : "[ ]");
      if (finishDate && indent(s[op.line]) === 0) s[op.line] = withDoneDate(s[op.line], op.done ? today() : null);
      break;
    }
    case "date": {
      const date = op.date;
      if (!finishDate || !isTask(s, op.line, op.text) || (date && !DATE_RE.test(date))) return null;
      s[op.line] = withDoneDate(op.text, date || null);
      break;
    }
    case "edit": {
      const text = oneLine(op.newText);
      if (!isTask(s, op.line, op.text) || !text) return null;
      const m = BOX_RE.exec(op.text);
      s[op.line] = buildLine(m, text, splitTags(m[3])[1]);
      break;
    }
    case "tags": {
      if (!isTask(s, op.line, op.text)) return null;
      const m = BOX_RE.exec(op.text);
      const tags = (Array.isArray(op.tags) ? op.tags : []).filter((t) => TAG_RE.test(String(t)));
      s[op.line] = buildLine(m, splitTags(m[3])[0], tags);
      break;
    }
    case "delete": {
      if (!isTask(s, op.line, op.text)) return null;
      s.splice(op.line, blockEnd(s, op.line) - op.line);
      break;
    }
    case "add": {
      const text = oneLine(op.newText);
      if (!text) return null;
      if (op.parentLine == null) return prepend(content, [`- [ ] ${text}`]);
      if (!isTask(s, op.parentLine, op.parentText)) return null;
      s.splice(blockEnd(s, op.parentLine), 0, `${" ".repeat(indent(s[op.parentLine]) + 2)}- [ ] ${text}`);
      break;
    }
    case "move":
    case "nest": {
      const targetLine = op.action === "move" ? op.targetLine : op.parentLine;
      const targetText = op.action === "move" ? op.targetText : op.parentText;
      if (!isTask(s, op.line, op.text) || !isTask(s, targetLine, targetText)) return null;
      const start = op.line;
      if (start === targetLine) return content;
      const end = blockEnd(s, start);
      if (start < targetLine && targetLine < end) return null; // into its own subtask
      let by, at;
      if (op.action === "move") {
        by = indent(s[targetLine]) - indent(s[start]);
        at = op.position === "before" ? targetLine : blockEnd(s, targetLine);
      } else {
        by = indent(s[targetLine]) + 2 - indent(s[start]);
        at = blockEnd(s, targetLine);
      }
      const block = shift(s.slice(start, end), by);
      s.splice(start, end - start);
      if (at > start) at -= end - start;
      s.splice(at, 0, ...block);
      break;
    }
    default:
      return null;
  }
  return s.join(eolOf(content));
}

/** Moves a task with its subtasks to the top of another list; returns the two changed texts, or null. */
export function moveBetween(source, target, line, text) {
  const s = lines(source);
  if (!isTask(s, line, text)) return null;
  const end = blockEnd(s, line);
  const own = indent(s[line]);
  const block = s.slice(line, end).map((t) => t.slice(Math.min(own, indent(t))));
  s.splice(line, end - line);
  return { source: s.join(eolOf(source)), target: prepend(target, block) };
}
