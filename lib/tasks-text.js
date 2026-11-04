// Task line format (same rules as applets/store/tasks/tasks.js).
export const BOX_RE = /^(\s*[-*] )\[( |x|X)\] ?(.*)$/;
const TAGS_RE = /((?:\s+#[\p{L}\p{N}_-]+)+)\s*$/u;

export function splitTags(text) {
  const m = TAGS_RE.exec(text);
  if (!m || m.index === 0) return [text, []];
  return [text.slice(0, m.index).trimEnd(), m[1].trim().split(/\s+/).map((t) => t.slice(1))];
}
